import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'

function getAccountIdFromCookie(req: NextRequest): string | undefined {
  return req.cookies.get('adminAccountId')?.value || undefined
}

export async function PATCH(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { email, role, active } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const updates: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (role === 'admin' || role === 'member') {
    updates.push(`role = $${idx++}`)
    params.push(role)
  }
  if (typeof active === 'boolean') {
    updates.push(`active = $${idx++}`)
    params.push(active)
  }

  if (updates.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  params.push(email, session.accountId)
  await pool.query(
    `UPDATE account_members SET ${updates.join(', ')} WHERE email = $${idx++} AND account_id = $${idx}`,
    params
  )

  return NextResponse.json({ ok: true })
}
