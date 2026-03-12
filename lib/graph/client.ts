interface GraphTokenCache {
  token: string
  expiresAt: number
}

let graphTokenCache: GraphTokenCache | null = null

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID!
  const clientId = process.env.AZURE_CLIENT_ID!
  const clientSecret = process.env.AZURE_CLIENT_SECRET!

  if (graphTokenCache && Date.now() < graphTokenCache.expiresAt - 30_000) {
    return graphTokenCache.token
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  if (!res.ok) throw new Error(`Graph OAuth failed: ${res.status}`)
  const data = await res.json()
  graphTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return graphTokenCache.token
}

export async function graphFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getGraphToken()
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const sender = process.env.AZURE_SENDER_EMAIL!
  const res = await graphFetch(`/users/${sender}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  })
  if (!res.ok) throw new Error(`sendMail failed: ${res.status} ${await res.text()}`)
}
