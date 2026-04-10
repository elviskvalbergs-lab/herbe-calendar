import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'

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
      event.conferenceData = {
        createRequest: {
          requestId: `herbe-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
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
    await calendar.events.delete({ calendarId: 'primary', eventId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
