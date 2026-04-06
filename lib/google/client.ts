import { google, type calendar_v3 } from 'googleapis'
import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

export interface GoogleConfig {
  serviceAccountEmail: string
  privateKey: string
  adminEmail: string
  domain: string
}

const configCache = new Map<string, { data: GoogleConfig | null; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

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
        privateKey: key,
        adminEmail: rows[0].admin_email,
        domain: rows[0].domain,
      }
      configCache.set(accountId, { data: config, ts: Date.now() })
      return config
    }
  } catch (e) {
    console.warn('[google] Config lookup failed:', String(e))
  }

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
