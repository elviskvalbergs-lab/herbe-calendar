import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import type { ErpConnection } from '@/lib/accountConfig'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

const HERBE_OAUTH_TOKEN_URL = 'https://standard-id.hansaworld.com/oauth-token'

/** Refresh an expired per-connection OAuth token and persist the new one. */
async function refreshConnectionToken(conn: ErpConnection): Promise<string | null> {
  if (!conn.refreshToken || !conn.clientId || !conn.clientSecret) return null
  try {
    const res = await fetch(HERBE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: conn.clientId,
        client_secret: conn.clientSecret,
        refresh_token: conn.refreshToken,
      }),
    })
    if (!res.ok) {
      console.warn(`[herbe] token refresh failed for connection ${conn.id}: ${res.status}`)
      return null
    }
    const data = await res.json()
    if (!data.access_token) return null

    const encAccess = encrypt(data.access_token)
    const encRefresh = data.refresh_token ? encrypt(data.refresh_token) : null
    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000

    await pool.query(
      `UPDATE account_erp_connections
       SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [encAccess, encRefresh, expiresAt, conn.id]
    )
    console.log(`[herbe] refreshed token for connection ${conn.id}, expires in ${data.expires_in}s`)
    return data.access_token as string
  } catch (e) {
    console.warn(`[herbe] token refresh error for connection ${conn.id}:`, String(e))
    return null
  }
}

/**
 * Custom fetch that uses Node.js http/https with insecureHTTPParser: true.
 * Required for Herbe ERP servers that send both Content-Length and Transfer-Encoding
 * headers (invalid per HTTP/1.1 but accepted by older clients).
 */
async function herbeFetchRaw(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const makeRequest = parsed.protocol === 'https:' ? httpsRequest : httpRequest

    const headers: Record<string, string> = {}
    if (init.headers && typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v
      }
    }

    const req = makeRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: (init.method ?? 'GET').toUpperCase(),
        headers,
        insecureHTTPParser: true,
      },
      (res) => {
        const responseHeaders = new Headers()
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) {
            responseHeaders.set(key, Array.isArray(val) ? val.join(', ') : String(val))
          }
        }
        const status = res.statusCode ?? 200

        // Decompress gzip/deflate responses if needed
        const encoding = res.headers['content-encoding']
        const stream: Readable = encoding === 'gzip' ? res.pipe(createGunzip()) : res

        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          const body = Buffer.concat(chunks)
          // Remove content-encoding header since we've decoded it
          responseHeaders.delete('content-encoding')
          resolve(new Response(body, { status, headers: responseHeaders }))
        })
        stream.on('error', reject)
      }
    )

    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function herbeAuthHeader(conn?: ErpConnection): Promise<string> {
  // If explicit connection config provided, use it
  if (conn) {
    // Use access token if it hasn't expired (with 60s buffer)
    if (conn.accessToken && conn.tokenExpiresAt > Date.now() + 60_000) {
      return `Bearer ${conn.accessToken}`
    }
    // Token expired — try to refresh it
    if (conn.accessToken && conn.refreshToken) {
      const newToken = await refreshConnectionToken(conn)
      if (newToken) return `Bearer ${newToken}`
    }
    if (conn.username && conn.password) {
      return `Basic ${Buffer.from(`${conn.username}:${conn.password}`).toString('base64')}`
    }
    if (conn.clientId && conn.clientSecret) {
      // OAuth configured but no valid token yet — needs OAuth setup in admin
    }
    throw new Error('HERBE_NOT_CONFIGURED: connection has no valid credentials')
  }

  throw new Error('HERBE_NOT_CONFIGURED: no connection provided')
}

export function herbeUrl(register: string, query?: string, conn?: ErpConnection): string {
  const base = (conn?.apiBaseUrl || '').trim()
  const company = (conn?.companyCode || '').trim()
  const url = `${base}/${company}/${register}`
  return query ? `${url}?${query}` : url
}

export function herbeUrlById(register: string, id: string, conn?: ErpConnection): string {
  const base = (conn?.apiBaseUrl || '').trim()
  const company = (conn?.companyCode || '').trim()
  return `${base}/${company}/${register}/${id}`
}

export async function herbeFetch(
  register: string,
  query?: string,
  options?: RequestInit,
  conn?: ErpConnection
): Promise<Response> {
  const auth = await herbeAuthHeader(conn)
  const res = await herbeFetchRaw(herbeUrl(register, query, conn), {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  // Retry once on 401 with a fresh token (handles server-side expiry mismatches)
  if (res.status === 401 && conn?.refreshToken) {
    const newToken = await refreshConnectionToken(conn)
    if (newToken) {
      return herbeFetchRaw(herbeUrl(register, query, conn), {
        ...options,
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options?.headers ?? {}),
        },
      })
    }
  }

  return res
}

/** Fetch a single record or mutate it using the path-based URL: /register/id */
export async function herbeFetchById(
  register: string,
  id: string,
  options?: RequestInit,
  conn?: ErpConnection
): Promise<Response> {
  const auth = await herbeAuthHeader(conn)
  const res = await herbeFetchRaw(herbeUrlById(register, id, conn), {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  if (res.status === 401 && conn?.refreshToken) {
    const newToken = await refreshConnectionToken(conn)
    if (newToken) {
      return herbeFetchRaw(herbeUrlById(register, id, conn), {
        ...options,
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options?.headers ?? {}),
        },
      })
    }
  }

  return res
}

/** Function to delete records using the specialized WebExcellentAPI.hal action endpoint */
export async function herbeWebExcellentDelete(
  register: string,
  id: string,
  userCode: string,
  conn?: ErpConnection
): Promise<Response> {
  const auth = await herbeAuthHeader(conn)
  const base = (conn?.apiBaseUrl || '').trim()
  const company = (conn?.companyCode || '').trim()

  let baseUrlFn = base
  try {
    const parsed = new URL(base)
    // Build /WebExcellentAPI.hal at the origin root since endpoints usually live there
    baseUrlFn = parsed.origin
  } catch {
    // fallback if unparseable
  }

  const query = new URLSearchParams({
    compno: company,
    usercode: userCode,
    action: 'delete',
    register: register,
    id: id
  })

  // Per user snippet: WebExcellentAPI.hal?compno=3&usercode=EKS&action=delete&register=ActVc&id=12345
  const url = `${baseUrlFn}/WebExcellentAPI.hal?${query.toString()}`

  return herbeFetchRaw(url, {
    method: 'GET',
    headers: {
      Authorization: auth,
      Accept: '*/*',
    },
  })
}

/**
 * Parse a Herbe response, sanitizing any unescaped control characters
 * that some ERP servers embed in string values (tab, newline, etc.).
 */
export async function herbeParseJSON(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // Sanitize control characters (0x00–0x1F, 0x7F) and retry
    return JSON.parse(text.replace(/[\x00-\x1f\x7f]/g, ' '))
  }
}

/** Fetch all pages for a register. Stops when a page has fewer records than limit. */
export async function herbeFetchAll(
  register: string,
  params: Record<string, string> = {},
  limit = 100,
  conn?: ErpConnection
): Promise<unknown[]> {
  const results: unknown[] = []
  let offset = 0
  while (true) {
    const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) }).toString()
    const res = await herbeFetch(register, query, undefined, conn)
    if (!res.ok) throw new Error(`Herbe ${register} fetch failed: ${res.status}`)
    const json = await herbeParseJSON(res)
    // Response format: { data: { [register]: [...] } }
    const page = ((json as Record<string, unknown>)?.data?.[register as keyof unknown] ?? []) as unknown[]
    results.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return results
}

/**
 * Fetch records with sequence tracking. Used for incremental sync.
 * Returns all records plus the Sequence header from the last page.
 *
 * For incremental sync: pass `updates_after` in params.
 * For full sync: pass `sort` and `range` in params.
 */
export async function herbeFetchWithSequence(
  register: string,
  params: Record<string, string> = {},
  limit = 1000,
  conn?: ErpConnection
): Promise<{ records: unknown[]; sequence: string | null }> {
  const records: unknown[] = []
  let lastSequence: string | null = null
  let offset = 0

  while (true) {
    const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) }).toString()
    const res = await herbeFetch(register, query, undefined, conn)
    if (!res.ok) throw new Error(`Herbe ${register} fetch failed: ${res.status}`)

    const seq = res.headers.get('Sequence')
    if (seq) lastSequence = seq

    const json = await herbeParseJSON(res)
    const page = ((json as Record<string, unknown>)?.data?.[register as keyof unknown] ?? []) as unknown[]
    records.push(...page)

    if (page.length < limit) break
    offset += limit
  }

  return { records, sequence: lastSequence }
}
