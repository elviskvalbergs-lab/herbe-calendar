import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { REGISTERS } from '@/lib/herbe/constants'
import { fetchIcsEvents } from '@/lib/icsParser'
import { toTime, isCalendarRecord, parsePersons } from '@/lib/herbe/recordUtils'
import ICAL from 'ical.js'
import type { ShareVisibility } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
import { emailForCode } from '@/lib/emailForCode'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Validate token (no password check — ICS feeds can't send auth headers)
  const { rows } = await pool.query(
    `SELECT
      sl.id,
      sl.visibility,
      sl.expires_at,
      sl.password_hash IS NOT NULL AS "hasPassword",
      f.person_codes AS "personCodes",
      f.hidden_calendars AS "hiddenCalendars",
      f.user_email AS "ownerEmail",
      f.account_id AS "accountId",
      f.name AS "favoriteName"
    FROM favorite_share_links sl
    JOIN user_favorites f ON f.id = sl.favorite_id
    WHERE sl.token = $1`,
    [token]
  )

  if (rows.length === 0) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const link = rows[0]
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new NextResponse('Link Expired', { status: 410 })
  }

  // Password-protected links can't be used as ICS feeds
  if (link.hasPassword) {
    return new NextResponse('Password-protected links cannot be used as calendar subscriptions', { status: 403 })
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

  // Fetch activities for a rolling window: 30 days back, 90 days forward
  const now = new Date()
  const dateFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const dateTo = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  interface RawActivity {
    id: string
    source: string
    personCode: string
    description: string
    date: string
    timeFrom: string
    timeTo: string
    activityTypeCode?: string
    location?: string
    isAllDay?: boolean
    isExternal?: boolean
    icsCalendarName?: string
    icsColor?: string
  }

  const allActivities: RawActivity[] = []

  // Fetch ERP activities
  if (!hiddenCalendarsSet.has('herbe')) {
    try {
      const connections = await getErpConnections(accountId)
      for (const conn of connections) {
        try {
          const raw = await herbeFetchAll(REGISTERS.activities, { sort: 'TransDate', range: `${dateFrom}:${dateTo}` }, 100, conn)
          for (const record of raw) {
            const r = record as Record<string, unknown>
            if (!isCalendarRecord(r)) continue
            const { main } = parsePersons(r)
            for (const p of main) {
              if (personSet.has(p)) {
                allActivities.push({
                  id: `erp-${conn.id}-${r['SerNr']}`,
                  source: 'herbe',
                  personCode: p,
                  description: String(r['Comment'] ?? ''),
                  date: String(r['TransDate'] ?? ''),
                  timeFrom: toTime(String(r['StartTime'] ?? '')),
                  timeTo: toTime(String(r['EndTime'] ?? '')),
                  activityTypeCode: String(r['ActType'] ?? '') || undefined,
                })
              }
            }
          }
        } catch (e) {
          console.warn(`[feed.ics] ERP "${conn.name}" failed:`, String(e))
        }
      }
    } catch (e) {
      console.warn('[feed.ics] ERP fetch failed:', String(e))
    }
  }

  // Fetch Outlook + ICS per person
  for (const code of personCodes) {
    try {
      const email = await emailForCode(code, accountId)
      if (!email) continue

      // ICS feeds
      if (!hiddenCalendarsSet.has('ics')) {
        try {
          const { rows: icsRows } = await pool.query(
            'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2 AND account_id = $3',
            [ownerEmail, code, accountId]
          )
          for (const row of icsRows) {
            const calName = row.name as string
            const icsKey = calName ? `ics:${calName}` : 'ics'
            if (hiddenCalendarsSet.has(icsKey)) continue
            try {
              const icsResult = await fetchIcsEvents(row.ics_url as string, code, dateFrom, dateTo)
              for (const ev of icsResult.events) {
                allActivities.push({
                  ...ev as RawActivity,
                  id: `ics-${code}-${ev.id}`,
                  icsCalendarName: calName,
                  icsColor: row.color as string | undefined,
                })
              }
            } catch {}
          }
        } catch {}
      }

      // Outlook
      if (!hiddenCalendarsSet.has('outlook')) {
        try {
          const azureConfig = await getAzureConfig(accountId)
          if (azureConfig) {
            const startDt = `${dateFrom}T00:00:00`
            const endDt = `${dateTo}T23:59:59`
            const res = await graphFetch(
              `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$top=200`,
              { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } },
              azureConfig
            )
            if (res.ok) {
              const data = await res.json()
              for (const ev of (data.value ?? []) as Record<string, unknown>[]) {
                const start = ev['start'] as Record<string, string> | undefined
                const end = ev['end'] as Record<string, string> | undefined
                const startStr = start?.dateTime ?? ''
                const endStr = end?.dateTime ?? ''
                allActivities.push({
                  id: `outlook-${ev['id']}`,
                  source: 'outlook',
                  personCode: code,
                  description: String(ev['subject'] ?? ''),
                  date: startStr.slice(0, 10),
                  timeFrom: startStr.slice(11, 16),
                  timeTo: endStr.slice(11, 16),
                  location: String((ev['location'] as Record<string, unknown>)?.['displayName'] ?? '') || undefined,
                })
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Build ICS calendar
  const cal = new ICAL.Component(['vcalendar', [], []])
  cal.updatePropertyWithValue('prodid', '-//herbe.calendar//EN')
  cal.updatePropertyWithValue('version', '2.0')
  cal.updatePropertyWithValue('calscale', 'GREGORIAN')
  cal.updatePropertyWithValue('method', 'PUBLISH')
  cal.updatePropertyWithValue('x-wr-calname', link.favoriteName || 'herbe.calendar')
  cal.updatePropertyWithValue('x-wr-timezone', 'Europe/Riga')

  // Add timezone component
  const vtimezone = new ICAL.Component('vtimezone')
  vtimezone.addPropertyWithValue('tzid', 'Europe/Riga')
  cal.addSubcomponent(vtimezone)

  for (const act of allActivities) {
    const vevent = new ICAL.Component('vevent')
    vevent.updatePropertyWithValue('uid', `${act.id}@herbe.calendar`)
    vevent.updatePropertyWithValue('summary', visibility === 'busy' ? 'Busy' : act.description || '(no title)')

    if (act.isAllDay) {
      vevent.updatePropertyWithValue('dtstart', ICAL.Time.fromDateString(act.date))
      vevent.updatePropertyWithValue('dtend', ICAL.Time.fromDateString(act.date))
    } else {
      const dtstart = ICAL.Time.fromDateTimeString(`${act.date}T${act.timeFrom || '00:00'}:00`)
      dtstart.zone = ICAL.Timezone.localTimezone
      vevent.updatePropertyWithValue('dtstart', dtstart)

      const dtend = ICAL.Time.fromDateTimeString(`${act.date}T${act.timeTo || act.timeFrom || '00:00'}:00`)
      dtend.zone = ICAL.Timezone.localTimezone
      vevent.updatePropertyWithValue('dtend', dtend)
    }

    if (visibility === 'full') {
      if (act.location) vevent.updatePropertyWithValue('location', act.location)
      if (act.activityTypeCode) vevent.updatePropertyWithValue('categories', act.activityTypeCode)
    }

    vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now())
    cal.addSubcomponent(vevent)
  }

  const icsContent = cal.toString()

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="herbe-calendar.ics"`,
      'Cache-Control': 'public, max-age=300', // 5 min cache for polling clients
    },
  })
}
