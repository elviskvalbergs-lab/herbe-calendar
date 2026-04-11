# Calendly Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive Calendly bookings via webhook and auto-create events in ERP/Outlook/Google using existing booking templates, with per-user setup and event type → template mapping.

**Architecture:** New `lib/calendly/client.ts` handles Calendly API calls. Core booking logic is extracted from `book/route.ts` into `lib/bookingExecutor.ts` so both the built-in booking page and Calendly webhook share it. Per-user Calendly config stored in `user_calendly_tokens`. Webhook endpoint verifies HMAC signature, routes by Calendly user URI, finds the mapped template, and executes the booking.

**Tech Stack:** Next.js App Router, Calendly API v2, HMAC-SHA256 webhook verification, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-11-calendly-integration-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `db/migrations/18_add_calendly.sql` | Schema for Calendly tables |
| `lib/calendly/client.ts` | Calendly API client: verify PAT, fetch event types, manage webhooks |
| `lib/bookingExecutor.ts` | Shared booking execution logic (extracted from book/route.ts) |
| `app/api/calendly/connect/route.ts` | POST: connect, DELETE: disconnect |
| `app/api/calendly/mappings/route.ts` | PUT: update event type → template mapping |
| `app/api/calendly/refresh/route.ts` | POST: refresh event types from Calendly |
| `app/api/calendly/webhook/route.ts` | POST: receive and process Calendly webhooks |

### Modified files
| File | Change |
|------|--------|
| `app/api/share/[token]/book/route.ts` | Refactor to use shared bookingExecutor |
| `components/SettingsModal.tsx` | Add Calendly section in Integrations tab |

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/18_add_calendly.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-user Calendly connection
CREATE TABLE IF NOT EXISTS user_calendly_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  account_id          UUID NOT NULL,
  access_token        BYTEA NOT NULL,
  calendly_user_uri   TEXT NOT NULL,
  calendly_user_name  TEXT,
  calendly_org_uri    TEXT,
  webhook_uri         TEXT,
  signing_key         BYTEA,
  default_template_id UUID NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, account_id)
);

-- Per-event-type template override
CREATE TABLE IF NOT EXISTS user_calendly_event_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendly_token_id   UUID NOT NULL REFERENCES user_calendly_tokens(id) ON DELETE CASCADE,
  event_type_uri      TEXT NOT NULL,
  event_type_name     TEXT NOT NULL,
  event_type_duration INT,
  template_id         UUID,
  UNIQUE(calendly_token_id, event_type_uri)
);

-- Webhook processing log (dedup + audit)
CREATE TABLE IF NOT EXISTS calendly_webhook_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uri           TEXT NOT NULL UNIQUE,
  calendly_token_id   UUID NOT NULL,
  template_id         UUID NOT NULL,
  status              TEXT NOT NULL DEFAULT 'processed',
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

