import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'

export interface ZoomConfig {
  zoomAccountId: string
  clientId: string
  clientSecret: string
}

const tokenCacheMap = new Map<string, { token: string; expiresAt: number }>()

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token'
const ZOOM_API_BASE = 'https://api.zoom.us/v2'
const CONFIG_CACHE = new Map<string, { data: ZoomConfig | null; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE = 50
const API_TIMEOUT_MS = 30_000

export async function getZoomConfig(accountId: string): Promise<ZoomConfig | null> {
  const cached = CONFIG_CACHE.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT zoom_account_id, client_id, client_secret FROM account_zoom_config WHERE account_id = $1',
      [accountId]
    )
    if (rows.length === 0) {
      if (CONFIG_CACHE.size >= MAX_CACHE) CONFIG_CACHE.clear()
      CONFIG_CACHE.set(accountId, { data: null, ts: Date.now() })
      return null
    }
    const config: ZoomConfig = {
      zoomAccountId: rows[0].zoom_account_id,
      clientId: rows[0].client_id,
      clientSecret: decrypt(rows[0].client_secret),
    }
    if (CONFIG_CACHE.size >= MAX_CACHE) CONFIG_CACHE.clear()
    CONFIG_CACHE.set(accountId, { data: config, ts: Date.now() })
    return config
  } catch (e) {
    console.warn('[zoom] config lookup failed:', String(e))
    return null
  }
}

async function getAccessToken(config: ZoomConfig): Promise<string> {
  const cacheKey = `${config.clientId}:${config.zoomAccountId}`
  const cached = tokenCacheMap.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: config.zoomAccountId,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoom token request failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error('No access_token in Zoom response')

  if (tokenCacheMap.size >= MAX_CACHE) {
    const now = Date.now()
    for (const [k, v] of tokenCacheMap) { if (now >= v.expiresAt) tokenCacheMap.delete(k) }
    if (tokenCacheMap.size >= MAX_CACHE) tokenCacheMap.clear()
  }
  tokenCacheMap.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  })
  return data.access_token
}

export async function createZoomMeeting(
  config: ZoomConfig,
  topic: string,
  startTime: string,
  durationMinutes: number,
): Promise<{ joinUrl: string; meetingId: string }> {
  const token = await getAccessToken(config)
  const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: 2,
      start_time: startTime,
      duration: durationMinutes,
      settings: { join_before_host: true, waiting_room: false },
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoom meeting creation failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return { joinUrl: data.join_url, meetingId: String(data.id) }
}

export async function testZoomConnection(config: ZoomConfig): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const token = await getAccessToken(config)
    const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: true, email: data.email }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function saveZoomConfig(
  accountId: string,
  zoomAccountId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const encSecret = encrypt(clientSecret)
  await pool.query(
    `INSERT INTO account_zoom_config (account_id, zoom_account_id, client_id, client_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id)
     DO UPDATE SET zoom_account_id = $2, client_id = $3, client_secret = $4, updated_at = now()`,
    [accountId, zoomAccountId, clientId, encSecret]
  )
  CONFIG_CACHE.delete(accountId)
}
