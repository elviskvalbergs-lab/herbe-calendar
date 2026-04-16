import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { deleteCachedEvents, deleteCachedEventsBySource } from '@/lib/cache/events'
import { resetSyncState } from '@/lib/cache/syncState'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const { dateFrom, dateTo, all } = body as { dateFrom?: string; dateTo?: string; all?: boolean }

  try {
    let deleted: number

    if (all) {
      deleted = await deleteCachedEventsBySource(session.accountId, 'herbe')
      await resetSyncState(session.accountId, 'herbe')
    } else if (dateFrom && dateTo) {
      deleted = await deleteCachedEvents(session.accountId, 'herbe', dateFrom, dateTo)
    } else {
      return NextResponse.json({ error: 'Provide dateFrom+dateTo or all=true' }, { status: 400 })
    }

    return NextResponse.json({ cleared: true, eventsDeleted: deleted })
  } catch (e) {
    console.error('[sync/nuke] failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