- [ ] **Step 2: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/18_add_calendly.sql
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/18_add_calendly.sql
git commit -m "feat: add Calendly tables — tokens, event mappings, webhook log"
```

---

### Task 2: Calendly API Client

**Files:**
- Create: `lib/calendly/client.ts`

- [ ] **Step 1: Write the Calendly client**

```typescript
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
  pat: string
  userInfo: CalendlyUserInfo
  webhookUri: string
  signingKey: string
  defaultTemplateId: string
  eventTypes: CalendlyEventType[]
}): Promise<string> {
  const { userEmail, accountId, pat, userInfo, webhookUri, signingKey, defaultTemplateId, eventTypes } = params
  const encPat = encrypt(pat)
  const encSigningKey = encrypt(signingKey)

  const { rows } = await pool.query(
    `INSERT INTO user_calendly_tokens (user_email, account_id, access_token, calendly_user_uri, calendly_user_name, calendly_org_uri, webhook_uri, signing_key, default_template_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_email, account_id)
     DO UPDATE SET access_token = $3, calendly_user_uri = $4, calendly_user_name = $5, calendly_org_uri = $6, webhook_uri = $7, signing_key = $8, default_template_id = $9, updated_at = now()
     RETURNING id`,
    [userEmail, accountId, encPat, userInfo.uri, userInfo.name, userInfo.orgUri, webhookUri, encSigningKey, defaultTemplateId]
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
    'SELECT id, user_email, account_id, access_token, signing_key, default_template_id FROM user_calendly_tokens WHERE calendly_user_uri = $1',
    [userUri]
  )
  if (rows.length === 0) return null
  return {
    id: rows[0].id,
    userEmail: rows[0].user_email,
    accountId: rows[0].account_id,
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

/** Check if a webhook event has already been processed. */
export async function isWebhookProcessed(eventUri: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM calendly_webhook_log WHERE event_uri = $1',
    [eventUri]
  )
  return rows.length > 0
}

/** Log a processed webhook. */
export async function logWebhook(eventUri: string, tokenId: string, templateId: string, status: string, error?: string): Promise<void> {
  await pool.query(
    `INSERT INTO calendly_webhook_log (event_uri, calendly_token_id, template_id, status, error)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_uri) DO NOTHING`,
    [eventUri, tokenId, templateId, status, error ?? null]
  )
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/calendly/client.ts
git commit -m "feat: Calendly API client — PAT verify, event types, webhooks, DB storage"
```

---

### Task 3: Booking Executor — Extract Shared Logic

**Files:**
- Create: `lib/bookingExecutor.ts`
- Modify: `app/api/share/[token]/book/route.ts`

- [ ] **Step 1: Create the shared booking executor**

Read `app/api/share/[token]/book/route.ts` thoroughly. Extract the core booking logic (from "Calculate end time" through "Return booking") into a shared function. This includes:
- Resolve participant emails
- Generate cancel token
- Create Zoom meeting (if targets.zoom enabled)
- Build activity text
- Create ERP activities
- Create Outlook events
- Create Google events
- Insert booking into DB
- Send notification emails

The function signature:

```typescript
export interface BookingParams {
  template: {
    id: string
    name: string
    duration_minutes: number
    targets: TemplateTargets
    allow_holidays?: boolean
  }
  date: string             // YYYY-MM-DD
  time: string             // HH:mm
  bookerEmail: string
  bookerName?: string
  fieldValues: Record<string, string>
  personCodes: string[]
  ownerEmail: string
  accountId: string
  shareLinkId?: string     // optional — not present for Calendly bookings
}

export interface BookingResult {
  booking: Record<string, unknown>
  cancelUrl: string
  notificationSent: boolean
  notificationFailed?: boolean
}

export async function executeBooking(params: BookingParams): Promise<BookingResult>
```

The function contains the same logic currently in book/route.ts lines ~133-400, but without the HTTP request/response handling.

- [ ] **Step 2: Refactor book/route.ts to use the executor**

Replace the inline booking logic with a call to `executeBooking`:

```typescript
import { executeBooking } from '@/lib/bookingExecutor'

// After the availability check and validation:
const result = await executeBooking({
  template: { id: templateId, name: templateName, duration_minutes: durationMinutes, targets },
  date, time, bookerEmail, fieldValues,
  personCodes, ownerEmail, accountId,
  shareLinkId: link.id,
})

return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } })
```

- [ ] **Step 3: Verify the refactored booking still compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
```

- [ ] **Step 4: Commit**

```bash
git add lib/bookingExecutor.ts 'app/api/share/[token]/book/route.ts'
git commit -m "refactor: extract booking logic into shared bookingExecutor"
```

---

### Task 4: Calendly API Endpoints — Connect/Disconnect

**Files:**
- Create: `app/api/calendly/connect/route.ts`

- [ ] **Step 1: Write the connect/disconnect endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { verifyPat, fetchEventTypes, createWebhook, saveCalendlyConnection, disconnectCalendly, getCalendlyConnection } from '@/lib/calendly/client'

/** GET: Get current Calendly connection status */
export async function GET() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }
  const connection = await getCalendlyConnection(session.email, session.accountId)
  return NextResponse.json(connection)
}

