import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { randomBytes } from 'crypto'

const CALENDLY_API = 'https://api.calendly.com'

export interface CalendlyUserInfo {
  uri: string
  name: string
  email: string
  orgUri: string
  schedulingUrl: string
}

export interface CalendlyEventType {
  uri: string
  name: string
  duration: number
  schedulingUrl: string
}

/** Verify a PAT and return user info. */
export async function verifyPat(pat: string): Promise<CalendlyUserInfo> {
  const res = await fetch(`${CALENDLY_API}/users/me`, {
    headers: { Authorization: `Bearer ${pat}` },
  })
  if (!res.ok) throw new Error(`Calendly auth failed: ${res.status}`)
  const data = await res.json()
  const r = data.resource
  return {
    uri: r.uri,
    name: r.name,
    email: r.email,
    orgUri: r.current_organization,
    schedulingUrl: r.scheduling_url,
  }
}

/** Fetch active event types for a user. */
export async function fetchEventTypes(pat: string, userUri: string): Promise<CalendlyEventType[]> {
  const res = await fetch(`${CALENDLY_API}/event_types?user=${encodeURIComponent(userUri)}&active=true&count=100`, {
    headers: { Authorization: `Bearer ${pat}` },
  })
  if (!res.ok) throw new Error(`Calendly event types fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.collection ?? []).map((et: any) => ({
    uri: et.uri,
    name: et.name,
    duration: et.duration,
    schedulingUrl: et.scheduling_url,
  }))
}

/** Create a webhook subscription for invitee.created events. */
export async function createWebhook(
  pat: string,
  orgUri: string,
  userUri: string,
  callbackUrl: string,
): Promise<{ webhookUri: string; signingKey: string }> {
  const signingKey = randomBytes(32).toString('hex')
  const res = await fetch(`${CALENDLY_API}/webhook_subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: callbackUrl,
      events: ['invitee.created'],
      organization: orgUri,
      user: userUri,
      scope: 'user',
      signing_key: signingKey,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Calendly webhook creation failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return { webhookUri: data.resource.uri, signingKey }
}

/** Delete a webhook subscription. */
export async function deleteWebhook(pat: string, webhookUri: string): Promise<void> {
  const uuid = webhookUri.split('/').pop()
  await fetch(`${CALENDLY_API}/webhook_subscriptions/${uuid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${pat}` },
  })
}

/** Store a Calendly connection in the DB. */
export async function saveCalendlyConnection(params: {
  userEmail: string
  accountId: string
  personCode: string
  pat: string
  userInfo: CalendlyUserInfo
  webhookUri: string
  signingKey: string
  defaultTemplateId: string
  eventTypes: CalendlyEventType[]
}): Promise<string> {
  const { userEmail, accountId, personCode, pat, userInfo, webhookUri, signingKey, defaultTemplateId, eventTypes } = params
  const encPat = encrypt(pat)
  const encSigningKey = encrypt(signingKey)

  const { rows } = await pool.query(
    `INSERT INTO user_calendly_tokens (user_email, account_id, person_code, access_token, calendly_user_uri, calendly_user_name, calendly_org_uri, webhook_uri, signing_key, default_template_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_email, account_id)
     DO UPDATE SET person_code = $3, access_token = $4, calendly_user_uri = $5, calendly_user_name = $6, calendly_org_uri = $7, webhook_uri = $8, signing_key = $9, default_template_id = $10, updated_at = now()
     RETURNING id`,
    [userEmail, accountId, personCode, encPat, userInfo.uri, userInfo.name, userInfo.orgUri, webhookUri, encSigningKey, defaultTemplateId]
  )
  const tokenId = rows[0].id

  // Sync event types
  for (const et of eventTypes) {
    await pool.query(
      `INSERT INTO user_calendly_event_mappings (calendly_token_id, event_type_uri, event_type_name, event_type_duration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (calendly_token_id, event_type_uri)
       DO UPDATE SET event_type_name = $3, event_type_duration = $4`,
      [tokenId, et.uri, et.name, et.duration]
    )
  }

  return tokenId
}

