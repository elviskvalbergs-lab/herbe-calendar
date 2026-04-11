import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { computeAvailableSlots, collectBusyBlocks } from '@/lib/availability'
import { executeBooking } from '@/lib/bookingExecutor'
import { isRateLimited } from '@/lib/rateLimit'
import type { AvailabilityWindow, TemplateTargets } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Rate limit
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateLimitKey = `book:${token}:${clientIp}`
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many requests, try again later' }, { status: 429 })
  }

  // Parse request body
  let body: {
    templateId: string
    date: string
    time: string
    bookerEmail: string
    fieldValues: Record<string, string>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { templateId, date, time, bookerEmail, fieldValues } = body
  if (!templateId || !date || !time || !bookerEmail) {
    return NextResponse.json(
      { error: 'templateId, date, time, and bookerEmail are required' },
      { status: 400 }
    )
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(bookerEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  // --- 1. Validate share link ---
  const { rows: linkRows } = await pool.query(
    `SELECT
      sl.id AS share_link_id,
      sl.booking_enabled,
      sl.expires_at,
      sl.password_hash IS NOT NULL AS "hasPassword",
      f.person_codes AS "personCodes",
      f.user_email AS "ownerEmail",
      f.account_id AS "accountId"
    FROM favorite_share_links sl
    JOIN user_favorites f ON f.id = sl.favorite_id
    WHERE sl.token = $1`,
    [token]
  )

  if (linkRows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = linkRows[0]

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  if (!link.booking_enabled) {
    return NextResponse.json({ error: 'Booking not enabled on this link' }, { status: 403 })
  }

  if (link.hasPassword) {
    return NextResponse.json({ error: 'Password-protected links cannot be used for booking' }, { status: 403 })
  }

  const shareLinkId: string = link.share_link_id
  const personCodes: string[] = link.personCodes ?? []
  const ownerEmail: string = link.ownerEmail
  const accountId: string = link.accountId ?? DEFAULT_ACCOUNT_ID

  // --- 2. Verify template is linked to share link ---
  const { rows: templateRows } = await pool.query(
    `SELECT bt.*
     FROM booking_templates bt
     JOIN share_link_templates slt ON slt.template_id = bt.id
     WHERE bt.id = $1 AND slt.share_link_id = $2 AND bt.active = true`,
    [templateId, shareLinkId]
  )

  if (templateRows.length === 0) {
    return NextResponse.json({ error: 'Template not found or not linked to this share link' }, { status: 404 })
  }

  const template = templateRows[0]
  const durationMinutes: number = template.duration_minutes
  const availabilityWindows: AvailabilityWindow[] = template.availability_windows ?? []
  const bufferMinutes: number = template.buffer_minutes ?? 0
  const targets: TemplateTargets = template.targets ?? {}

  // --- 2b. Holiday check ---
  if (!template.allow_holidays) {
    try {
      const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
      const countryMap = await getPersonsHolidayCountries(personCodes, accountId)
      const countryCodes = [...new Set(countryMap.values())]
      if (countryCodes.length > 0) {
        const holidays = await getHolidaysForRange(countryCodes, date, date)
        if (holidays.has(date)) {
          return NextResponse.json({ error: 'Cannot book on a public holiday' }, { status: 400 })
        }
      }
    } catch (e) {
      console.warn('[book] holiday check failed:', String(e))
    }
  }

  // --- 3. Re-check availability ---
  const busyByDate = await collectBusyBlocks(personCodes, ownerEmail, accountId, date, date)
  const busy = busyByDate.get(date) ?? []
  const availableSlots = computeAvailableSlots(date, availabilityWindows, busy, durationMinutes, bufferMinutes)

  const slotExists = availableSlots.some(s => s.start === time)
  if (!slotExists) {
    return NextResponse.json(
      { error: 'Requested time slot is no longer available' },
      { status: 409 }
    )
  }

  // --- 4. Execute booking ---
  const result = await executeBooking({
    template: {
      id: template.id,
      name: template.name,
      duration_minutes: durationMinutes,
      targets,
      allow_holidays: template.allow_holidays,
    },
    date,
    time,
    bookerEmail,
    fieldValues: fieldValues ?? {},
    personCodes,
    ownerEmail,
    accountId,
    shareLinkId,
  })

  return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
