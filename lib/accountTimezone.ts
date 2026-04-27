import { pool } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getAdminAccountId } from '@/lib/adminAccountId'
import { resolveMemberTimezone } from '@/lib/timezone'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

type MemberRow = { timezone: string | null } | null
type AccountRow = { default_timezone: string | null } | null

export function resolveTimezoneFromRows(input: { member: MemberRow; account: AccountRow }): string {
  return resolveMemberTimezone({
    memberTz: input.member?.timezone ?? null,
    accountTz: input.account?.default_timezone ?? null,
  })
}

export async function getAccountTimezone(accountId: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ default_timezone: string | null }>(
      'SELECT default_timezone FROM tenant_accounts WHERE id = $1 LIMIT 1',
      [accountId],
    )
    return resolveTimezoneFromRows({ member: null, account: rows[0] ?? null })
  } catch {
    return resolveTimezoneFromRows({ member: null, account: null })
  }
}

export async function getMemberTimezone(accountId: string, email: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ member_tz: string | null; account_tz: string | null }>(
      `SELECT m.timezone AS member_tz, a.default_timezone AS account_tz
       FROM account_members m
       JOIN tenant_accounts a ON a.id = m.account_id
       WHERE m.account_id = $1 AND LOWER(m.email) = LOWER($2)
       LIMIT 1`,
      [accountId, email],
    )
    const row = rows[0]
    if (!row) return getAccountTimezone(accountId)
    return resolveTimezoneFromRows({
      member: { timezone: row.member_tz },
      account: { default_timezone: row.account_tz },
    })
  } catch {
    return getAccountTimezone(accountId)
  }
}

/**
 * Resolve the timezone for the current request: active account from the
 * signed cookie, authed email from the NextAuth session. Falls through to
 * account default, then Europe/Riga, on any failure.
 */
export async function getCurrentMemberTimezone(): Promise<string> {
  const accountId = (await getAdminAccountId()) ?? DEFAULT_ACCOUNT_ID
  const session = await auth()
  const email = session?.user?.email
  if (!email) return getAccountTimezone(accountId)
  return getMemberTimezone(accountId, email)
}
