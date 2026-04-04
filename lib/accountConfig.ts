import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'

export interface AzureConfig {
  tenantId: string
  clientId: string
  clientSecret: string
  senderEmail: string
}

export interface ErpConnection {
  id: string
  name: string
  apiBaseUrl: string
  companyCode: string
  clientId: string
  clientSecret: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: number
  username: string | null
  password: string | null
  active: boolean
}

// Cache per account, 5 min TTL
const azureCache = new Map<string, { data: AzureConfig | null; ts: number }>()
const erpCache = new Map<string, { data: ErpConnection[]; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function decryptField(data: Buffer | null): string {
  if (!data || data.length === 0) return ''
  try { return decrypt(data) } catch { return '' }
}

/** Get Azure config for an account. Falls back to env vars for default account. */
export async function getAzureConfig(accountId: string): Promise<AzureConfig | null> {
  const cached = azureCache.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT tenant_id, client_id, client_secret, sender_email FROM account_azure_config WHERE account_id = $1',
      [accountId]
    )
    if (rows[0] && rows[0].tenant_id) {
      const config: AzureConfig = {
        tenantId: rows[0].tenant_id,
        clientId: rows[0].client_id,
        clientSecret: decryptField(rows[0].client_secret),
        senderEmail: rows[0].sender_email,
      }
      azureCache.set(accountId, { data: config, ts: Date.now() })
      return config
    }
  } catch (e) {
    console.warn('[accountConfig] Azure config lookup failed:', String(e))
  }

  // Fallback to env vars
  const tenantId = process.env.AZURE_TENANT_ID?.trim()
  const clientId = process.env.AZURE_CLIENT_ID?.trim()
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim()
  if (tenantId && clientId && clientSecret) {
    const config: AzureConfig = {
      tenantId, clientId, clientSecret,
      senderEmail: process.env.AZURE_SENDER_EMAIL?.trim() || '',
    }
    azureCache.set(accountId, { data: config, ts: Date.now() })
    return config
  }

  azureCache.set(accountId, { data: null, ts: Date.now() })
  return null
}

/** Get all active ERP connections for an account. Falls back to env vars. */
export async function getErpConnections(accountId: string): Promise<ErpConnection[]> {
  const cached = erpCache.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT * FROM account_erp_connections WHERE account_id = $1 AND active = true ORDER BY name',
      [accountId]
    )
    if (rows.length > 0) {
      const connections: ErpConnection[] = rows.map(r => ({
        id: r.id,
        name: r.name,
        apiBaseUrl: r.api_base_url,
        companyCode: r.company_code,
        clientId: r.client_id,
        clientSecret: decryptField(r.client_secret),
        accessToken: decryptField(r.access_token) || null,
        refreshToken: decryptField(r.refresh_token) || null,
        tokenExpiresAt: Number(r.token_expires_at) || 0,
        username: r.username || null,
        password: decryptField(r.password) || null,
        active: r.active,
      }))
      erpCache.set(accountId, { data: connections, ts: Date.now() })
      return connections
    }
  } catch (e) {
    console.warn('[accountConfig] ERP connections lookup failed:', String(e))
  }

  // Fallback to env vars
  const baseUrl = process.env.HERBE_API_BASE_URL?.trim()
  const companyCode = process.env.HERBE_COMPANY_CODE?.trim()
  if (baseUrl && companyCode) {
    const fallback: ErpConnection = {
      id: 'env-fallback',
      name: 'Default (env)',
      apiBaseUrl: baseUrl,
      companyCode,
      clientId: process.env.HERBE_CLIENT_ID?.trim() || '',
      clientSecret: process.env.HERBE_CLIENT_SECRET?.trim() || '',
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: 0,
      username: process.env.HERBE_USERNAME?.trim() || null,
      password: process.env.HERBE_PASSWORD?.trim() || null,
      active: true,
    }
    erpCache.set(accountId, { data: [fallback], ts: Date.now() })
    return [fallback]
  }

  erpCache.set(accountId, { data: [], ts: Date.now() })
  return []
}

/** Save Azure config for an account (encrypts secrets) */
export async function saveAzureConfig(accountId: string, config: AzureConfig): Promise<void> {
  const encSecret = config.clientSecret ? encrypt(config.clientSecret) : null
  await pool.query(
    `INSERT INTO account_azure_config (account_id, tenant_id, client_id, client_secret, sender_email, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (account_id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id, client_id = EXCLUDED.client_id,
       client_secret = EXCLUDED.client_secret, sender_email = EXCLUDED.sender_email,
       updated_at = now()`,
    [accountId, config.tenantId, config.clientId, encSecret, config.senderEmail]
  )
  azureCache.delete(accountId)
}

/** Invalidate config caches for an account */
export function invalidateConfigCache(accountId: string): void {
  azureCache.delete(accountId)
  erpCache.delete(accountId)
}
