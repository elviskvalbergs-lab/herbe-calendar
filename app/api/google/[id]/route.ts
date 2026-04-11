import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient, getOAuthCalendarClient, buildGoogleMeetConferenceData } from '@/lib/google/client'
import { getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import type { calendar_v3 } from 'googleapis'

async function getCalendarClientForRequest(
  req: NextRequest,
  session: { email: string; userCode?: string; accountId: string }
): Promise<{ calendar: calendar_v3.Calendar; calendarId: string } | NextResponse> {
  const tokenId = req.nextUrl.searchParams.get('googleTokenId')
  const calendarId = req.nextUrl.searchParams.get('googleCalendarId') ?? 'primary'

  if (tokenId) {
    const accessToken = await getValidAccessTokenForUser(tokenId, session.email, session.accountId)
    if (!accessToken) return NextResponse.json({ error: 'Google token expired — reconnect in Settings' }, { status: 401 })
    return { calendar: getOAuthCalendarClient(accessToken), calendarId }
  }

  // Fall back to domain-wide delegation — resolve person email (login email may differ from Workspace email)
  const googleConfig = await getGoogleConfig(session.accountId)
  if (!googleConfig) return NextResponse.json({ error: 'Google not configured' }, { status: 400 })
  const { emailForCode } = await import('@/lib/emailForCode')
  const personEmail = session.userCode ? await emailForCode(session.userCode, session.accountId) : null
  return { calendar: getCalendarClient(googleConfig, personEmail ?? session.email), calendarId: 'primary' }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const result = await getCalendarClientForRequest(req, session)
  if (result instanceof NextResponse) return result
  const { calendar, calendarId } = result

  try {
    const body = await req.json()

    // Verify ownership: only the organizer can edit (skip for per-user OAuth — user owns the token)
    const isPerUser = !!req.nextUrl.searchParams.get('googleTokenId')
    if (!isPerUser) {
      const existing = await calendar.events.get({ calendarId, eventId: id })
      const organizerEmail = existing.data.organizer?.email?.toLowerCase() ?? ''
      // Login email may differ from Workspace email — also check resolved person email
      const { emailForCode } = await import('@/lib/emailForCode')
      const personEmail = session.userCode ? await emailForCode(session.userCode, session.accountId) : null
      const isOwner = organizerEmail === session.email.toLowerCase() || (personEmail && organizerEmail === personEmail.toLowerCase())
      if (!isOwner) {
        return forbidden()
      }
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
      calendarId,
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

  const result = await getCalendarClientForRequest(req, session)
  if (result instanceof NextResponse) return result
  const { calendar, calendarId } = result

  try {
    // Verify ownership: only the organizer can delete (skip for per-user OAuth)
    const isPerUser = !!req.nextUrl.searchParams.get('googleTokenId')
    if (!isPerUser) {
      const existing = await calendar.events.get({ calendarId, eventId: id })
      const organizerEmail = existing.data.organizer?.email?.toLowerCase() ?? ''
      const { emailForCode } = await import('@/lib/emailForCode')
      const personEmail = session.userCode ? await emailForCode(session.userCode, session.accountId) : null
      const isOwner = organizerEmail === session.email.toLowerCase() || (personEmail && organizerEmail === personEmail.toLowerCase())
      if (!isOwner) {
        return forbidden()
      }
    }

    await calendar.events.delete({ calendarId, eventId: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
