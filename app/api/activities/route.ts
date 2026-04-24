import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'
import { trackEvent } from '@/lib/analytics'
import { getCachedEvents, upsertCachedEvents } from '@/lib/cache/events'
import { getSyncedConnectionIds } from '@/lib/cache/syncState'
import { buildCacheRows, isRangeCovered } from '@/lib/sync/erp'
import { fetchErpActivitiesForConnectionOrStale } from '@/lib/herbe/recordUtils'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'
import type { Activity } from '@/types'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? date
  const dateTo = searchParams.get('dateTo') ?? date

  if (!persons) return NextResponse.json({ error: 'persons required' }, { status: 400 })
  if (!dateFrom) return NextResponse.json({ error: 'date required' }, { status: 400 })

  try {
    const personList = persons.split(',').map(p => p.trim())

    const effectiveTo = dateTo ?? dateFrom
    // Per-connection cache-vs-live. For each ERP connection: if it has
    // completed a full sync AND the range is inside the sync window, serve
    // from cache; otherwise live-fetch that connection. One failing
    // connection no longer hides events from the others.
    const withinWindow = isRangeCovered(dateFrom, effectiveTo)
    const [connections, syncedIds] = await Promise.all([
      getErpConnections(session.accountId),
      getSyncedConnectionIds(session.accountId, 'herbe'),
    ])
    const perConnection = await Promise.all(connections.map(async conn => {
      if (withinWindow && syncedIds.has(conn.id)) {
        const activities = await getCachedEvents(session.accountId, personList, dateFrom, effectiveTo, 'herbe', conn.id)
        return { activities, stale: false, name: conn.name }
      }
      const { activities, stale } = await fetchErpActivitiesForConnectionOrStale(
        conn, session.accountId, personList, dateFrom, effectiveTo, { includePrivateFields: true },
      )
      return { activities, stale, name: conn.name }
    }))
    const allResults: Activity[] = perConnection.flatMap(c => c.activities)
    const staleConnections = perConnection.filter(c => c.stale).map(c => c.name)

    // Track day_viewed (fire-and-forget)
    if (dateFrom && session.email) {
      trackEvent(session.accountId, session.email, 'day_viewed', { date: dateFrom }).catch(() => {})
    }

    // Envelope when any connection fell back to cache; plain array otherwise
    // (backwards compatible with older clients that do `await res.json()` directly).
    const payload: unknown = staleConnections.length > 0
      ? { activities: allResults, staleConnections }
      : allResults
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[activities] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let postSession
  try {
    postSession = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const connectionId = new URL(req.url).searchParams.get('connectionId')
    const connections = await getErpConnections(postSession.accountId)
    const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]

    const body = await req.json()
    const result = await saveActVcRecord(body, { allowEmptyFields: new Set(['CCPersons']), conn })
    if (!result.ok) {
      const payload: Record<string, unknown> = { error: result.error }
      if (result.errors) payload.errors = result.errors.map(m => ({ message: m }))
      if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
      return NextResponse.json(payload, { status: result.status })
    }

    trackEvent(postSession.accountId, postSession.email, 'activity_created').catch(() => {})

    // Write-through: cache the new activity. Awaited so the client's immediate
    // refetch after save sees the new row instead of racing the DB write.
    try {
      const cacheRows = buildCacheRows(
        result.record,
        postSession.accountId,
        conn?.id ?? '',
        conn?.name ?? '',
      )
      if (cacheRows.length > 0) {
        await upsertCachedEvents(cacheRows)
      }
    } catch (e) {
      console.warn('[activities/POST] cache write-through error:', e)
    }
    return NextResponse.json(result.record, { status: 201 })
  } catch (e) {
    console.error('[activities] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
