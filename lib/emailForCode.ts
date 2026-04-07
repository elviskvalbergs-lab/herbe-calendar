import { pool } from '@/lib/db'

// Per-account cache: code → email lookups for 5 minutes
const codeEmailCache = new Map<string, { data: Record<string, string>; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function emailForCode(code: string, accountId: string): Promise<string | null> {
  const cached = codeEmailCache.get(accountId)
  if (!cached || Date.now() - cached.ts > CACHE_TTL) {
    try {
      const { rows } = await pool.query<{ generated_code: string; email: string }>(
        'SELECT generated_code, email FROM person_codes WHERE account_id = $1',
        [accountId]
      )
      const data = Object.fromEntries(rows.map(r => [r.generated_code, r.email]))
      codeEmailCache.set(accountId, { data, ts: Date.now() })
    } catch (e) {
      console.warn('[emailForCode] person_codes lookup failed:', String(e))
      codeEmailCache.set(accountId, { data: {}, ts: Date.now() })
    }
  }
  return codeEmailCache.get(accountId)?.data[code] ?? null
}
