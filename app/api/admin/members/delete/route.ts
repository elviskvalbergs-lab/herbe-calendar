import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAccountIdFromCookie } from '@/lib/adminAccountId'
import { countMemberReferences, deleteMember } from '@/lib/personCodes'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, generatedCode, cascade, dryRun } = await req.json().catch(() => ({}))
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  try {
    if (dryRun) {
      const refs = await countMemberReferences(session.accountId, email, generatedCode ?? null)
      return NextResponse.json({ dryRun: true, ...refs })
    }
    const result = await deleteMember(session.accountId, email, generatedCode ?? null, !!cascade)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[admin/members/delete] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
