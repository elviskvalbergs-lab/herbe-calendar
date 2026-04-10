import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { getOAuthAppClient, getOAuthCalendarClient } from './client'
import type { UserGoogleAccount, UserGoogleCalendar } from '@/types'

/** Exchange an auth code for tokens and store them. Returns the google email. */
export async function exchangeAndStoreTokens(
  code: string,
  userEmail: string,
  accountId: string,
): Promise<{ googleEmail: string; tokenId: string }> {
  const client = getOAuthAppClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return access and refresh tokens')
  }

  // Get the Google account email
  client.setCredentials(tokens)
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google user info')
  const userInfo = await res.json()
  const googleEmail: string = userInfo.email

  const encAccess = encrypt(tokens.access_token)
  const encRefresh = encrypt(tokens.refresh_token)
  const expiresAt = tokens.expiry_date ?? Date.now() + 3600_000

  const { rows } = await pool.query(
    `INSERT INTO user_google_tokens (user_email, account_id, google_email, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_email, google_email, account_id)
     DO UPDATE SET access_token = $4, refresh_token = $5, token_expires_at = $6, updated_at = now()
     RETURNING id`,
    [userEmail, accountId, googleEmail, encAccess, encRefresh, expiresAt]
  )

  return { googleEmail, tokenId: rows[0].id }
}

/** Get a valid access token for a user's Google account, refreshing if needed. */
export async function getValidAccessToken(tokenId: string): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT id, access_token, refresh_token, token_expires_at FROM user_google_tokens WHERE id = $1',
    [tokenId]
  )
  if (rows.length === 0) return null
  const row = rows[0]

  const accessToken = decrypt(row.access_token)
  const refreshToken = decrypt(row.refresh_token)
  const expiresAt = Number(row.token_expires_at)

  // Still valid (60s buffer)
  if (Date.now() < expiresAt - 60_000) return accessToken

  // Refresh
  try {
    const client = getOAuthAppClient()
    client.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await client.refreshAccessToken()
    if (!credentials.access_token) return null

    const newExpiresAt = credentials.expiry_date ?? Date.now() + 3600_000
    await pool.query(
      `UPDATE user_google_tokens
       SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [encrypt(credentials.access_token), credentials.refresh_token ? encrypt(credentials.refresh_token) : null, newExpiresAt, tokenId]
    )
    return credentials.access_token
  } catch (e) {
    console.warn(`[google/userOAuth] token refresh failed for ${tokenId}:`, String(e))
    return null
  }
}

/** Fetch calendar list from Google and sync with DB. Preserves existing colors/enabled state. */
export async function syncCalendarList(tokenId: string, accessToken: string): Promise<void> {
  const calendar = getOAuthCalendarClient(accessToken)
  const res = await calendar.calendarList.list({ fields: 'items(id,summary,backgroundColor)' })
  const items = res.data.items ?? []

  for (const item of items) {
    const calId = item.id ?? ''
    const name = item.summary ?? calId
    await pool.query(
      `INSERT INTO user_google_calendars (user_google_token_id, calendar_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_google_token_id, calendar_id)
       DO UPDATE SET name = $3`,
      [tokenId, calId, name]
    )
  }

  // Remove calendars no longer in Google
  const googleCalIds = items.map(i => i.id).filter(Boolean)
  if (googleCalIds.length > 0) {
    await pool.query(
      `DELETE FROM user_google_calendars
       WHERE user_google_token_id = $1 AND calendar_id != ALL($2)`,
      [tokenId, googleCalIds]
    )
  }
}

/** Get all connected Google accounts and their calendars for a user. */
export async function getUserGoogleAccounts(
  userEmail: string,
  accountId: string,
): Promise<UserGoogleAccount[]> {
  const { rows: tokens } = await pool.query(
    'SELECT id, google_email FROM user_google_tokens WHERE user_email = $1 AND account_id = $2 ORDER BY created_at',
    [userEmail, accountId]
  )

  const accounts: UserGoogleAccount[] = []
  for (const token of tokens) {
    const { rows: cals } = await pool.query(
      'SELECT id, calendar_id, name, color, enabled FROM user_google_calendars WHERE user_google_token_id = $1 ORDER BY name',
      [token.id]
    )
    accounts.push({
      id: token.id,
      googleEmail: token.google_email,
      calendars: cals.map(c => ({
        id: c.id,
        calendarId: c.calendar_id,
        name: c.name,
        color: c.color,
        enabled: c.enabled,
        googleEmail: token.google_email,
        tokenId: token.id,
      })),
    })
  }
  return accounts
}

/** Revoke a Google account and delete all associated data. */
export async function revokeGoogleAccount(
  userEmail: string,
  accountId: string,
  googleEmail: string,
): Promise<void> {
  const { rows } = await pool.query(
    'SELECT id, access_token FROM user_google_tokens WHERE user_email = $1 AND account_id = $2 AND google_email = $3',
    [userEmail, accountId, googleEmail]
  )
  if (rows.length === 0) return

  // Try to revoke with Google (best-effort)
  try {
    const accessToken = decrypt(rows[0].access_token)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' })
  } catch { /* best-effort revocation */ }

  // Cascade deletes calendars
  await pool.query('DELETE FROM user_google_tokens WHERE id = $1', [rows[0].id])
}