/** POST: Connect Calendly */
export async function POST(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { pat, defaultTemplateId } = await req.json()
  if (!pat || typeof pat !== 'string' || !defaultTemplateId) {
    return NextResponse.json({ error: 'pat and defaultTemplateId required' }, { status: 400 })
  }

  try {
    const userInfo = await verifyPat(pat)
    const eventTypes = await fetchEventTypes(pat, userInfo.uri)

    const callbackUrl = `${(process.env.NEXTAUTH_URL ?? 'https://herbe-calendar.vercel.app').replace(/\/$/, '')}/api/calendly/webhook`
    const { webhookUri, signingKey } = await createWebhook(pat, userInfo.orgUri, userInfo.uri, callbackUrl)

    const tokenId = await saveCalendlyConnection({
      userEmail: session.email,
      accountId: session.accountId,
      pat,
      userInfo,
      webhookUri,
      signingKey,
      defaultTemplateId,
      eventTypes,
    })

    const connection = await getCalendlyConnection(session.email, session.accountId)
    return NextResponse.json(connection, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}

/** DELETE: Disconnect Calendly */
export async function DELETE() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }
  await disconnectCalendly(session.email, session.accountId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/calendly/connect/route.ts
git commit -m "feat: Calendly connect/disconnect API endpoints"
```

---

### Task 5: Calendly Mappings + Refresh Endpoints

**Files:**
- Create: `app/api/calendly/mappings/route.ts`
- Create: `app/api/calendly/refresh/route.ts`

- [ ] **Step 1: Write the mappings endpoint**

`app/api/calendly/mappings/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'

export async function PUT(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { eventTypeUri, templateId } = await req.json()
  if (!eventTypeUri) return NextResponse.json({ error: 'eventTypeUri required' }, { status: 400 })

  // Verify ownership
  const { rows } = await pool.query(
    `SELECT m.id FROM user_calendly_event_mappings m
     JOIN user_calendly_tokens t ON t.id = m.calendly_token_id
     WHERE m.event_type_uri = $1 AND t.user_email = $2 AND t.account_id = $3`,
    [eventTypeUri, session.email, session.accountId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Event type not found' }, { status: 404 })

  await pool.query(
    'UPDATE user_calendly_event_mappings SET template_id = $1 WHERE id = $2',
    [templateId || null, rows[0].id]
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the refresh endpoint**

`app/api/calendly/refresh/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { fetchEventTypes, getCalendlyConnection } from '@/lib/calendly/client'

export async function POST() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { rows } = await pool.query(
    'SELECT id, access_token, calendly_user_uri FROM user_calendly_tokens WHERE user_email = $1 AND account_id = $2',
    [session.email, session.accountId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Not connected' }, { status: 404 })

  const pat = decrypt(rows[0].access_token)
  const eventTypes = await fetchEventTypes(pat, rows[0].calendly_user_uri)

  for (const et of eventTypes) {
    await pool.query(
      `INSERT INTO user_calendly_event_mappings (calendly_token_id, event_type_uri, event_type_name, event_type_duration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (calendly_token_id, event_type_uri)
       DO UPDATE SET event_type_name = $3, event_type_duration = $4`,
      [rows[0].id, et.uri, et.name, et.duration]
    )
  }

  // Remove event types no longer in Calendly
  const currentUris = eventTypes.map(et => et.uri)
  if (currentUris.length > 0) {
    await pool.query(
      'DELETE FROM user_calendly_event_mappings WHERE calendly_token_id = $1 AND event_type_uri != ALL($2)',
      [rows[0].id, currentUris]
    )
  }

  const connection = await getCalendlyConnection(session.email, session.accountId)
  return NextResponse.json(connection)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/calendly/mappings/route.ts app/api/calendly/refresh/route.ts
git commit -m "feat: Calendly event type mapping and refresh endpoints"
```

---

### Task 6: Calendly Webhook Handler

**Files:**
- Create: `app/api/calendly/webhook/route.ts`

- [ ] **Step 1: Write the webhook handler**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { pool } from '@/lib/db'
import { findConnectionByUserUri, getTemplateForEventType, isWebhookProcessed, logWebhook } from '@/lib/calendly/client'
import { executeBooking } from '@/lib/bookingExecutor'
import type { TemplateTargets } from '@/types'

function verifySignature(body: string, signature: string, key: string): boolean {
  // Calendly sends: t=timestamp,v1=signature
  const parts = signature.split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const vPart = parts.find(p => p.startsWith('v1='))
  if (!tPart || !vPart) return false
  const timestamp = tPart.slice(2)
  const sig = vPart.slice(3)
  const payload = `${timestamp}.${body}`
  const expected = createHmac('sha256', key).update(payload).digest('hex')
  return sig === expected
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('Calendly-Webhook-Signature') ?? ''

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle invitee.created
  if (payload.event !== 'invitee.created') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const scheduledEvent = payload.payload?.scheduled_event
  const invitee = payload.payload?.invitee
  const eventTypeUri = payload.payload?.event_type
  const eventUri = payload.payload?.event // unique event URI for dedup

  if (!scheduledEvent || !invitee || !eventUri) {
    return NextResponse.json({ error: 'Missing payload fields' }, { status: 400 })
  }

  // Find user by event membership
  const userUri = scheduledEvent.event_memberships?.[0]?.user
  if (!userUri) {
    console.warn('[calendly/webhook] No user URI in event memberships')
    return NextResponse.json({ ok: true })
  }

  const connection = await findConnectionByUserUri(userUri)
  if (!connection) {
    console.warn(`[calendly/webhook] No connection found for user ${userUri}`)
    return NextResponse.json({ ok: true })
  }

  // Verify HMAC signature
  if (!verifySignature(body, signature, connection.signingKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Dedup check
  if (await isWebhookProcessed(eventUri)) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Find template
  const templateId = await getTemplateForEventType(connection.id, eventTypeUri ?? '', connection.defaultTemplateId)

  // Load template
  const { rows: templateRows } = await pool.query(
    'SELECT id, name, duration_minutes, targets, allow_holidays FROM booking_templates WHERE id = $1',
    [templateId]
  )
  if (templateRows.length === 0) {
    await logWebhook(eventUri, connection.id, templateId, 'failed', 'Template not found')
    return NextResponse.json({ ok: true })
  }
  const template = templateRows[0]

  // Extract booking info
  const startTime = scheduledEvent.start_time // ISO 8601
  const endTime = scheduledEvent.end_time
  const date = startTime.slice(0, 10)
  const time = startTime.slice(11, 16)
  const bookerEmail = invitee.email ?? ''
  const bookerName = invitee.name ?? ''

  // Map Calendly answers to field values (best-effort by question name)
  const fieldValues: Record<string, string> = {}
  const answers = invitee.questions_and_answers ?? []
  for (const qa of answers) {
    fieldValues[qa.question ?? ''] = qa.answer ?? ''
  }

  // Build description with all invitee info
  const descParts = [`Calendly booking by ${bookerName} (${bookerEmail})`]
  descParts.push(`Event: ${scheduledEvent.name ?? template.name}`)
  for (const qa of answers) {
    descParts.push(`${qa.question}: ${qa.answer}`)
  }
  fieldValues['_calendly_description'] = descParts.join('\n')

  // Load person codes from the user's share link favorites or template
  // Since Calendly bookings don't go through a share link, we need person codes.
  // Get them from the template's ERP targets or the user's own person code.
  const { rows: personRows } = await pool.query(
    'SELECT generated_code FROM person_codes WHERE LOWER(email) = LOWER($1) AND account_id = $2',
    [connection.userEmail, connection.accountId]
  )
  const personCodes = personRows.length > 0 ? [personRows[0].generated_code] : []

  try {
    const result = await executeBooking({
      template: {
        id: template.id,
        name: template.name,
        duration_minutes: template.duration_minutes,
        targets: template.targets as TemplateTargets,
        allow_holidays: template.allow_holidays,
      },
      date,
      time,
      bookerEmail,
      bookerName,
      fieldValues,
      personCodes,
      ownerEmail: connection.userEmail,
      accountId: connection.accountId,
    })

    await logWebhook(eventUri, connection.id, templateId, 'processed')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await logWebhook(eventUri, connection.id, templateId, 'failed', String(e))
    console.error('[calendly/webhook] Booking execution failed:', String(e))
    return NextResponse.json({ ok: true }) // Return 200 to prevent Calendly retries
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/calendly/webhook/route.ts
git commit -m "feat: Calendly webhook handler with signature verification and booking execution"
```

---

### Task 7: Settings UI — Calendly Section

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: Add Calendly section in Integrations tab**

Read the file first. In the Integrations tab, add a Calendly section between Google accounts and ICS feeds.

Add state:
```typescript
const [calendlyConnection, setCalendlyConnection] = useState<any>(null)
const [calendlyPat, setCalendlyPat] = useState('')
const [calendlyDefaultTemplate, setCalendlyDefaultTemplate] = useState('')
const [calendlyLoading, setCalendlyLoading] = useState(false)
const [calendlyError, setCalendlyError] = useState('')
```

Fetch on tab open (alongside Google accounts and ICS):
```typescript
fetch('/api/calendly/connect').then(r => r.ok ? r.json() : null).then(setCalendlyConnection).catch(() => {})
```

Also need to fetch user's templates for the dropdown:
```typescript
const [userTemplates, setUserTemplates] = useState<{ id: string; name: string }[]>([])
// Fetch templates when integrations tab opens:
fetch('/api/settings/templates').then(r => r.ok ? r.json() : []).then(setUserTemplates).catch(() => {})
```

**Not connected UI:**
```tsx
<div className="mb-6">
  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3">Calendly</h3>
  <div className="space-y-2">
    <div>
      <label className="text-xs text-text-muted block mb-1">Personal Access Token</label>
      <input type="password" value={calendlyPat} onChange={e => setCalendlyPat(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" placeholder="Paste your Calendly PAT" />
    </div>
    <div>
      <label className="text-xs text-text-muted block mb-1">Default Template (required)</label>
      <select value={calendlyDefaultTemplate} onChange={e => setCalendlyDefaultTemplate(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm">
        <option value="">Select template...</option>
        {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
    {calendlyError && <p className="text-xs text-red-400">{calendlyError}</p>}
    <button onClick={connectCalendly} disabled={!calendlyPat || !calendlyDefaultTemplate || calendlyLoading}
      className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-30">
      {calendlyLoading ? 'Connecting...' : 'Connect Calendly'}
    </button>
  </div>
</div>
```

**Connected UI:**
```tsx
<div className="mb-6">
  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3">
    Calendly — <span className="text-green-400">{calendlyConnection.userName}</span>
  </h3>
  <div className="space-y-2">
    <div>
      <label className="text-xs text-text-muted block mb-1">Default Template</label>
      <select value={calendlyConnection.defaultTemplateId} onChange={...}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm">
        {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
    <p className="text-xs text-text-muted font-bold">Event Types</p>
    {calendlyConnection.eventTypes.map(et => (
      <div key={et.uri} className="flex items-center gap-2 text-xs">
        <span className="flex-1 truncate">{et.name} ({et.duration}min)</span>
        <select value={et.templateId ?? ''} onChange={e => updateMapping(et.uri, e.target.value)}
          className="bg-bg border border-border rounded px-2 py-1 text-xs max-w-[150px]">
          <option value="">Use default</option>
          {userTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    ))}
    <div className="flex gap-2 pt-2">
      <button onClick={refreshCalendly} className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded border border-border">Refresh</button>
      <button onClick={disconnectCalendly} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 rounded border border-border">Disconnect</button>
    </div>
  </div>
</div>
```

Handler functions:
- `connectCalendly`: POST to `/api/calendly/connect` with `{ pat, defaultTemplateId }`
- `updateMapping`: PUT to `/api/calendly/mappings` with `{ eventTypeUri, templateId }`
- `refreshCalendly`: POST to `/api/calendly/refresh`
- `disconnectCalendly`: DELETE to `/api/calendly/connect`

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/SettingsModal.tsx
git commit -m "feat: Calendly section in Settings Integrations tab"
```

---

### Task 8: Deploy & Test

- [ ] **Step 1: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/18_add_calendly.sql
```

- [ ] **Step 2: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
git checkout main
```

- [ ] **Step 3: Test setup flow**

1. Get a Calendly PAT from calendly.com/integrations (Personal Access Tokens)
2. Settings > Integrations > Calendly section
3. Paste PAT, select a default template, click Connect
4. Verify event types are listed
5. Map a specific event type to a different template
6. Click Refresh to verify it re-fetches

- [ ] **Step 4: Test webhook flow**

1. Schedule a test booking through Calendly
2. Check calendly_webhook_log table for the processed event
3. Verify the event was created in the target systems (ERP/Outlook/Google)
4. Verify the invitee info appears in the event description