/** Get Calendly connection for a user. */
export async function getCalendlyConnection(userEmail: string, accountId: string) {
  const { rows } = await pool.query(
    'SELECT id, calendly_user_uri, calendly_user_name, default_template_id, webhook_uri, access_token FROM user_calendly_tokens WHERE user_email = $1 AND account_id = $2',
    [userEmail, accountId]
  )
  if (rows.length === 0) return null
  const row = rows[0]

  const { rows: mappings } = await pool.query(
    'SELECT event_type_uri, event_type_name, event_type_duration, template_id FROM user_calendly_event_mappings WHERE calendly_token_id = $1 ORDER BY event_type_name',
    [row.id]
  )

  return {
    id: row.id,
    userName: row.calendly_user_name,
    userUri: row.calendly_user_uri,
    defaultTemplateId: row.default_template_id,
    eventTypes: mappings.map((m: any) => ({
      uri: m.event_type_uri,
      name: m.event_type_name,
      duration: m.event_type_duration,
      templateId: m.template_id,
    })),
  }
}

/** Disconnect Calendly: delete webhook and remove DB rows. */
export async function disconnectCalendly(userEmail: string, accountId: string): Promise<void> {
  const { rows } = await pool.query(
    'SELECT id, access_token, webhook_uri FROM user_calendly_tokens WHERE user_email = $1 AND account_id = $2',
    [userEmail, accountId]
  )
  if (rows.length === 0) return

  // Delete webhook (best-effort)
  try {
    const pat = decrypt(rows[0].access_token)
    if (rows[0].webhook_uri) {
      await deleteWebhook(pat, rows[0].webhook_uri)
    }
  } catch { /* best-effort */ }

  // Cascade deletes event mappings
  await pool.query('DELETE FROM user_calendly_tokens WHERE id = $1', [rows[0].id])
}

/** Find Calendly connection by user URI (for webhook routing). */
export async function findConnectionByUserUri(userUri: string) {
  const { rows } = await pool.query(
    'SELECT id, user_email, account_id, person_code, access_token, signing_key, default_template_id FROM user_calendly_tokens WHERE calendly_user_uri = $1',
    [userUri]
  )
  if (rows.length === 0) return null
  return {
    id: rows[0].id,
    userEmail: rows[0].user_email,
    accountId: rows[0].account_id,
    personCode: rows[0].person_code as string | null,
    signingKey: decrypt(rows[0].signing_key),
    defaultTemplateId: rows[0].default_template_id,
  }
}

/** Find the template ID for a specific event type, or fall back to default. */
export async function getTemplateForEventType(tokenId: string, eventTypeUri: string, defaultTemplateId: string): Promise<string> {
  const { rows } = await pool.query(
    'SELECT template_id FROM user_calendly_event_mappings WHERE calendly_token_id = $1 AND event_type_uri = $2',
    [tokenId, eventTypeUri]
  )
  return rows[0]?.template_id ?? defaultTemplateId
}

/** Atomically claim a webhook event for processing. Returns true if claimed (first time), false if already processed. */
export async function claimWebhookEvent(eventUri: string, tokenId: string, templateId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO calendly_webhook_log (event_uri, calendly_token_id, template_id, status)
     VALUES ($1, $2, $3, 'processing')
     ON CONFLICT (event_uri) DO NOTHING
     RETURNING id`,
    [eventUri, tokenId, templateId]
  )
  return rows.length > 0
}

/** Update the status of a claimed webhook event. */
export async function updateWebhookStatus(eventUri: string, status: string, error?: string): Promise<void> {
  await pool.query(
    'UPDATE calendly_webhook_log SET status = $1, error = $2 WHERE event_uri = $3',
    [status, error ?? null, eventUri]
  )
}
