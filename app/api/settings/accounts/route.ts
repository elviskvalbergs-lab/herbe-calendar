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
    `SELECT a.id, a.display_name, am.role FROM account_members am
     JOIN tenant_accounts a ON a.id = am.account_id
     WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
     ORDER BY a.display_name`,
    [email]
  )
  const rows = result.rows
  const isAdmin = isSuperAdmin || rows.some((r: { role: string }) => r.role === 'admin')

  return NextResponse.json({ accounts: rows, isSuperAdmin, isAdmin })
}
