import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

export interface AdminSession {
  email: string
  userCode: string
  accountId: string
  role: 'admin' | 'member'
  isSuperAdmin: boolean
  accountName: string
}

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Require an authenticated admin session.
 * Returns the enriched session with account context and role.
 * Throws if not authenticated or not an admin/superadmin.
 */
export async function requireAdminSession(requiredRole: 'admin' | 'superadmin' = 'admin'): Promise<AdminSession> {
  const session = await auth()
  if (!session?.user?.email) {
    throw new Error('UNAUTHORIZED')
  }

  const email = session.user.email.toLowerCase()
  const isSuperAdmin = getSuperAdminEmails().includes(email)

  if (requiredRole === 'superadmin' && !isSuperAdmin) {
    throw new Error('FORBIDDEN')
  }

  // Look up account membership
  const { rows } = await pool.query<{
    account_id: string
    role: 'admin' | 'member'
    display_name: string
  }>(
    `SELECT am.account_id, am.role, a.display_name
     FROM account_members am
     JOIN tenant_accounts a ON a.id = am.account_id
     WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
     LIMIT 1`,
    [email]
  )

  if (rows.length === 0) {
    if (isSuperAdmin) {
      // Super admins can access even without membership — use default account
      return {
        email,
        userCode: (session.user as { userCode?: string }).userCode ?? '',
        accountId: DEFAULT_ACCOUNT_ID,
        role: 'admin',
        isSuperAdmin: true,
        accountName: 'Default',
      }
    }
    throw new Error('FORBIDDEN')
  }

  const membership = rows[0]

  // Non-super, non-admin trying to access admin panel
  if (!isSuperAdmin && membership.role !== 'admin') {
    throw new Error('FORBIDDEN')
  }

  return {
    email,
    userCode: (session.user as { userCode?: string }).userCode ?? '',
    accountId: membership.account_id,
    role: membership.role,
    isSuperAdmin,
    accountName: membership.display_name,
  }
}
