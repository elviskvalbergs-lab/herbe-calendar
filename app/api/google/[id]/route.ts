import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getGoogleConfig, getCalendarClient, getOAuthCalendarClient, buildGoogleMeetConferenceData } from '@/lib/google/client'
import { getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import { upsertCachedEvents, deleteCachedEvent, type CachedEventRow } from '@/lib/cache/events'
import { buildGoogleCacheRows } from '@/lib/sync/google'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { pool } from '@/lib/db'
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

    // Write-through: refresh cached rows for this event (attendees may have changed)
    const tokenId = req.nextUrl.searchParams.get('googleTokenId')
    const source: 'google' | 'google-user' = tokenId ? 'google-user' : 'google'
    try {
      // Drop stale rows for this event across both google sources
      await pool.query(
        `DELETE FROM cached_events
         WHERE account_id = $1 AND source IN ('google','google-user') AND source_id = $2`,
        [session.accountId, id],
      )

      if (res.data?.id) {
        const people = await listAccountPersons(session.accountId)
        const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
        const rows: CachedEventRow[] = []

        if (source === 'google-user') {
          const personCode = emailToCode.get(session.email.toLowerCase())
          if (personCode) {
            rows.push(...buildGoogleCacheRows(res.data, {
              source: 'google-user',
              accountId: session.accountId,
              personCode,
              personEmail: session.email,
              sessionEmail: session.email,
              tokenId: tokenId ?? undefined,
              calendarId,
            }))
          }
        } else {
          const { emailForCode } = await import('@/lib/emailForCode')
          const codes = new Set<string>()
          const orgCode = emailToCode.get(session.email.toLowerCase())
          if (orgCode) codes.add(orgCode)
          for (const att of (res.data.attendees ?? []) as Array<{ email?: string | null }>) {
            const addr = att.email?.toLowerCase()
            if (addr) {
              const c = emailToCode.get(addr)
              if (c) codes.add(c)
            }
          }
          for (const code of codes) {
            const personEmail = (await emailForCode(code, session.accountId)) ?? null
            rows.push(...buildGoogleCacheRows(res.data, {
              source: 'google',
              accountId: session.accountId,
              personCode: code,
              personEmail,
              sessionEmail: session.email,
            }))
          }
        }

        if (rows.length > 0) {
          await upsertCachedEvents(rows)
        }
      }
    } catch (e) {
      console.warn('[google/PUT] cache write-through error:', e)
    }

    return NextResponse.json({ id: res.data.id })
  } catch (e) {
    console.error('[google/[id]] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    // Write-through: remove cached rows for this event from both google sources
    try {
      await pool.query(
        `DELETE FROM cached_events
         WHERE account_id = $1 AND source IN ('google','google-user') AND source_id = $2`,
        [session.accountId, id],
      )
    } catch (e) {
      console.warn('[google/DELETE] cache write-through failed:', e)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[google/[id]] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
