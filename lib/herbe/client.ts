import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { getHerbeAccessToken } from './config'

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
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          const responseHeaders = new Headers()
          for (const [key, val] of Object.entries(res.headers)) {
            if (val !== undefined) {
              responseHeaders.set(key, Array.isArray(val) ? val.join(', ') : String(val))
            }
          }
          resolve(new Response(body, { status: res.statusCode ?? 200, headers: responseHeaders }))
        })
        res.on('error', reject)
      }
    )

    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function herbeAuthHeader(): Promise<string> {
  // Try OAuth tokens from DB first
  try {
    const token = await getHerbeAccessToken()
    return `Bearer ${token}`
  } catch (e) {
    if ((e as Error).message !== 'HERBE_NOT_CONFIGURED') throw e
  }

  // Fallback: Basic Auth from env vars (for local dev)
  const username = process.env.HERBE_USERNAME
  const password = process.env.HERBE_PASSWORD
  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  }

  throw new Error('HERBE_NOT_CONFIGURED')
}

export function herbeUrl(register: string, query?: string): string {
  const base = (process.env.HERBE_API_BASE_URL ?? '').trim()
  const company = (process.env.HERBE_COMPANY_CODE ?? '').trim()
  const url = `${base}/${company}/${register}`
  return query ? `${url}?${query}` : url
}

export function herbeUrlById(register: string, id: string): string {
  const base = (process.env.HERBE_API_BASE_URL ?? '').trim()
  const company = (process.env.HERBE_COMPANY_CODE ?? '').trim()
  return `${base}/${company}/${register}/${id}`
}

export async function herbeFetch(
  register: string,
  query?: string,
  options?: RequestInit
): Promise<Response> {
  const auth = await herbeAuthHeader()
  return herbeFetchRaw(herbeUrl(register, query), {
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
  options?: RequestInit
): Promise<Response> {
  const auth = await herbeAuthHeader()
  return herbeFetchRaw(herbeUrlById(register, id), {
    ...options,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

/** Fetch all pages for a register. Stops when a page has fewer records than limit. */
export async function herbeFetchAll(
  register: string,
  params: Record<string, string> = {},
  limit = 100
): Promise<unknown[]> {
  const results: unknown[] = []
  let offset = 0
  while (true) {
    const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) }).toString()
    const res = await herbeFetch(register, query)
    if (!res.ok) throw new Error(`Herbe ${register} fetch failed: ${res.status}`)
    const json = await res.json()
    // Response format: { data: { [register]: [...] } }
    const page = (json?.data?.[register] ?? []) as unknown[]
    results.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return results
}
