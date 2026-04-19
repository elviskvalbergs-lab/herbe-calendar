import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getAzureConfig } from '@/lib/accountConfig'
import type { AzureConfig } from '@/lib/accountConfig'
import { upsertCachedEvents, deleteCachedEvent, type CachedEventRow } from '@/lib/cache/events'
import { buildOutlookCacheRows } from '@/lib/sync/graph'
import { listAccountPersons } from '@/lib/cache/accountPersons'

/** Verify the session user is the organizer of the Outlook event */
async function assertOrganizer(eventId: string, email: string, azureConfig: AzureConfig): Promise<NextResponse | null> {
  const check = await graphFetch(`/users/${email}/events/${eventId}`, undefined, azureConfig)
  if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ev = await check.json() as Record<string, unknown>
  const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
  if (organizer?.emailAddress?.address?.toLowerCase() !== email.toLowerCase()) {
    return forbidden()
  }
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const azureConfig = await getAzureConfig(session.accountId)
  if (!azureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })

  try {
    const denied = await assertOrganizer(id, session.email, azureConfig)
    if (denied) return denied

    const raw = await req.json()
    const ALLOWED_PUT_FIELDS = ['subject', 'body', 'start', 'end', 'location', 'attendees'] as const
    const body: Record<string, unknown> = {}
    for (const key of ALLOWED_PUT_FIELDS) {
      if (raw[key] !== undefined) body[key] = raw[key]
    }
    const res = await graphFetch(`/users/${session.email}/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, azureConfig)
    const data = await res.json()

    // Write-through: refetch the updated event and upsert cached rows for all attendees with a person_code
    if (res.ok) {
      try {
        // Drop stale rows for this event first — attendee list may have changed
        await deleteCachedEvent(session.accountId, 'outlook', id)
        const refetch = await graphFetch(
          `/users/${session.email}/events/${id}?$select=id,subject,start,end,organizer,isOnlineMeeting,onlineMeetingUrl,onlineMeeting,attendees,location,bodyPreview,webLink,responseStatus`,
          { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
          azureConfig,
        )
        if (refetch.ok) {
          const updated = await refetch.json()
          const people = await listAccountPersons(session.accountId)
          const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
          const codes = new Set<string>()
          const orgCode = emailToCode.get(session.email.toLowerCase())
          if (orgCode) codes.add(orgCode)
          for (const att of (updated.attendees ?? []) as Array<{ emailAddress?: { address?: string } }>) {
            const addr = att.emailAddress?.address?.toLowerCase()
            if (addr) {
              const c = emailToCode.get(addr)
              if (c) codes.add(c)
            }
          }
          const rows: CachedEventRow[] = []
          for (const code of codes) {
            rows.push(...buildOutlookCacheRows(updated, session.accountId, code, session.email))
          }
          if (rows.length > 0) {
            upsertCachedEvents(rows).catch(e => console.warn('[outlook/PUT] cache write-through failed:', e))
          }
        }
      } catch (e) {
        console.warn('[outlook/PUT] cache write-through error:', e)
      }
    }

    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    console.error('[outlook/[id]] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const azureConfig = await getAzureConfig(session.accountId)
  if (!azureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })

  try {
    const denied = await assertOrganizer(id, session.email, azureConfig)
    if (denied) return denied

    const res = await graphFetch(`/users/${session.email}/events/${id}`, { method: 'DELETE' }, azureConfig)

    if (res.ok) {
      deleteCachedEvent(session.accountId, 'outlook', id).catch(e =>
        console.warn('[outlook/DELETE] cache write-through failed:', e)
      )
    }

    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    console.error('[outlook/[id]] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
