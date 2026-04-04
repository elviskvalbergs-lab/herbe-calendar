import type { AzureConfig } from '@/lib/accountConfig'

interface GraphTokenCache {
  token: string
  expiresAt: number
}

// Per-account token cache (keyed by tenantId+clientId)
const tokenCacheMap = new Map<string, GraphTokenCache>()

function cacheKey(config: AzureConfig): string {
  return `${config.tenantId}:${config.clientId}`
}

/** Resolve Azure config: use provided config or fall back to env vars */
function resolveConfig(config?: AzureConfig): AzureConfig {
  if (config) return config
  return {
    tenantId: process.env.AZURE_TENANT_ID ?? '',
    clientId: process.env.AZURE_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
    senderEmail: process.env.AZURE_SENDER_EMAIL ?? '',
  }
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
    }
  )
  if (!res.ok) throw new Error(`Graph OAuth failed: ${res.status}`)
  const data = await res.json()
  const entry = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
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
