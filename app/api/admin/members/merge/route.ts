import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAccountIdFromCookie } from '@/lib/adminAccountId'
import { mergePersonCodes } from '@/lib/personCodes'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { fromPersonCodeId, intoPersonCodeId } = await req.json().catch(() => ({}))
  if (!fromPersonCodeId || !intoPersonCodeId) {
    return NextResponse.json({ error: 'fromPersonCodeId and intoPersonCodeId required' }, { status: 400 })
  }
  if (fromPersonCodeId === intoPersonCodeId) {
    return NextResponse.json({ error: 'Cannot merge a row into itself' }, { status: 400 })
  }

  try {
    const result = await mergePersonCodes(session.accountId, fromPersonCodeId, intoPersonCodeId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
