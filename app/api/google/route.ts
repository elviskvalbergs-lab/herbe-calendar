// TODO: use shared fetch from lib/googleUtils.ts (fetchGoogleEventsForPerson,
// fetchPerUserGoogleEvents) to replace the inline calendar.events.list calls below.
// The mapGoogleEvent function here could also move to googleUtils.ts in a follow-up.
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient, buildGoogleMeetConferenceData, getOAuthCalendarClient } from '@/lib/google/client'
import { getUserGoogleAccounts, getValidAccessToken, getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import { emailForCode } from '@/lib/emailForCode'
import type { Activity } from '@/types'

function mapGoogleEvent(
  ev: any,
  personCode: string,
  sessionEmail: string,
  extra?: { googleCalendarId?: string; googleCalendarName?: string; googleAccountEmail?: string; icsColor?: string; googleTokenId?: string },
  personEmail?: string | null,
): Activity {
  const start = ev.start?.dateTime ?? ev.start?.date ?? ''
  const end = ev.end?.dateTime ?? ev.end?.date ?? ''
  const isAllDay = !ev.start?.dateTime
  const startDate = start.slice(0, 10)
  const startTime = ev.start?.dateTime ? start.slice(11, 16) : '00:00'
  const endTime = ev.end?.dateTime ? end.slice(11, 16) : '23:59'

  // Extract Google Meet link
  const meetLink = ev.conferenceData?.entryPoints?.find(
    (ep: any) => ep.entryPointType === 'video'
  )?.uri

  // Map attendees
  const attendees = (ev.attendees ?? []).map((att: any) => ({
    email: att.email ?? '',
    name: att.displayName ?? undefined,
    type: (att.optional ? 'optional' : 'required') as 'required' | 'optional',
    responseStatus: att.responseStatus ?? undefined,
  })).filter((a: any) => a.email)

  const organizerEmail = ev.organizer?.email ?? ''
  const rsvpSelf = ev.attendees?.find((a: any) => a.self)?.responseStatus
  const rsvpStatus = rsvpSelf === 'accepted' ? 'accepted'
    : rsvpSelf === 'declined' ? 'declined'
    : rsvpSelf === 'tentative' ? 'tentativelyAccepted'
    : organizerEmail.toLowerCase() === sessionEmail.toLowerCase() ? 'organizer'
    : undefined

  const activity: Activity = {
    id: ev.id ?? '',
    source: 'google',
    personCode,
    description: ev.summary ?? '',
    date: startDate,
    timeFrom: startTime,
    timeTo: endTime,
    isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase() || (!!personEmail && organizerEmail.toLowerCase() === personEmail.toLowerCase()),
    isAllDay,
    attendees,
    location: ev.location ?? undefined,
    joinUrl: meetLink ?? undefined,
    webLink: ev.htmlLink ?? '',
    textInMatrix: ev.description ?? undefined,
    isOnlineMeeting: !!meetLink,
    videoProvider: meetLink ? 'meet' as const : undefined,
    rsvpStatus: rsvpStatus as Activity['rsvpStatus'],
  }

  if (extra?.icsColor) activity.icsColor = extra.icsColor
  // Extra fields for per-user OAuth events
  if (extra?.googleCalendarId) activity.googleCalendarId = extra.googleCalendarId
  if (extra?.googleCalendarName) activity.googleCalendarName = extra.googleCalendarName
  if (extra?.googleAccountEmail) activity.googleAccountEmail = extra.googleAccountEmail
  if (extra?.googleTokenId) activity.googleTokenId = extra.googleTokenId

  return activity
}

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
  const googleConfig = await getGoogleConfig(session.accountId)

  if (googleConfig) {
    try {
      const results = await Promise.all(personList.map(async code => {
        const email = await emailForCode(code, session.accountId)
        if (!email) return []

        try {
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${dateFrom}T00:00:00+03:00`,
            timeMax: `${dateTo}T23:59:59+03:00`,
            timeZone: 'Europe/Riga',
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 200,
          })

          return (res.data.items ?? []).map((ev) =>
            mapGoogleEvent(ev, code, session.email, undefined, email)
          )
        } catch (e) {
          console.warn(`[google] Calendar fetch failed for ${email}:`, String(e))
          return []
        }
      }))

      domainWideEvents.push(...results.flat())
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // --- Per-user OAuth calendars ---
  const warnings: string[] = []
  const perUserEvents: Activity[] = []
  const userAccounts = await getUserGoogleAccounts(session.email, session.accountId)

  for (const account of userAccounts) {
    const enabledCals = account.calendars.filter(c => c.enabled)
    if (enabledCals.length === 0) continue

    const accessToken = await getValidAccessToken(account.id)
    if (!accessToken) {
      warnings.push(`Google (${account.googleEmail}): token expired`)
      continue
    }

    const oauthCalendar = getOAuthCalendarClient(accessToken)
    for (const cal of enabledCals) {
      try {
        const res = await oauthCalendar.events.list({
          calendarId: cal.calendarId,
          timeMin: `${dateFrom}T00:00:00Z`,
          timeMax: `${dateTo}T23:59:59Z`,
          singleEvents: true,
          maxResults: 250,
          fields: 'items(id,summary,description,start,end,organizer,attendees,conferenceData,htmlLink,status)',
        })
        for (const ev of res.data.items ?? []) {
          if (ev.status === 'cancelled') continue
          perUserEvents.push(mapGoogleEvent(ev, session.userCode, session.email, {
            googleCalendarId: cal.calendarId,
            googleCalendarName: cal.name,
            googleAccountEmail: account.googleEmail,
            googleTokenId: account.id,
            icsColor: cal.color ?? undefined,
          }))
        }
      } catch (e) {
        warnings.push(`Google (${account.googleEmail}) "${cal.name}": ${String(e).slice(0, 100)}`)
      }
    }
  }

  // Deduplicate per-user events against domain-wide events by Google event ID
  const domainEventIds = new Set(domainWideEvents.map(e => e.id))
  const uniquePerUser = perUserEvents.filter(e => !domainEventIds.has(e.id))
  const allEvents = [...domainWideEvents, ...uniquePerUser]

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
