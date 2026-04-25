import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { pool } from '@/lib/db'
import { verifyCookieValue } from '@/lib/signedCookie'

/** Read the selected admin account ID from signed cookie (route handler variant) */
export function getAccountIdFromCookie(req: NextRequest): string | undefined {
  const raw = req.cookies.get('adminAccountId')?.value
  if (!raw) return undefined
  return verifyCookieValue(raw) ?? undefined
}

/** Read the selected admin account ID from signed cookie, or return undefined */
export async function getAdminAccountId(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get('adminAccountId')?.value
    if (!raw) return undefined
    return verifyCookieValue(raw) ?? undefined
  } catch {
    return undefined
  }
}

/** Get all accounts (for the switcher dropdown) */
export async function getAllAccounts(): Promise<{ id: string; display_name: string; logo_url?: string }[]> {
  try {
    const { rows } = await pool.query(
      'SELECT id, display_name, logo_url FROM tenant_accounts WHERE suspended_at IS NULL ORDER BY display_name'
    )
    return rows
  } catch {
    return []
  }
}

/** Look up the logo for a single account; null if absent. */
export async function getAccountLogoUrl(accountId: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ logo_url: string | null }>(
      'SELECT logo_url FROM tenant_accounts WHERE id = $1',
      [accountId]
    )
    return rows[0]?.logo_url ?? null
  } catch {
    return null
  }
}
