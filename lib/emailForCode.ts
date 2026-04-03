import { pool } from '@/lib/db'

// Cache code → email lookups for 5 minutes
let codeEmailCache: { data: Record<string, string>; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export async function emailForCode(code: string): Promise<string | null> {
  if (!codeEmailCache || Date.now() - codeEmailCache.ts > CACHE_TTL) {
    try {
      const { rows } = await pool.query<{ generated_code: string; email: string }>(
        'SELECT generated_code, email FROM person_codes'
      )
      const data = Object.fromEntries(rows.map(r => [r.generated_code, r.email]))
      codeEmailCache = { data, ts: Date.now() }
    } catch (e) {
      console.warn('[emailForCode] person_codes lookup failed:', String(e))
      codeEmailCache = { data: {}, ts: Date.now() }
    }
  }
  return codeEmailCache.data[code] ?? null
}
