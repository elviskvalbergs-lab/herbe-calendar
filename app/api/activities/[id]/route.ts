import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchById, herbeWebExcellentDelete } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getErpConnections, type ErpConnection } from '@/lib/accountConfig'
import { trackEvent } from '@/lib/analytics'
import { upsertCachedEvents, deleteCachedEvent } from '@/lib/cache/events'
import { buildCacheRows } from '@/lib/sync/erp'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'

async function resolveConnection(url: string, accountId: string): Promise<ErpConnection | undefined> {
  const connectionId = new URL(url).searchParams.get('connectionId')
  const connections = await getErpConnections(accountId)
  return connectionId ? connections.find(c => c.id === connectionId) : connections[0]
}

async function fetchActivity(id: string, conn?: ErpConnection) {
  const res = await herbeFetchById(REGISTERS.activities, id, undefined, conn)
  if (!res.ok) return null
  // ERP may return control characters in text fields — sanitize before parsing
  const text = await res.text()
  const sanitized = text.replace(/[\x00-\x1F\x7F]/g, ' ')
  const json = JSON.parse(sanitized)
  // Handle both wrapped { data: { ActVc: [...] } } and direct record responses
  return (json?.data?.[REGISTERS.activities]?.[0] ?? json) as Record<string, unknown>
}

export function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const mainPersons = String(activity['MainPersons'] ?? '').split(',').map(s => s.trim())
  if (mainPersons.includes(userCode)) return true
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
  if (accessGroup?.split(',').map(s => s.trim()).includes(userCode)) return true
  const ccPersons = String(activity['CCPersons'] ?? '').split(',').map(s => s.trim())
  if (ccPersons.includes(userCode)) return true
  return false
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const conn = await resolveConnection(req.url, session.accountId)
  const activity = await fetchActivity(id, conn)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const body = await req.json()
    const result = await saveActVcRecord(body, { id, allowEmptyFields: new Set(['CCPersons']), conn })
    if (!result.ok) {
      const payload: Record<string, unknown> = { error: result.error }
      if (result.errors) payload.errors = result.errors.map(m => ({ message: m }))
      if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
      return NextResponse.json(payload, { status: result.status })
    }

    trackEvent(session.accountId, session.email, 'activity_edited').catch(() => {})

    // Write-through: update cache with the edited activity. Both delete and
    // upsert are awaited — if we fire-and-forget the upsert, the client's
    // immediate refetch can race the delete and return an empty result,
    // making the edit look like it vanished.
    try {
      await deleteCachedEvent(session.accountId, 'herbe', id)
      const updated = await fetchActivity(id, conn)
      if (updated) {
        const cacheRows = buildCacheRows(
          updated,
          session.accountId,
          conn?.id ?? '',
          conn?.name ?? '',
        )
        if (cacheRows.length > 0) {
          await upsertCachedEvents(cacheRows)
        }
      }
    } catch (e) {
      console.warn('[activities/PUT] cache write-through error:', e)
    }
    return NextResponse.json(result.record, { status: 200 })
  } catch (e) {
    console.error('[activities/[id]] operation failed:', e)
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

  const conn = await resolveConnection(req.url, session.accountId)
  const activity = await fetchActivity(id, conn)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const res = await herbeWebExcellentDelete(REGISTERS.activities, id, session.userCode, conn)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: text || `Herbe error ${res.status}` }, { status: res.status })
    }
    trackEvent(session.accountId, session.email, 'activity_deleted').catch(() => {})
    // Write-through: remove from cache
    deleteCachedEvent(session.accountId, 'herbe', id).catch(e =>
      console.warn('[activities/DELETE] cache write-through failed:', e)
    )
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    console.error('[activities/[id]] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
