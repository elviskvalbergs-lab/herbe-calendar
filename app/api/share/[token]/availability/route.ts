import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { emailForCode } from '@/lib/emailForCode'
import { computeAvailableSlots, type BusyBlock } from '@/lib/availability'
import type { AvailabilityWindow } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

function toTime(raw: string): string {
  return (raw ?? '').slice(0, 5)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { searchParams } = new URL(req.url)
  const templateId = searchParams.get('templateId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  // 1. Validate params
  if (!templateId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: 'templateId, dateFrom, and dateTo are required' },
      { status: 400 }
    )
  }

  // 2. Query share link
  const { rows } = await pool.query(
    `SELECT
      sl.id,
      sl.booking_enabled AS "bookingEnabled",
      sl.password_hash IS NOT NULL AS "hasPassword",
      f.person_codes AS "personCodes",
      f.hidden_calendars AS "hiddenCalendars",
      f.user_email AS "ownerEmail",
      f.account_id AS "accountId"
    FROM favorite_share_links sl
    JOIN user_favorites f ON f.id = sl.favorite_id
    WHERE sl.token = $1`,
    [token]
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = rows[0]

  // 3. Reject if not booking-enabled or password-protected
  if (!link.bookingEnabled) {
    return NextResponse.json({ error: 'Booking not enabled for this link' }, { status: 403 })
  }
  if (link.hasPassword) {
    return NextResponse.json({ error: 'Password-protected links do not support availability' }, { status: 403 })
  }

  const personCodes: string[] = link.personCodes ?? []
  const personSet = new Set(personCodes)
  const hiddenCalendarsSet = new Set<string>(link.hiddenCalendars ?? [])
  const accountId: string = link.accountId ?? DEFAULT_ACCOUNT_ID

  // 4. Verify template is linked to this share link and active
  const { rows: templateRows } = await pool.query(
    `SELECT t.id, t.name, t.duration_minutes, t.availability_windows, t.buffer_minutes, t.custom_fields
     FROM booking_templates t
     JOIN share_link_templates slt ON slt.template_id = t.id
     WHERE slt.share_link_id = $1 AND t.id = $2 AND t.active = true`,
    [link.id, templateId]
  )

  if (templateRows.length === 0) {
    return NextResponse.json({ error: 'Template not found or not linked' }, { status: 404 })
  }

  const template = templateRows[0]
  const durationMinutes: number = template.duration_minutes
  const bufferMinutes: number = template.buffer_minutes ?? 0
  const windows: AvailabilityWindow[] = template.availability_windows ?? []
  const customFields = template.custom_fields ?? []

  // 5. Collect busy blocks from all sources
  const busyByDate = new Map<string, BusyBlock[]>()

  function addBusy(date: string, block: BusyBlock) {
    const existing = busyByDate.get(date)
    if (existing) {
      existing.push(block)
    } else {
      busyByDate.set(date, [block])
    }
  }

  // 5a. Existing bookings
  try {
    const { rows: bookingRows } = await pool.query(
      `SELECT booked_date, booked_time, duration_minutes
       FROM bookings
       WHERE share_link_id = $1 AND status = 'confirmed'
         AND booked_date >= $2 AND booked_date <= $3`,
      [link.id, dateFrom, dateTo]
    )
    for (const b of bookingRows) {
      const date = typeof b.booked_date === 'string'
        ? b.booked_date.slice(0, 10)
        : new Date(b.booked_date).toISOString().slice(0, 10)
      const startTime = toTime(b.booked_time)
      const [h, m] = startTime.split(':').map(Number)
      const endMins = h * 60 + m + b.duration_minutes
      const endH = Math.floor(endMins / 60)
      const endM = endMins % 60
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
      addBusy(date, { start: startTime, end: endTime })
    }
  } catch (e) {
    console.warn('[availability] bookings query failed:', String(e))
  }

  // 5b. ERP activities
  if (!hiddenCalendarsSet.has('herbe')) {
    try {
      const connections = await getErpConnections(accountId)
      for (const conn of connections) {
        try {
          const raw = await herbeFetchAll(
            REGISTERS.activities,
            { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
            100,
            conn
          )
          const calendarRecords = raw.filter((r) => {
            const todoFlag = String((r as Record<string, unknown>)['TodoFlag'] ?? '0')
            return todoFlag === '0' || todoFlag === ''
          })
          for (const record of calendarRecords) {
            const r = record as Record<string, unknown>
            const mainPersons = String(r['MainPersons'] ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            const hasMatchingPerson = mainPersons.some((p) => personSet.has(p))
            if (hasMatchingPerson) {
              const date = String(r['TransDate'] ?? '')
              const startTime = toTime(String(r['StartTime'] ?? ''))
              const endTime = toTime(String(r['EndTime'] ?? ''))
              if (date && startTime && endTime) {
                addBusy(date, { start: startTime, end: endTime })
              }
            }
          }
        } catch (e) {
          console.warn(`[availability] ERP fetch failed for connection ${conn.id}:`, String(e))
        }
      }
    } catch (e) {
      console.warn('[availability] ERP connections lookup failed:', String(e))
    }
  }

  // 5c. Outlook calendar
  if (!hiddenCalendarsSet.has('outlook')) {
    const azureConfig = await getAzureConfig(accountId)
    if (azureConfig) {
      for (const code of personCodes) {
        try {
          const email = await emailForCode(code, accountId)
          if (!email) continue
          const startDt = `${dateFrom}T00:00:00`
          const endDt = `${dateTo}T23:59:59`
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$select=start,end`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of data.value ?? []) {
              const start = ev.start as { dateTime?: string } | undefined
              const end = ev.end as { dateTime?: string } | undefined
              const startStr = start?.dateTime ?? ''
              const endStr = end?.dateTime ?? ''
              const date = startStr.slice(0, 10)
              const startTime = startStr.slice(11, 16)
              const endTime = endStr.slice(11, 16)
              if (date && startTime && endTime) {
                addBusy(date, { start: startTime, end: endTime })
              }
            }
          }
        } catch (e) {
          console.warn(`[availability] Outlook fetch failed for ${code}:`, String(e))
        }
      }
    }
  }

  // 5d. Google calendar
  if (!hiddenCalendarsSet.has('google')) {
    const googleConfig = await getGoogleConfig(accountId)
    if (googleConfig) {
      for (const code of personCodes) {
        try {
          const email = await emailForCode(code, accountId)
          if (!email) continue
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            singleEvents: true,
            fields: 'items(start,end)',
          })
          for (const ev of res.data.items ?? []) {
            const startStr = ev.start?.dateTime ?? ''
            const endStr = ev.end?.dateTime ?? ''
            // Skip all-day events (no dateTime, only date)
            if (!startStr || !endStr) continue
            const date = startStr.slice(0, 10)
            const startTime = startStr.slice(11, 16)
            const endTime = endStr.slice(11, 16)
            if (date && startTime && endTime) {
              addBusy(date, { start: startTime, end: endTime })
            }
          }
        } catch (e) {
          console.warn(`[availability] Google fetch failed for ${code}:`, String(e))
        }
      }
    }
  }

  // 6. Compute slots per day
  const slots: Record<string, { start: string; end: string }[]> = {}
  const current = new Date(dateFrom)
  const end = new Date(dateTo)

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10)
    const dayBusy = busyByDate.get(dateStr) ?? []
    const daySlots = computeAvailableSlots(dateStr, windows, dayBusy, durationMinutes, bufferMinutes)
    if (daySlots.length > 0) {
      slots[dateStr] = daySlots
    }
    current.setDate(current.getDate() + 1)
  }

  // 7. Return response
  return NextResponse.json(
    {
      slots,
      template: {
        name: template.name,
        duration_minutes: durationMinutes,
        custom_fields: customFields,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
