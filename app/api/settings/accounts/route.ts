import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

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
    activeAccountId = (await cookies()).get('activeAccountId')?.value || undefined
  } catch {}
  const activeAccount = activeAccountId
    ? rows.find((r: { id: string }) => r.id === activeAccountId)
    : rows[0]
  const isAdmin = isSuperAdmin || (activeAccount as { role?: string })?.role === 'admin'

  return NextResponse.json({ accounts: rows, isSuperAdmin, isAdmin, email })
}
