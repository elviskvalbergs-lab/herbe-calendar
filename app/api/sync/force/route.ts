import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { forceSyncRange } from '@/lib/sync/erp'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const status = String(e).includes('FORBIDDEN') ? 403 : 401
    console.error('[sync/force] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status })
  }

  const body = await req.json().catch(() => ({}))
  const { dateFrom, dateTo } = body as { dateFrom?: string; dateTo?: string }

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  try {
    const result = await forceSyncRange(session.accountId, dateFrom, dateTo)
    return NextResponse.json({ synced: true, ...result })
  } catch (e) {
    console.error('[sync/force] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
