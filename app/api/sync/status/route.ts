import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAllSyncStates } from '@/lib/cache/syncState'

export async function GET() {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const status = String(e).includes('FORBIDDEN') ? 403 : 401
    console.error('[sync/status] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status })
  }

  try {
    const states = await getAllSyncStates(session.accountId)
    return NextResponse.json(states)
  } catch (e) {
    console.error('[sync/status] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
