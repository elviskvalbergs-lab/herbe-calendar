import type { AzureConfig } from '@/lib/accountConfig'

interface GraphTokenCache {
  token: string
  expiresAt: number
}

const API_TIMEOUT_MS = 30_000

// Per-account token cache (keyed by tenantId+clientId), bounded
const tokenCacheMap = new Map<string, GraphTokenCache>()
const MAX_TOKEN_CACHE = 50

function cacheKey(config: AzureConfig): string {
  return `${config.tenantId}:${config.clientId}`
}

/** Resolve Azure config: requires config from DB (no env var fallback) */
function resolveConfig(config?: AzureConfig): AzureConfig {
  if (config) return config
  throw new Error('Azure config not provided — configure via admin panel')
}

async function getGraphToken(config: AzureConfig): Promise<string> {
  const key = cacheKey(config)
  const cached = tokenCacheMap.get(key)
  if (cached && Date.now() < cached.expiresAt - 30_000) {
    return cached.token
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    }
  )
  if (!res.ok) throw new Error(`Graph OAuth failed: ${res.status}`)
  const data = await res.json()
  const entry = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  if (tokenCacheMap.size >= MAX_TOKEN_CACHE) {
    const now = Date.now()
    for (const [k, v] of tokenCacheMap) { if (now >= v.expiresAt) tokenCacheMap.delete(k) }
    if (tokenCacheMap.size >= MAX_TOKEN_CACHE) tokenCacheMap.clear()
  }
  tokenCacheMap.set(key, entry)
  return entry.token
}

export async function graphFetch(path: string, options?: RequestInit, azureConfig?: AzureConfig): Promise<Response> {
  const config = resolveConfig(azureConfig)
  const token = await getGraphToken(config)
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    signal: options?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
  })
}

export async function sendMail(to: string, subject: string, html: string, azureConfig?: AzureConfig): Promise<void> {
  const config = resolveConfig(azureConfig)
  const res = await graphFetch(`/users/${config.senderEmail}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  }, config)
  if (!res.ok) throw new Error(`sendMail failed: ${res.status} ${await res.text()}`)
}
