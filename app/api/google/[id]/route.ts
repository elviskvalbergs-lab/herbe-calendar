import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient, buildGoogleMeetConferenceData } from '@/lib/google/client'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

    // Verify ownership: only the organizer can edit
    const existing = await calendar.events.get({ calendarId: 'primary', eventId: id })
    if (existing.data.organizer?.email?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const event: Record<string, unknown> = {
      summary: body.subject,
      start: body.start,
      end: body.end,
      location: body.location?.displayName ?? undefined,
      attendees: body.attendees?.map((a: Record<string, unknown>) => ({
        email: (a.emailAddress as Record<string, string>)?.address ?? a.email,
        optional: a.type === 'optional',
      })),
    }

    if (body.body?.content) {
      event.description = body.body.content
    }

    // Handle online meeting toggle
    if (body.isOnlineMeeting) {
      event.conferenceData = buildGoogleMeetConferenceData()
    }

    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId: id,
      requestBody: event,
      conferenceDataVersion: body.isOnlineMeeting ? 1 : 0,
    })

    return NextResponse.json({ id: res.data.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    const calendar = getCalendarClient(googleConfig, session.email)

    // Verify ownership: only the organizer can delete
    const existing = await calendar.events.get({ calendarId: 'primary', eventId: id })
    if (existing.data.organizer?.email?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    await calendar.events.delete({ calendarId: 'primary', eventId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
