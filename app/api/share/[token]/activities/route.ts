import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { deduplicateIcsAgainstGraph } from '@/lib/icsParser'
import { fetchIcsForPerson } from '@/lib/icsUtils'
import { fetchErpActivities } from '@/lib/herbe/recordUtils'
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents, mapGoogleEvent } from '@/lib/googleUtils'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
import { emailForCode } from '@/lib/emailForCode'
import { compare } from 'bcryptjs'
import { isRateLimited } from '@/lib/rateLimit'
import type { Activity, ShareVisibility } from '@/types'

function filterActivity(activity: Record<string, unknown>, visibility: ShareVisibility): Partial<Activity> {
  const base = {
    id: String(activity.id),
    source: activity.source as Activity['source'],
    personCode: String(activity.personCode),
    date: String(activity.date),
    timeFrom: String(activity.timeFrom),
    timeTo: String(activity.timeTo),
    isAllDay: activity.isAllDay as boolean | undefined,
    icsColor: activity.icsColor as string | undefined,
  }
  if (visibility === 'busy') {
    return { ...base, description: 'Busy' }
  }
  if (visibility === 'titles') {
    return { ...base, description: String(activity.description || ''), icsCalendarName: activity.icsCalendarName as string | undefined }
  }
  // 'full' — show everything except joinUrl, webLink
  return {
    ...base,
    description: String(activity.description || ''),
    activityTypeCode: activity.activityTypeCode as string | undefined,
    activityTypeName: activity.activityTypeName as string | undefined,
    projectName: activity.projectName as string | undefined,
    customerName: activity.customerName as string | undefined,
    mainPersons: activity.mainPersons as string[] | undefined,
    ccPersons: activity.ccPersons as string[] | undefined,
    planned: activity.planned as boolean | undefined,
    isExternal: activity.isExternal as boolean | undefined,
    icsCalendarName: activity.icsCalendarName as string | undefined,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  // Validate token
  const { rows } = await pool.query(
    `SELECT
      sl.id,
      sl.visibility,
      sl.expires_at,
      sl.password_hash IS NOT NULL AS "hasPassword",
      sl.password_hash AS "passwordHash",
      f.person_codes AS "personCodes",
      f.hidden_calendars AS "hiddenCalendars",
      f.user_email AS "ownerEmail",
      f.account_id AS "accountId",
      sl.booking_max_days AS "bookingMaxDays"
    FROM favorite_share_links sl
    JOIN user_favorites f ON f.id = sl.favorite_id
    WHERE sl.token = $1`,
    [token]
  )

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = rows[0]
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  // Password-protected: check x-share-auth header with rate limiting
  if (link.hasPassword) {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rateLimitKey = `share-pw:${token}:${clientIp}`
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json({ error: 'Too many attempts, try again later' }, { status: 429 })
    }
    const headerPassword = req.headers.get('x-share-auth') ?? ''
    const valid = await compare(headerPassword, link.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
    }
  }

  // Update access stats
  await pool.query(
    'UPDATE favorite_share_links SET last_accessed_at = NOW(), access_count = access_count + 1 WHERE id = $1',
    [link.id]
  )

  const personCodes: string[] = link.personCodes ?? []
  const personSet = new Set(personCodes)
  const hiddenCalendarsSet = new Set<string>(link.hiddenCalendars ?? [])
  const visibility: ShareVisibility = link.visibility
  const ownerEmail: string = link.ownerEmail
  const accountId: string = link.accountId ?? DEFAULT_ACCOUNT_ID

  // Cap date range to the link's max days setting
  const maxDays = link.bookingMaxDays ?? 60
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + maxDays)
  const maxDateStr = maxDate.toISOString().slice(0, 10)
  const cappedDateTo = dateTo > maxDateStr ? maxDateStr : dateTo

  const allActivities: (Record<string, unknown> | Activity)[] = []

  // Fetch Herbe activities from all ERP connections
  if (!hiddenCalendarsSet.has('herbe')) {
    const erpActivities = await fetchErpActivities(accountId, personCodes, dateFrom, cappedDateTo)
    allActivities.push(...erpActivities)
  }

  // Fetch Outlook/ICS activities per person
  for (const code of personCodes) {
    try {
      const email = await emailForCode(code, accountId)
      if (!email) continue

      // ICS feeds — query using ownerEmail (not session)
      let icsEvents: Record<string, unknown>[] = []
      try {
        const icsResult = await fetchIcsForPerson(ownerEmail, code, accountId, dateFrom, cappedDateTo)
        icsEvents = icsResult.events
      } catch (e) {
        console.warn(`[share/activities] ICS fetch failed for ${code}:`, String(e))
      }

      // Graph calendar view
      let graphEvents: Record<string, unknown>[] = []
      try {
        const rawEvents = await fetchOutlookEventsForPerson(email, accountId, dateFrom, cappedDateTo)
        if (rawEvents) {
          graphEvents = rawEvents.map(ev => {
            const startDtStr = ev.start?.dateTime ?? ''
            const endDtStr = ev.end?.dateTime ?? ''
            return {
              id: ev.id,
              source: 'outlook' as const,
              isExternal: false,
              personCode: code,
              description: ev.subject ?? '',
              date: startDtStr.slice(0, 10),
              timeFrom: startDtStr.slice(11, 16),
              timeTo: endDtStr.slice(11, 16),
            }
          })
        }
      } catch (e) {
        console.warn(`[share/activities] Graph fetch failed for ${code}:`, String(e))
      }

      // Deduplicate ICS vs Graph
      const uniqueIcs = deduplicateIcsAgainstGraph(graphEvents, icsEvents)

      // Apply hidden calendars filter
      const outlookHidden = hiddenCalendarsSet.has('outlook')
      for (const ev of graphEvents) {
        if (!outlookHidden) {
          allActivities.push(ev)
        }
      }
      for (const ev of uniqueIcs) {
        const calName = ev.icsCalendarName as string | undefined
        const icsKey = calName ? `ics:${calName}` : 'ics'
        if (!hiddenCalendarsSet.has(icsKey)) {
          allActivities.push(ev)
        }
      }
    } catch (e) {
      console.warn(`[share/activities] Outlook/ICS fetch failed for ${code}:`, String(e))
    }
  }

  // Fetch Google Calendar events per person (domain-wide delegation)
  if (!hiddenCalendarsSet.has('google'))
  for (const code of personCodes) {
    try {
      const email = await emailForCode(code, accountId)
      if (!email) continue
      const googleEvents = await fetchGoogleEventsForPerson(email, accountId, dateFrom, cappedDateTo)
      if (!googleEvents) continue // Google not configured
      for (const ev of googleEvents) {
        const mapped = mapGoogleEvent(ev, code, ownerEmail)
        allActivities.push(mapped as unknown as Record<string, unknown>)
      }
    } catch (e) {
      console.warn(`[share/activities] Google domain-wide fetch failed for ${code}:`, String(e))
    }
  }

  // Fetch per-user OAuth Google calendars (owner's connected accounts)
  if (!hiddenCalendarsSet.has('google')) {
    try {
      const { events: perUserRaw } = await fetchPerUserGoogleEvents(
        ownerEmail, accountId, dateFrom, cappedDateTo,
        'items(id,summary,start,end,organizer,attendees,status)',
      )
      for (const { event: ev, calendarName, color } of perUserRaw) {
        if (ev.status === 'cancelled') continue
        // Assign to first person code since per-user calendars aren't person-specific
        const code = personCodes[0] ?? ''
        const mapped = mapGoogleEvent(ev, code, ownerEmail, {
          googleCalendarName: calendarName,
          icsColor: color,
        })
        allActivities.push(mapped as unknown as Record<string, unknown>)
      }
    } catch (e) {
      console.warn('[share/activities] Per-user Google fetch failed:', String(e))
    }
  }

  // Include shared calendar events from other users in the account
  try {
    const { fetchSharedCalendarEvents } = await import('@/lib/sharedCalendars')
    const shared = await fetchSharedCalendarEvents(personCodes, ownerEmail, accountId, dateFrom, cappedDateTo)
    for (const ev of shared.events) {
      allActivities.push(ev as unknown as Record<string, unknown>)
    }
  } catch (e) {
    console.warn('[share/activities] Shared calendar fetch failed:', String(e))
  }

  // Apply visibility filter
  const filtered = allActivities.map(a => filterActivity(a as Record<string, unknown>, visibility))

  // Fetch holidays for the person codes
  const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
  const countryMap = await getPersonsHolidayCountries(personCodes, accountId)
  const countryCodes = [...new Set(countryMap.values())]
  let holidayData: Record<string, { name: string; country: string }[]> = {}
  let personCountries: Record<string, string> = {}
  if (countryCodes.length > 0) {
    const holidays = await getHolidaysForRange(countryCodes, dateFrom, cappedDateTo)
    for (const [date, hols] of holidays) {
      holidayData[date] = hols.map(h => ({ name: h.name, country: h.country }))
    }
    for (const [code, cc] of countryMap) personCountries[code] = cc
  }

  return NextResponse.json({ activities: filtered, holidays: { dates: holidayData, personCountries } }, { headers: { 'Cache-Control': 'no-store' } })
}
