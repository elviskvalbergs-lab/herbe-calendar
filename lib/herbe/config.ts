import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const HERBE_TOKEN_KEY = 'herbe_access_token'
const HERBE_REFRESH_KEY = 'herbe_refresh_token'
const HERBE_EXPIRES_KEY = 'herbe_token_expires_at'

export interface HerbeTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix ms
}

export async function getStoredTokens(): Promise<HerbeTokens | null> {
  const res = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [[HERBE_TOKEN_KEY, HERBE_REFRESH_KEY, HERBE_EXPIRES_KEY]]
  )
  const map: Record<string, string> = {}
  for (const row of res.rows) map[row.key] = row.value
  if (!map[HERBE_TOKEN_KEY] || !map[HERBE_REFRESH_KEY]) return null
  return {
    accessToken: map[HERBE_TOKEN_KEY],
    refreshToken: map[HERBE_REFRESH_KEY],
    expiresAt: Number(map[HERBE_EXPIRES_KEY] ?? 0),
  }
}

export async function saveTokens(tokens: HerbeTokens): Promise<void> {
  const entries = [
    [HERBE_TOKEN_KEY, tokens.accessToken],
    [HERBE_REFRESH_KEY, tokens.refreshToken],
    [HERBE_EXPIRES_KEY, String(tokens.expiresAt)],
  ]
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, value]
    )
  }
}

const HERBE_OAUTH_TOKEN_URL = 'https://standard-id.hansaworld.com/oauth-token'

async function refreshAccessToken(refreshToken: string): Promise<HerbeTokens> {
  const clientId = process.env.HERBE_CLIENT_ID
  const clientSecret = process.env.HERBE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('HERBE_CLIENT_ID or HERBE_CLIENT_SECRET not set')

  const res = await fetch(HERBE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`Herbe token refresh failed: ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('No access_token in refresh response')

  const tokens: HerbeTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  await saveTokens(tokens)
  return tokens
}

/** Returns a valid access token, refreshing if needed. Throws if not configured. */
export async function getHerbeAccessToken(): Promise<string> {
  const stored = await getStoredTokens()
  if (!stored) throw new Error('HERBE_NOT_CONFIGURED')

  // Refresh 60 seconds before expiry
  if (Date.now() < stored.expiresAt - 60_000) {
    return stored.accessToken
  }

  const refreshed = await refreshAccessToken(stored.refreshToken)
  return refreshed.accessToken
}
