import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { computeAvailableSlots, collectBusyBlocks, type BusyBlock } from '@/lib/availability'
import { toTime } from '@/lib/herbe/recordUtils'
import { isRateLimited } from '@/lib/rateLimit'
import type { AvailabilityWindow } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Rate limit
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateLimitKey = `avail:${token}:${clientIp}`
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many requests, try again later' }, { status: 429 })
  }

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

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
    return NextResponse.json({ error: 'Valid dateFrom and dateTo required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'dateFrom must be before dateTo' }, { status: 400 })
  }
  const daysDiff = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)
  if (daysDiff > 90) {
    return NextResponse.json({ error: 'Date range cannot exceed 90 days' }, { status: 400 })
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
    `SELECT t.id, t.name, t.duration_minutes, t.availability_windows, t.buffer_minutes, t.custom_fields, t.allow_holidays
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

  // 5. Collect busy blocks from all calendar sources
  const busyByDate = await collectBusyBlocks(personCodes, link.ownerEmail, accountId, dateFrom, dateTo, hiddenCalendarsSet)

  // Debug: log busy blocks for troubleshooting
  for (const [d, blocks] of busyByDate) {
    console.log(`[availability] ${d}: ${blocks.length} busy blocks:`, blocks.map(b => `${b.start}-${b.end}`).join(', '))
  }

  // 5a. Also add existing confirmed bookings as busy
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
      const existing = busyByDate.get(date)
      if (existing) existing.push({ start: startTime, end: endTime })
      else busyByDate.set(date, [{ start: startTime, end: endTime }])
    }
  } catch (e) {
    console.warn('[availability] bookings query failed:', String(e))
  }

  // 6. Compute slots per day
  const slots: Record<string, { start: string; end: string }[]> = {}
  const current = new Date(dateFrom)
  const end = new Date(dateTo)

  // Holiday blocking
  const holidayDates = new Set<string>()
  if (!template.allow_holidays) {
    try {
      const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
      const countryMap = await getPersonsHolidayCountries(personCodes, accountId)
      const countryCodes = [...new Set(countryMap.values())]
      if (countryCodes.length > 0) {
        const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)
        for (const holidayDate of holidays.keys()) {
          holidayDates.add(holidayDate)
        }
      }
    } catch (e) {
      console.warn('[availability] holiday check failed:', String(e))
    }
  }

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10)
    if (holidayDates.has(dateStr)) {
      current.setDate(current.getDate() + 1)
      continue
    }
    const dayBusy = busyByDate.get(dateStr) ?? []
    const daySlots = computeAvailableSlots(dateStr, windows, dayBusy, durationMinutes, bufferMinutes)
    if (daySlots.length > 0) {
      slots[dateStr] = daySlots
    }
    current.setDate(current.getDate() + 1)
  }

  // 7. Return response (include debug info temporarily)
  const debugBusy: Record<string, string[]> = {}
  for (const [d, blocks] of busyByDate) {
    debugBusy[d] = blocks.map(b => `${b.start}-${b.end}`)
  }
  return NextResponse.json(
    {
      slots,
      template: {
        name: template.name,
        duration_minutes: durationMinutes,
        custom_fields: customFields,
      },
      _debug: { personCodes, ownerEmail: link.ownerEmail, accountId, busyBlocks: debugBusy, errors: (busyByDate as any)._debugErrors ?? [] },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
