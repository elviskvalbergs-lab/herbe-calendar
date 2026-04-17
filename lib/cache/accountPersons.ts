import { pool } from '@/lib/db'

export interface AccountPerson {
  code: string
  email: string
}

/**
 * List all `{ code, email }` pairs known for an account. Uses `person_codes`
 * as the canonical map (column is `generated_code`, aliased to `code`).
 * Rows without a non-empty email are filtered out because Graph/Google
 * fetches need the email to work.
 */
export async function listAccountPersons(accountId: string): Promise<AccountPerson[]> {
  const { rows } = await pool.query<{ generated_code: string; email: string }>(
    `SELECT generated_code, email
     FROM person_codes
     WHERE account_id = $1 AND email IS NOT NULL AND email <> ''
     ORDER BY generated_code`,
    [accountId],
  )
  return rows.map(r => ({ code: r.generated_code, email: r.email }))
}
