import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { getHerbeAccessToken } from './config'
import type { ErpConnection } from '@/lib/accountConfig'

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
    if (conn.accessToken) return `Bearer ${conn.accessToken}`
    if (conn.username && conn.password) {
      return `Basic ${Buffer.from(`${conn.username}:${conn.password}`).toString('base64')}`
    }
    if (conn.clientId && conn.clientSecret) {
      // OAuth flow needed but no cached token — fall through to global config
    }
  }

  // Try OAuth tokens from DB first
  try {
    const token = await getHerbeAccessToken()
    return `Bearer ${token}`
  } catch (e) {
    if ((e as Error).message !== 'HERBE_NOT_CONFIGURED') throw e
  }

  throw new Error('HERBE_NOT_CONFIGURED')
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
  return herbeFetchRaw(herbeUrl(register, query, conn), {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

/** Fetch a single record or mutate it using the path-based URL: /register/id */
export async function herbeFetchById(
  register: string,
  id: string,
  options?: RequestInit,
  conn?: ErpConnection
): Promise<Response> {
  const auth = await herbeAuthHeader(conn)
  return herbeFetchRaw(herbeUrlById(register, id, conn), {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })
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
async function herbeParseJSON(res: Response): Promise<unknown> {
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
