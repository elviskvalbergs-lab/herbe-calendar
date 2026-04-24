import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
import { getUserGoogleAccounts, getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import type { Destination, DestinationMode } from '@/lib/destinations/types'
import { makeKey } from '@/lib/destinations/keys'

const HERBE_COLOR   = '#00AEE7'
const OUTLOOK_COLOR = '#6264a7'
const GOOGLE_COLOR  = '#4285f4'

export async function GET(req: Request): Promise<Response> {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') as DestinationMode | null
  if (mode !== 'task' && mode !== 'event') {
    return NextResponse.json({ error: 'mode required (task|event)' }, { status: 400 })
  }

  const results: Destination[] = []

  // ERP — same for both modes
  try {
    const conns = await getErpConnections(session.accountId)
    for (const c of conns) {
      const d: Destination = {
        key: '',
        source: 'herbe',
        label: c.name,
        sourceLabel: 'ERP',
        color: HERBE_COLOR,
        meta: { kind: 'herbe', connectionId: c.id, connectionName: c.name },
      }
      d.key = makeKey(d)
      results.push(d)
    }
  } catch (e) { console.warn('[destinations] ERP failed:', e) }

  // Outlook
  try {
    const azure = await getAzureConfig(session.accountId)
    if (azure) {
      if (mode === 'event') {
        const d: Destination = {
          key: '',
          source: 'outlook',
          label: 'Outlook',
          sourceLabel: 'Outlook',
          color: OUTLOOK_COLOR,
          meta: { kind: 'outlook-event' },
        }
        d.key = makeKey(d)
        results.push(d)
      } else {
        const listsRes = await graphFetch(
          `/users/${encodeURIComponent(session.email)}/todo/lists`,
          undefined,
          azure,
        )
        if (listsRes.ok) {
          const body = await listsRes.json() as { value: Array<{ id: string; displayName: string }> }
          for (const l of body.value) {
            const d: Destination = {
              key: '',
              source: 'outlook',
              label: l.displayName,
              sourceLabel: 'Outlook',
              color: OUTLOOK_COLOR,
              meta: { kind: 'outlook-task', listId: l.id, listName: l.displayName },
            }
            d.key = makeKey(d)
            results.push(d)
          }
        }
      }
    }
  } catch (e) { console.warn('[destinations] Outlook failed:', e) }

  // Google (per-user OAuth)
  try {
    const accounts = await getUserGoogleAccounts(session.email, session.accountId)
    for (const acct of accounts) {
      if (mode === 'event') {
        for (const cal of (acct.calendars ?? []).filter((c: { enabled: boolean }) => c.enabled)) {
          const d: Destination = {
            key: '',
            source: 'google',
            label: cal.name,
            sourceLabel: 'Google',
            color: cal.color || GOOGLE_COLOR,
            meta: {
              kind: 'google-event',
              tokenId: acct.id,
              calendarId: cal.calendarId,
              calendarName: cal.name,
              email: acct.googleEmail,
            },
          }
          d.key = makeKey(d)
          results.push(d)
        }
      } else {
        const accessToken = await getValidAccessTokenForUser(acct.id, session.email, session.accountId)
        if (!accessToken) continue
        const r = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        })
        if (!r.ok) continue
        const body = await r.json() as { items?: Array<{ id: string; title: string }> }
        for (const l of body.items ?? []) {
          const d: Destination = {
            key: '',
            source: 'google',
            label: l.title,
            sourceLabel: 'Google',
            color: GOOGLE_COLOR,
            meta: {
              kind: 'google-task',
              tokenId: acct.id,
              listId: l.id,
              listName: l.title,
              email: acct.googleEmail,
            },
          }
          d.key = makeKey(d)
          results.push(d)
        }
      }
    }
  } catch (e) { console.warn('[destinations] Google failed:', e) }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
