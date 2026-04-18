import { google, type calendar_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

export interface GoogleConfig {
  serviceAccountEmail: string
  privateKey: string
  adminEmail: string
  domain: string
}

/** Normalize a PEM private key — handle literal \n strings and stripped newlines */
function normalizePemKey(key: string): string {
  // Replace literal \n strings with actual newlines
  let normalized = key.replace(/\\n/g, '\n').trim()
  // If it now has real newlines, it's fine
  if (normalized.includes('\n')) return normalized
  // Extract the base64 body between header/footer and re-chunk at 64 chars
  const match = normalized.match(/^(-----BEGIN [A-Z ]+-----)(.+)(-----END [A-Z ]+-----)$/)
  if (!match) return normalized
  const header = match[1]
  const body = match[2]
  const footer = match[3]
  const lines = body.match(/.{1,64}/g) ?? []
  return [header, ...lines, footer].join('\n')
}

const configCache = new Map<string, { data: GoogleConfig | null; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE = 50

export async function getGoogleConfig(accountId: string): Promise<GoogleConfig | null> {
  const cached = configCache.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT service_account_email, service_account_key, admin_email, domain FROM account_google_config WHERE account_id = $1',
      [accountId]
    )
    if (rows[0] && rows[0].service_account_email) {
      let key = ''
      if (rows[0].service_account_key) {
        try { key = decrypt(rows[0].service_account_key) } catch {}
      }
      const config: GoogleConfig = {
        serviceAccountEmail: rows[0].service_account_email,
        privateKey: normalizePemKey(key),
        adminEmail: rows[0].admin_email,
        domain: rows[0].domain,
      }
      if (configCache.size >= MAX_CACHE) configCache.clear()
      configCache.set(accountId, { data: config, ts: Date.now() })
      return config
    }
  } catch (e) {
    console.warn('[google] Config lookup failed:', String(e))
  }

  if (configCache.size >= MAX_CACHE) configCache.clear()
  configCache.set(accountId, { data: null, ts: Date.now() })
  return null
}

/** Create an authenticated Google Calendar client for a specific user (via domain-wide delegation) */
export function getCalendarClient(config: GoogleConfig, userEmail: string): calendar_v3.Calendar {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    subject: userEmail, // Impersonate this user via domain-wide delegation
  })
  return google.calendar({ version: 'v3', auth })
}

/** Get a Directory client (for listing users) */
export function getDirectoryClient(config: GoogleConfig) {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
    subject: config.adminEmail, // Must impersonate a Workspace admin
  })
  return google.admin({ version: 'directory_v1', auth })
}

/** List Google Workspace users */
export async function listGoogleUsers(config: GoogleConfig): Promise<{ email: string; name: string; id: string }[]> {
  const directory = getDirectoryClient(config)
  const users: { email: string; name: string; id: string }[] = []
  let pageToken: string | undefined

  do {
    const res = await directory.users.list({
      domain: config.domain,
      maxResults: 500,
      pageToken,
      fields: 'users(primaryEmail,name,id),nextPageToken',
    })
    for (const u of res.data.users ?? []) {
      if (u.primaryEmail && u.name?.fullName) {
        users.push({
          email: u.primaryEmail,
          name: u.name.fullName,
          id: u.id ?? '',
        })
      }
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return users
}

/** Build Google Meet conference data for event creation/update */
export function buildGoogleMeetConferenceData(requestId?: string) {
  return {
    createRequest: {
      requestId: requestId ?? `herbe-${Date.now()}`,
      conferenceSolutionKey: { type: 'hangoutsMeet' as const },
    },
  }
}

/** Create a Google Calendar client using a per-user OAuth access token */
export function getOAuthCalendarClient(accessToken: string): calendar_v3.Calendar {
  const auth = new OAuth2Client()
  auth.setCredentials({ access_token: accessToken })
  return google.calendar({ version: 'v3', auth })
}

/** Get the OAuth2Client configured with app credentials (for token exchange/refresh) */
export function getOAuthAppClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = `${(process.env.NEXTAUTH_URL ?? 'https://herbe-calendar.vercel.app').replace(/\/$/, '')}/api/google/callback`
  if (!clientId || !clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET required')
  return new OAuth2Client(clientId, clientSecret, redirectUri)
}
