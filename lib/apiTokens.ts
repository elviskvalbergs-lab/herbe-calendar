import { createHash, randomBytes } from 'crypto'
import { pool } from '@/lib/db'

/** Generate a new API token. Returns the raw token (show once) and its hash. */
export function generateToken(): { raw: string; hash: string } {
  const raw = `hcal_${randomBytes(32).toString('hex')}`
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

/** Validate a Bearer token. Returns { accountId, scope } or null. */
export async function validateToken(token: string): Promise<{ accountId: string; scope: string } | null> {
  const hash = createHash('sha256').update(token).digest('hex')
  const { rows } = await pool.query(
    `SELECT account_id, scope FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash]
  )
  if (rows.length === 0) return null

  // Update last_used (fire-and-forget)
  pool.query('UPDATE api_tokens SET last_used = now() WHERE token_hash = $1', [hash]).catch(() => {})

  return { accountId: rows[0].account_id, scope: rows[0].scope }
}
