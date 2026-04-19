import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { action } = await req.json()
  // Map action to Google Calendar responseStatus
  const statusMap: Record<string, string> = {
    accept: 'accepted',
    decline: 'declined',
    tentativelyAccept: 'tentative',
  }
  const responseStatus = statusMap[action]
  if (!responseStatus) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const calendar = getCalendarClient(googleConfig, session.email)

    // Get the current event to find our attendee entry
    const event = await calendar.events.get({ calendarId: 'primary', eventId: id })
    const attendees = event.data.attendees ?? []

    // Update our RSVP status
    const updated = attendees.map(att => {
      if (att.self || att.email?.toLowerCase() === session.email.toLowerCase()) {
        return { ...att, responseStatus }
      }
      return att
    })

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: id,
      requestBody: { attendees: updated },
    })

    return NextResponse.json({ ok: true, status: responseStatus })
  } catch (e) {
    console.error('[google/[id]/rsvp] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
