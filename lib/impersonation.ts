import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

const IMPERSONATE_COOKIE = 'impersonateAs'

function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export interface ImpersonationInfo {
  active: boolean
  originalEmail: string
  targetEmail: string
  targetUserCode: string
  targetAccountId: string
}

/** Check if the current session is impersonating someone */
export async function getImpersonation(): Promise<ImpersonationInfo | null> {
  try {
    const session = await auth()
    if (!session?.user?.email) return null

    const email = session.user.email.toLowerCase()
    if (!getSuperAdminEmails().includes(email)) return null

    const cookieStore = await cookies()
    const value = cookieStore.get(IMPERSONATE_COOKIE)?.value
    if (!value) return null

    const [targetEmail, targetAccountId] = value.split('|')
    if (!targetEmail || !targetAccountId) return null

    // Look up the target user's code
    const { rows } = await pool.query<{ generated_code: string }>(
      'SELECT generated_code FROM person_codes WHERE LOWER(email) = LOWER($1) AND account_id = $2',
      [targetEmail, targetAccountId]
    )

    return {
      active: true,
      originalEmail: session.user.email,
      targetEmail,
      targetUserCode: rows[0]?.generated_code ?? '',
      targetAccountId,
    }
  } catch {
    return null
  }
}
