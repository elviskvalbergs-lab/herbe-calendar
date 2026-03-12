interface TokenCache {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

export function herbeUrl(register: string, query?: string): string {
  const base = process.env.HERBE_API_BASE_URL!
  const company = process.env.HERBE_COMPANY_CODE!
  const url = `${base}/${company}/${register}`
  return query ? `${url}?${query}` : url
}

export async function getHerbeToken(): Promise<string> {
  const clientId = process.env.HERBE_CLIENT_ID
  const clientSecret = process.env.HERBE_CLIENT_SECRET
  const tokenUrl = process.env.HERBE_TOKEN_URL

  if (!clientId) throw new Error('HERBE_CLIENT_ID is not set')
  if (!clientSecret) throw new Error('HERBE_CLIENT_SECRET is not set')
  if (!tokenUrl) throw new Error('HERBE_TOKEN_URL is not set')

  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) throw new Error(`Herbe OAuth failed: ${res.status}`)
  const data = await res.json()

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenCache.token
}

export async function herbeFetch(
  register: string,
  query?: string,
  options?: RequestInit
): Promise<Response> {
  const token = await getHerbeToken()
  return fetch(herbeUrl(register, query), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
    const page: unknown[] = await res.json()
    results.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return results
}
