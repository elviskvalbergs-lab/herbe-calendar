import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAzureConfig } from '@/lib/accountConfig'
import type { Activity } from '@/types'
import { pool } from '@/lib/db'
import { fetchIcsEvents } from '@/lib/icsParser'
import { emailForCode } from '@/lib/emailForCode'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const dateStr = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? dateStr
  const dateTo = searchParams.get('dateTo') ?? dateStr

  const bustIcsCache = searchParams.get('bustIcsCache') === '1'

  if (!persons || !dateFrom || !dateTo) return NextResponse.json({ error: 'persons and dates required' }, { status: 400 })

  const personList = persons.split(',').map(p => p.trim())
  const sessionEmail = session.email

  const azureConfig = await getAzureConfig(session.accountId)

  try {
    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code)
      if (!email) return []

      // --- ICS feeds (DB-backed) — fetched in parallel with Graph ---
      let icsEventsPromise: Promise<any[]> = Promise.resolve([])
      try {
        const { rows: icsRows } = await pool.query(
          'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2',
          [session.email, code]
        )
        if (icsRows.length > 0) {
          console.log(`[outlook] Found ${icsRows.length} ICS feed(s) for ${code}`)
          icsEventsPromise = Promise.all(
            icsRows.map(async row => {
              const events = await fetchIcsEvents(row.ics_url as string, code, dateFrom, dateTo, bustIcsCache)
              return events.map(ev => ({
                ...ev,
                ...(row.color ? { icsColor: row.color } : {}),
                icsCalendarName: row.name,
              }))
            })
          ).then(results => results.flat())
        }
      } catch (e) {
        console.warn(`[outlook] DB lookup for ICS failed for ${code}:`, e)
      }

      // Skip Graph if Azure not configured — ICS events still returned
      if (!azureConfig) {
        return icsEventsPromise
      }

      // calendarView expands recurring events automatically; no type filter needed
      const startDt = `${dateFrom}T00:00:00`
      const endDt = `${dateTo}T23:59:59`
      const calendarViewParams = `startDateTime=${startDt}&endDateTime=${endDt}&$top=100`

      let res = await graphFetch(
        `/users/${email}/calendarView?${calendarViewParams}`,
        { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } },
        azureConfig
      )

      if (!res.ok && res.status === 404) {
        // Fallback: If 404, this user isn't in the tenant. 
        // Search the logged-in user's own shared calendars list for a match.
        try {
          if (sessionEmail) {
            const listRes = await graphFetch(`/users/${sessionEmail}/calendars?$select=id,owner`, undefined, azureConfig)
            if (listRes.ok) {
              const listData = await listRes.json()
              const cals = listData.value as any[]
              console.log(`[outlook] Fallback for ${email}: searching ${cals?.length ?? 0} calendars of ${sessionEmail}`)
              const sharedCal = cals?.find(c => 
                c.owner?.address?.toLowerCase() === email.toLowerCase()
              )
              if (sharedCal) {
                console.log(`[outlook] Fallback found calendar ID ${sharedCal.id} for ${email}`)
                res = await graphFetch(
                  `/users/${sessionEmail}/calendars/${sharedCal.id}/calendarView?${calendarViewParams}`,
                  { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } },
                  azureConfig
                )
              } else {
                console.log(`[outlook] Fallback: No calendar owned by ${email} found in ${sessionEmail}'s list`)
              }
            } else {
              const listErr = await listRes.text()
              console.warn(`[outlook] Fallback lookup failed for ${sessionEmail}: ${listRes.status} ${listErr}`)
            }
          }
        } catch (e) {
          console.warn('[outlook] Fallback shared calendar search failed:', String(e))
        }
      }

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Graph calendarView failed for ${email}: ${res.status} ${errText}`)
        // Graph failed — still return any ICS events for this person
        return icsEventsPromise
      }
      const data = await res.json()
      const icsEvents = await icsEventsPromise
      const graphEvents = (data.value ?? []).map((ev: Record<string, unknown>) => {
        const start = (ev['start'] as Record<string, string> | undefined)
        const end = (ev['end'] as Record<string, string> | undefined)
        const startDt = start?.dateTime ?? ''
        const endDt = end?.dateTime ?? ''
        const organizer = ev['organizer'] as Record<string, unknown> | undefined
        const organizerEmail = (organizer?.['emailAddress'] as Record<string, string> | undefined)?.['address'] ?? ''
        const onlineMeeting = ev['onlineMeeting'] as Record<string, string> | undefined
        const joinUrl = onlineMeeting?.['joinUrl'] ?? (ev['onlineMeetingUrl'] as string | undefined) ?? undefined
        const responseStatus = ev['responseStatus'] as Record<string, string> | undefined
        const rawRsvp = responseStatus?.['response']
        // Graph returns 'none' for unresponded events; map to undefined so buttons show unselected
        const rsvpStatus = (rawRsvp && rawRsvp !== 'none') ? rawRsvp as Activity['rsvpStatus'] : undefined
        // Map attendees
        const rawAttendees = ev['attendees'] as Array<Record<string, unknown>> | undefined
        const attendees = rawAttendees?.map(att => {
          const emailAddr = att['emailAddress'] as Record<string, string> | undefined
          const attResponse = att['status'] as Record<string, string> | undefined
          return {
            email: emailAddr?.['address'] ?? '',
            name: emailAddr?.['name'] ?? undefined,
            type: (att['type'] === 'optional' ? 'optional' : 'required') as 'required' | 'optional',
            responseStatus: attResponse?.['response'] ?? undefined,
          }
        }).filter(a => a.email) ?? []
        return {
          id: String(ev['id'] ?? ''),
          source: 'outlook' as const,
          personCode: code,
          description: String(ev['subject'] ?? ''),
          date: startDt.slice(0, 10),
          timeFrom: startDt.slice(11, 16),
          timeTo: endDt.slice(11, 16),
          isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase(),
          isOnlineMeeting: ev['isOnlineMeeting'] === true,
          attendees,
          location: (ev['location'] as Record<string, string> | undefined)?.['displayName'],
          bodyPreview: String(ev['bodyPreview'] ?? ''),
          joinUrl,
          webLink: String(ev['webLink'] ?? ''),
          rsvpStatus,
        }
      })
      // Deduplicate: if an ICS event matches a Graph event by date+time+subject, skip it
      const graphKeys = new Set(graphEvents.map((e: any) => `${e.date}|${e.timeFrom}|${e.timeTo}|${e.description.toLowerCase()}`))
      const uniqueIcs = icsEvents.filter((e: any) => !graphKeys.has(`${e.date}|${e.timeFrom}|${e.timeTo}|${e.description.toLowerCase()}`))
      return [...graphEvents, ...uniqueIcs]
    }))
    return NextResponse.json(results.flat(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const raw = await req.json()
    const ALLOWED_POST_FIELDS = ['subject', 'body', 'start', 'end', 'location', 'attendees', 'isOnlineMeeting', 'onlineMeetingProvider'] as const
    const body: Record<string, unknown> = {}
    for (const key of ALLOWED_POST_FIELDS) {
      if (raw[key] !== undefined) body[key] = raw[key]
    }
    const email = session.email
    const postAzureConfig = await getAzureConfig(session.accountId)
    if (!postAzureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })
    const res = await graphFetch(`/users/${email}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, postAzureConfig)
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 201 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
