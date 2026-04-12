import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { signCookieValue, verifyCookieValue } from '@/lib/signedCookie'

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = session.user.email.toLowerCase()
  const superAdmins = (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const isSuperAdmin = superAdmins.includes(email)

  // Show accounts where the user is a member (regardless of super admin status)
  const result = await pool.query(
    `SELECT a.id, a.display_name, a.logo_url, am.role FROM account_members am
     JOIN tenant_accounts a ON a.id = am.account_id
     WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
     ORDER BY a.display_name`,
    [email]
  )
  const rows = result.rows
  // Check admin role for the active account (from cookie), not just any account
  let activeAccountId: string | undefined
  try {
    const { cookies } = await import('next/headers')
    const raw = (await cookies()).get('activeAccountId')?.value
    if (raw) activeAccountId = verifyCookieValue(raw) ?? undefined
  } catch {}
  const activeAccount = activeAccountId
    ? rows.find((r: { id: string }) => r.id === activeAccountId)
    : rows[0]
  const isAdmin = isSuperAdmin || (activeAccount as { role?: string })?.role === 'admin'

  return NextResponse.json({ accounts: rows, isSuperAdmin, isAdmin, email })
}

/** POST: Switch active account — sets signed cookie */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accountId } = await req.json()
  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  }

  // Verify user is a member of the target account
  const email = session.user.email.toLowerCase()
  const { rows } = await pool.query(
    'SELECT 1 FROM account_members WHERE LOWER(email) = $1 AND account_id = $2 AND active = true',
    [email, accountId]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not a member of this account' }, { status: 403 })
  }

  const signed = signCookieValue(accountId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('activeAccountId', signed, {
    path: '/',
    maxAge: 30 * 24 * 3600,
    httpOnly: true,
    sameSite: 'lax',
  })
  return res
}
