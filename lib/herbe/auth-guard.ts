import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

// Cache email → accountId for 10 minutes
const accountCache = new Map<string, { accountId: string; ts: number }>()
const ACCOUNT_CACHE_TTL = 10 * 60 * 1000

export interface SessionUser {
  userCode: string
  email: string
  accountId: string
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.email) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const email = session.user.email.toLowerCase()
  const userCode = (session.user as { userCode?: string }).userCode ?? ''

  // Check impersonation cookie (super admins only)
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const impCookie = cookieStore.get('impersonateAs')?.value
    if (impCookie) {
      const superAdmins = (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      if (superAdmins.includes(email)) {
        const [targetEmail, targetAccountId] = impCookie.split('|')
        if (targetEmail && targetAccountId) {
          const { rows } = await pool.query<{ generated_code: string }>(
            'SELECT generated_code FROM person_codes WHERE LOWER(email) = LOWER($1) AND account_id = $2',
            [targetEmail, targetAccountId]
          )
          return {
            userCode: rows[0]?.generated_code ?? '',
            email: targetEmail,
            accountId: targetAccountId,
          }
        }
      }
    }
  } catch {}

  // Resolve account from membership (cached)
  const cached = accountCache.get(email)
  if (cached && Date.now() - cached.ts < ACCOUNT_CACHE_TTL) {
    return { userCode, email: session.user.email, accountId: cached.accountId }
  }

  try {
    const { rows } = await pool.query<{ account_id: string }>(
      `SELECT am.account_id FROM account_members am
       JOIN tenant_accounts a ON a.id = am.account_id
       WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
       LIMIT 1`,
      [email]
    )
    const accountId = rows[0]?.account_id ?? DEFAULT_ACCOUNT_ID
    accountCache.set(email, { accountId, ts: Date.now() })
    return { userCode, email: session.user.email, accountId }
  } catch {
    return { userCode, email: session.user.email, accountId: DEFAULT_ACCOUNT_ID }
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
