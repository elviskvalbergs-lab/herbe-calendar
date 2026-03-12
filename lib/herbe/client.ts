import { getHerbeAccessToken } from './config'

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

export async function herbeFetch(
  register: string,
  query?: string,
  options?: RequestInit
): Promise<Response> {
  const auth = await herbeAuthHeader()
  return fetch(herbeUrl(register, query), {
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
