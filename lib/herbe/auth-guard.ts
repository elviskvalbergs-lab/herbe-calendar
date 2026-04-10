import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { verifyCookieValue } from '@/lib/signedCookie'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

// Cache email → accountId for 2 minutes (short TTL to handle account switching)
const accountCache = new Map<string, { accountId: string; ts: number }>()
const ACCOUNT_CACHE_TTL = 2 * 60 * 1000

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
    const impCookieRaw = cookieStore.get('impersonateAs')?.value
    if (impCookieRaw) {
      const superAdmins = (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      if (superAdmins.includes(email)) {
        const impCookie = verifyCookieValue(impCookieRaw)
        if (impCookie) {
          const [rawEmail, targetAccountId] = impCookie.split('|')
          const targetEmail = decodeURIComponent(rawEmail)
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
    }
  } catch {}

  // Check activeAccountId cookie — allows switching between accounts
  let activeAccountOverride: string | undefined
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    activeAccountOverride = cookieStore.get('activeAccountId')?.value || undefined
  } catch (e) {
    console.warn('[auth-guard] Failed to read activeAccountId cookie:', String(e))
  }

  // Skip cache when activeAccountId is set — always resolve fresh for account switching
  if (!activeAccountOverride) {
    const cached = accountCache.get(email)
    if (cached && Date.now() - cached.ts < ACCOUNT_CACHE_TTL) {
      return { userCode, email: session.user.email, accountId: cached.accountId }
    }
  }

  try {
    // If activeAccountId is set, verify user is a member of that account (or super admin)
    if (activeAccountOverride) {
      const superAdmins = (process.env.SUPER_ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
      const isSuperAdmin = superAdmins.includes(email)

      if (isSuperAdmin) {
        // Super admins can access any account
        const { rows: accRows } = await pool.query('SELECT id FROM tenant_accounts WHERE id = $1 AND suspended_at IS NULL', [activeAccountOverride])
        if (accRows.length > 0) {
          accountCache.set(email, { accountId: activeAccountOverride, ts: Date.now() })
          // Resolve userCode from this account's person_codes
          const { rows: pcRows } = await pool.query<{ generated_code: string }>(
            'SELECT generated_code FROM person_codes WHERE account_id = $1 AND LOWER(email) = LOWER($2)',
            [activeAccountOverride, email]
          ).catch(() => ({ rows: [] }))
          return { userCode: pcRows[0]?.generated_code ?? userCode, email: session.user.email, accountId: activeAccountOverride }
        }
      } else {
        // Regular user — must be a member
        const { rows: memberRows } = await pool.query<{ account_id: string }>(
          `SELECT am.account_id FROM account_members am
           JOIN tenant_accounts a ON a.id = am.account_id
           WHERE am.account_id = $1 AND LOWER(am.email) = $2 AND am.active = true AND a.suspended_at IS NULL`,
          [activeAccountOverride, email]
        )
        if (memberRows.length > 0) {
          accountCache.set(email, { accountId: activeAccountOverride, ts: Date.now() })
          const { rows: pcRows } = await pool.query<{ generated_code: string }>(
            'SELECT generated_code FROM person_codes WHERE account_id = $1 AND LOWER(email) = LOWER($2)',
            [activeAccountOverride, email]
          ).catch(() => ({ rows: [] }))
          return { userCode: pcRows[0]?.generated_code ?? userCode, email: session.user.email, accountId: activeAccountOverride }
        }
      }
      // Fall through to default resolution if override account is invalid
    }

    const { rows } = await pool.query<{ account_id: string }>(
      `SELECT am.account_id FROM account_members am
       JOIN tenant_accounts a ON a.id = am.account_id
       WHERE LOWER(am.email) = $1 AND am.active = true AND a.suspended_at IS NULL
       LIMIT 1`,
      [email]
    )
    if (!rows[0]?.account_id) {
      console.error(`[auth-guard] No account membership found for ${email}`)
      throw new Error(`No account membership for ${email}`)
    }
    const accountId = rows[0].account_id
    accountCache.set(email, { accountId, ts: Date.now() })
    return { userCode, email: session.user.email, accountId }
  } catch (e) {
    console.error(`[auth-guard] Account lookup failed for ${email}:`, String(e))
    throw new Error(`Account membership required. Contact your admin to be added.`)
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
