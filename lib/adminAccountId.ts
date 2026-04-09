import { cookies } from 'next/headers'
import { pool } from '@/lib/db'

/** Read the selected admin account ID from cookie, or return undefined */
export async function getAdminAccountId(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get('adminAccountId')?.value || undefined
  } catch {
    return undefined
  }
}

/** Get all accounts (for the switcher dropdown) */
export async function getAllAccounts(): Promise<{ id: string; display_name: string }[]> {
  try {
    const { rows } = await pool.query(
      'SELECT id, display_name FROM tenant_accounts WHERE suspended_at IS NULL ORDER BY display_name'
    )
    return rows
  } catch {
    return []
  }
}
