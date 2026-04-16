import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { forceSyncRange } from '@/lib/sync/erp'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
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
    console.error('[sync/force] failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
