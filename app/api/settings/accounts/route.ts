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

  let rows
  if (isSuperAdmin) {
    // Super admins see all accounts
    const result = await pool.query(
      'SELECT id, display_name FROM tenant_accounts WHERE suspended_at IS NULL ORDER BY display_name'
    )
    rows = result.rows
  } else {
    // Regular users see accounts they're members of
    const result = await pool.query(
      `SELECT a.id, a.display_name FROM account_members am
       JOIN tenant_accounts a ON a.id = am.account_id
       WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
       ORDER BY a.display_name`,
      [email]
    )
    rows = result.rows
  }

  return NextResponse.json({ accounts: rows, isSuperAdmin })
}
