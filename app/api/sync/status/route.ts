import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAllSyncStates } from '@/lib/cache/syncState'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const states = await getAllSyncStates(session.accountId)
    return NextResponse.json(states)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
