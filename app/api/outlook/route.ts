import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAzureConfig } from '@/lib/accountConfig'
import type { Activity } from '@/types'
import { deduplicateIcsAgainstGraph } from '@/lib/icsParser'
import { fetchIcsForPerson } from '@/lib/icsUtils'
import { emailForCode } from '@/lib/emailForCode'
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'

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
      const email = await emailForCode(code, session.accountId)
      if (!email) return []

      // --- ICS feeds (DB-backed) — fetched in parallel with Graph ---
      const icsEventsPromise = fetchIcsForPerson(session.email, code, session.accountId, dateFrom, dateTo, bustIcsCache)
        .catch(e => {
          console.warn(`[outlook] ICS fetch failed for ${code}:`, e)
          return { events: [], warnings: [] }
        })

      // Skip Graph if Azure not configured — ICS events still returned
      if (!azureConfig) {
        const icsResult = await icsEventsPromise
        return { events: icsResult.events, warnings: icsResult.warnings }
      }

      // Fetch via shared util; pass sessionEmail to enable the 404 shared-calendar fallback
      const rawEvents = await fetchOutlookEventsForPerson(email, session.accountId, dateFrom, dateTo, sessionEmail)

      if (rawEvents === null) {
        // Graph failed — still return any ICS events for this person
        const icsResult = await icsEventsPromise
        return { events: icsResult.events, warnings: [...icsResult.warnings, `Outlook: Graph request failed for ${email}`] }
      }

      const icsResult = await icsEventsPromise
      const graphEvents: Activity[] = rawEvents.map(ev => {
        const startDt = ev.start?.dateTime ?? ''
        const endDt = ev.end?.dateTime ?? ''
        const organizerEmail = ev.organizer?.emailAddress?.address ?? ''
        const joinUrl = ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl ?? undefined
        const rawRsvp = ev.responseStatus?.response
        // Graph returns 'none' for unresponded events; map to undefined so buttons show unselected
        const rsvpStatus = (rawRsvp && rawRsvp !== 'none') ? rawRsvp as Activity['rsvpStatus'] : undefined
        // Map attendees
        const attendees = ev.attendees?.map(att => {
          return {
            email: att.emailAddress?.address ?? '',
            name: att.emailAddress?.name ?? undefined,
            type: (att.type === 'optional' ? 'optional' : 'required') as 'required' | 'optional',
            responseStatus: att.status?.response ?? undefined,
          }
        }).filter(a => a.email) ?? []
        return {
          id: ev.id ?? '',
          source: 'outlook' as const,
          personCode: code,
          description: ev.subject ?? '',
          date: startDt.slice(0, 10),
          timeFrom: startDt.slice(11, 16),
          timeTo: endDt.slice(11, 16),
          isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase(),
          isOnlineMeeting: ev.isOnlineMeeting === true,
          videoProvider: ev.isOnlineMeeting === true ? 'teams' as const : undefined,
          attendees,
          location: ev.location?.displayName,
          bodyPreview: ev.bodyPreview ?? '',
          joinUrl,
          webLink: ev.webLink ?? '',
          rsvpStatus,
        }
      })
      // Deduplicate: if an ICS event matches a Graph event by date+time+subject, skip it
      const uniqueIcs = deduplicateIcsAgainstGraph(graphEvents as unknown as Record<string, unknown>[], icsResult.events)
      return { events: [...graphEvents, ...uniqueIcs], warnings: icsResult.warnings }
    }))
    const allEvents = results.flatMap(r => 'events' in r ? r.events : r)
    const allWarnings = results.flatMap(r => 'warnings' in r ? r.warnings : [])

    const response: Record<string, unknown> = { activities: allEvents }
    if (allWarnings.length > 0) response.warnings = allWarnings
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
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
