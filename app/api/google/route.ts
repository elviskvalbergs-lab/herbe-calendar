import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { emailForCode } from '@/lib/emailForCode'
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

  const googleConfig = await getGoogleConfig(session.accountId)
  if (!googleConfig) {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
  }

  const personList = persons.split(',').map(p => p.trim())

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
          singleEvents: true, // Expand recurring events
          orderBy: 'startTime',
          maxResults: 200,
        })

        return (res.data.items ?? []).map((ev): Activity => {
          const start = ev.start?.dateTime ?? ev.start?.date ?? ''
          const end = ev.end?.dateTime ?? ev.end?.date ?? ''
          const isAllDay = !ev.start?.dateTime
          const startDate = start.slice(0, 10)
          const startTime = ev.start?.dateTime ? start.slice(11, 16) : '00:00'
          const endTime = ev.end?.dateTime ? end.slice(11, 16) : '23:59'

          // Extract Google Meet link
          const meetLink = ev.conferenceData?.entryPoints?.find(
            ep => ep.entryPointType === 'video'
          )?.uri

          // Map attendees
          const attendees = (ev.attendees ?? []).map(att => ({
            email: att.email ?? '',
            name: att.displayName ?? undefined,
            type: (att.optional ? 'optional' : 'required') as 'required' | 'optional',
            responseStatus: att.responseStatus ?? undefined,
          })).filter(a => a.email)

          const organizerEmail = ev.organizer?.email ?? ''
          const rsvpSelf = ev.attendees?.find(a => a.self)?.responseStatus
          const rsvpStatus = rsvpSelf === 'accepted' ? 'accepted'
            : rsvpSelf === 'declined' ? 'declined'
            : rsvpSelf === 'tentative' ? 'tentativelyAccepted'
            : organizerEmail.toLowerCase() === email.toLowerCase() ? 'organizer'
            : undefined

          return {
            id: ev.id ?? '',
            source: 'google',
            personCode: code,
            description: ev.summary ?? '',
            date: startDate,
            timeFrom: startTime,
            timeTo: endTime,
            isOrganizer: organizerEmail.toLowerCase() === session.email.toLowerCase(),
            isAllDay,
            attendees,
            location: ev.location ?? undefined,
            joinUrl: meetLink ?? undefined,
            webLink: ev.htmlLink ?? '',
            textInMatrix: ev.description ?? undefined,
            isOnlineMeeting: !!meetLink,
            rsvpStatus: rsvpStatus as Activity['rsvpStatus'],
          }
        })
      } catch (e) {
        console.warn(`[google] Calendar fetch failed for ${email}:`, String(e))
        return []
      }
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

  const googleConfig = await getGoogleConfig(session.accountId)
  if (!googleConfig) {
    return NextResponse.json({ error: 'Google not configured' }, { status: 400 })
  }

  try {
    const body = await req.json()
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
      event.conferenceData = {
        createRequest: {
          requestId: `herbe-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
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
