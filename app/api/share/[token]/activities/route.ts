import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig } from '@/lib/accountConfig'
import { fetchIcsEvents, deduplicateIcsAgainstGraph } from '@/lib/icsParser'
import { fetchErpActivities } from '@/lib/herbe/recordUtils'

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

  const allActivities: (Record<string, unknown> | Activity)[] = []

  // Fetch Herbe activities from all ERP connections
  if (!hiddenCalendarsSet.has('herbe')) {
    const erpActivities = await fetchErpActivities(accountId, personCodes, dateFrom, dateTo)
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
        const { rows: icsRows } = await pool.query(
          'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2',
          [ownerEmail, code]
        )
        const icsResults = await Promise.all(
          icsRows.map(async (row) => {
            const icsResult = await fetchIcsEvents(row.ics_url as string, code, dateFrom, dateTo)
            return icsResult.events.map(ev => ({
              ...ev,
              ...(row.color ? { icsColor: row.color } : {}),
              icsCalendarName: row.name,
            }))
          })
        )
        icsEvents = icsResults.flat()
      } catch (e) {
        console.warn(`[share/activities] ICS fetch failed for ${code}:`, String(e))
      }

      // Graph calendar view
      let graphEvents: Record<string, unknown>[] = []
      try {
        const startDt = `${dateFrom}T00:00:00`
        const endDt = `${dateTo}T23:59:59`
        const shareAzureConfig = await getAzureConfig(accountId)
        if (!shareAzureConfig) throw new Error('Azure not configured')
        const res = await graphFetch(
          `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$top=100`,
          { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } },
          shareAzureConfig
        )
        if (res.ok) {
          const data = await res.json()
          graphEvents = (data.value ?? []).map((ev: Record<string, unknown>) => {
            const start = ev['start'] as Record<string, string> | undefined
            const end = ev['end'] as Record<string, string> | undefined
            const startDtStr = start?.dateTime ?? ''
            const endDtStr = end?.dateTime ?? ''
            return {
              id: String(ev['id'] ?? ''),
              source: 'outlook' as const,
              isExternal: false,
              personCode: code,
              description: String(ev['subject'] ?? ''),
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

  // Apply visibility filter
  const filtered = allActivities.map(a => filterActivity(a as Record<string, unknown>, visibility))

  return NextResponse.json(filtered, { headers: { 'Cache-Control': 'no-store' } })
}
