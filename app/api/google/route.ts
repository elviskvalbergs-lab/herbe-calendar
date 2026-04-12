import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient, buildGoogleMeetConferenceData, getOAuthCalendarClient } from '@/lib/google/client'
import { getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import { emailForCode } from '@/lib/emailForCode'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents, mapGoogleEvent } from '@/lib/googleUtils'
import type { Activity } from '@/types'

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

  if (!persons || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'persons and dates required' }, { status: 400 })
  }

  const personList = persons.split(',').map(p => p.trim())

  // --- Domain-wide delegation events ---
  const domainWideEvents: Activity[] = []

  try {
    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code, session.accountId)
      if (!email) return []

      const events = await fetchGoogleEventsForPerson(email, session.accountId, dateFrom, dateTo)
      if (events === null) return [] // Google not configured

      return events.map(ev => mapGoogleEvent(ev, code, session.email, undefined, email))
    }))

    domainWideEvents.push(...results.flat())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  // --- Per-user OAuth calendars ---
  const { events: perUserRaw, warnings } = await fetchPerUserGoogleEvents(
    session.email,
    session.accountId,
    dateFrom,
    dateTo,
    'items(id,summary,description,start,end,organizer,attendees,conferenceData,htmlLink,status)',
  )

  const perUserEvents: Activity[] = []
  for (const { event: ev, calendarId, calendarName, accountEmail, tokenId, color } of perUserRaw) {
    if (ev.status === 'cancelled') continue
    perUserEvents.push(mapGoogleEvent(ev, session.userCode, session.email, {
      googleCalendarId: calendarId,
      googleCalendarName: calendarName,
      googleAccountEmail: accountEmail,
      googleTokenId: tokenId,
      icsColor: color,
    }))
  }

  // Deduplicate per-user events against domain-wide events by Google event ID
  const domainEventIds = new Set(domainWideEvents.map(e => e.id))
  const uniquePerUser = perUserEvents.filter(e => !domainEventIds.has(e.id))
  const allEvents = [...domainWideEvents, ...uniquePerUser]

  // Include shared calendar events from colleagues
  try {
    const { fetchSharedCalendarEvents } = await import('@/lib/sharedCalendars')
    const shared = await fetchSharedCalendarEvents(personList, session.email, session.accountId, dateFrom, dateTo)
    allEvents.push(...shared.events)
  } catch (e) {
    console.warn('[google] Shared calendar fetch failed:', String(e))
  }

  const response: Record<string, unknown> = { activities: allEvents }
  if (warnings.length > 0) response.warnings = warnings
  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const body = await req.json()

    // Per-user OAuth path: if googleTokenId + googleCalendarId provided
    if (body.googleTokenId && body.googleCalendarId) {
      const accessToken = await getValidAccessTokenForUser(body.googleTokenId, session.email, session.accountId)
      if (!accessToken) {
        return NextResponse.json({ error: 'Google token expired — reconnect in Settings' }, { status: 401 })
      }
      const oauthCal = getOAuthCalendarClient(accessToken)

      const event: any = {
        summary: body.subject,
        start: body.start,
        end: body.end,
      }
      if (body.description) event.description = body.description
      if (body.attendees) event.attendees = body.attendees
      if (body.isOnlineMeeting) {
        event.conferenceData = buildGoogleMeetConferenceData()
      }

      const res = await oauthCal.events.insert({
        calendarId: body.googleCalendarId,
        requestBody: event,
        conferenceDataVersion: body.isOnlineMeeting ? 1 : 0,
      })
      return NextResponse.json({ id: res.data.id }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Domain-wide delegation path
    const googleConfig = await getGoogleConfig(session.accountId)
    if (!googleConfig) {
      return NextResponse.json({ error: 'Google not configured' }, { status: 400 })
    }

    const calendar = getCalendarClient(googleConfig, session.email)

    const event: any = {
      summary: body.subject,
      description: body.body?.content ?? undefined,
      start: body.start,
      end: body.end,
      location: body.location?.displayName,
      attendees: body.attendees?.map((a: any) => ({
        email: a.emailAddress?.address ?? a.email,
        optional: a.type === 'optional',
      })),
    }

    // Add Google Meet if requested
    if (body.isOnlineMeeting) {
      event.conferenceData = buildGoogleMeetConferenceData()
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: body.isOnlineMeeting ? 1 : 0,
    })

    return NextResponse.json({ id: res.data.id }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
