# Google Per-User OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let individual users connect their own Google accounts via OAuth 2.0, pick calendars to sync with colors, and do full CRUD — alongside existing domain-wide delegation.

**Architecture:** New `user_google_tokens` + `user_google_calendars` tables store per-user OAuth credentials and calendar preferences. A new `lib/google/userOAuth.ts` handles token lifecycle. The existing Google client gets a second factory for OAuth-based clients. API routes check for per-user tokens first, fall back to domain-wide delegation. Settings UI gets a new Integrations tab combining Google account management and ICS feeds.

**Tech Stack:** Next.js App Router, Google APIs (googleapis), AES-256-GCM encryption (existing lib/crypto), PostgreSQL (Neon)

**Spec:** `docs/superpowers/specs/2026-04-11-google-per-user-oauth-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `db/migrations/15_add_user_google_oauth.sql` | Schema for tokens + calendars tables |
| `lib/google/userOAuth.ts` | Token storage, refresh, revocation, calendar list sync |
| `app/api/google/auth/route.ts` | GET: initiate OAuth, DELETE: disconnect |
| `app/api/google/callback/route.ts` | GET: exchange code, store tokens, fetch calendars |
| `app/api/google/calendars/route.ts` | GET: list, PUT: toggle/recolor, POST: refresh from Google |

### Modified files
| File | Change |
|------|--------|
| `lib/google/client.ts` | Add `getOAuthCalendarClient(accessToken)` export |
| `app/api/google/route.ts` | Fetch from per-user calendars alongside domain-wide |
| `app/api/google/[id]/route.ts` | Support per-user token for PUT/DELETE |
| `components/SettingsModal.tsx` | Rename Calendars→Integrations, add Google section |
| `components/ActivityForm.tsx` | Unified source picker with Google calendar sub-selection + localStorage memory |
| `components/CalendarShell.tsx` | Fetch + include per-user Google calendars in sources |
| `components/CalendarSourcesDropdown.tsx` | Grouped rendering for Google accounts |
| `types/index.ts` | Add `UserGoogleAccount`, `UserGoogleCalendar` types |

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/15_add_user_google_oauth.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-user Google OAuth tokens
CREATE TABLE IF NOT EXISTS user_google_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,
  account_id      UUID NOT NULL,
  google_email    TEXT NOT NULL,
  access_token    BYTEA NOT NULL,
  refresh_token   BYTEA NOT NULL,
  token_expires_at BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, google_email, account_id)
);

CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user
  ON user_google_tokens(user_email, account_id);

-- Per-user Google calendar selection and colors
CREATE TABLE IF NOT EXISTS user_google_calendars (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_google_token_id UUID NOT NULL REFERENCES user_google_tokens(id) ON DELETE CASCADE,
  calendar_id          TEXT NOT NULL,
  name                 TEXT NOT NULL,
  color                TEXT,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_google_token_id, calendar_id)
);
```

- [ ] **Step 2: Run migration against dev database**

```bash
psql "$DATABASE_URL" -f db/migrations/15_add_user_google_oauth.sql
```

Expected: `CREATE TABLE` x2, `CREATE INDEX` x1

- [ ] **Step 3: Commit**

```bash
git add db/migrations/15_add_user_google_oauth.sql
git commit -m "feat: add user_google_tokens and user_google_calendars tables"
```

---

### Task 2: Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add types for per-user Google OAuth**

Add after the existing `Source` and `SOURCES` exports:

```typescript
/** A connected Google account for a user */
export interface UserGoogleAccount {
  id: string
  googleEmail: string
  calendars: UserGoogleCalendar[]
}

/** A single Google calendar within a connected account */
export interface UserGoogleCalendar {
  id: string
  calendarId: string       // Google's calendar ID
  name: string             // Display name from Google
  color: string | null     // User-assigned hex color
  enabled: boolean
  googleEmail: string      // Parent account email
  tokenId: string          // FK to user_google_tokens
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add UserGoogleAccount and UserGoogleCalendar types"
```

---

### Task 3: Google OAuth Client Extension

**Files:**
- Modify: `lib/google/client.ts`

- [ ] **Step 1: Add OAuth calendar client factory**

Add after existing `getCalendarClient`:

```typescript
import { OAuth2Client } from 'google-auth-library'

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
```

- [ ] **Step 2: Commit**

```bash
git add lib/google/client.ts
git commit -m "feat: add OAuth calendar client factory and app client helper"
```

---

### Task 4: Per-User Token Management Library

**Files:**
- Create: `lib/google/userOAuth.ts`

- [ ] **Step 1: Write the token management module**

```typescript
import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { getOAuthAppClient, getOAuthCalendarClient } from './client'
import type { UserGoogleAccount, UserGoogleCalendar } from '@/types'

/** Exchange an auth code for tokens and store them. Returns the google email. */
export async function exchangeAndStoreTokens(
  code: string,
  userEmail: string,
  accountId: string,
): Promise<{ googleEmail: string; tokenId: string }> {
  const client = getOAuthAppClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return access and refresh tokens')
  }

  // Get the Google account email
  client.setCredentials(tokens)
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google user info')
  const userInfo = await res.json()
  const googleEmail: string = userInfo.email

  const encAccess = encrypt(tokens.access_token)
  const encRefresh = encrypt(tokens.refresh_token)
  const expiresAt = tokens.expiry_date ?? Date.now() + 3600_000

  const { rows } = await pool.query(
    `INSERT INTO user_google_tokens (user_email, account_id, google_email, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_email, google_email, account_id)
     DO UPDATE SET access_token = $4, refresh_token = $5, token_expires_at = $6, updated_at = now()
     RETURNING id`,
    [userEmail, accountId, googleEmail, encAccess, encRefresh, expiresAt]
  )

  return { googleEmail, tokenId: rows[0].id }
}

/** Get a valid access token for a user's Google account, refreshing if needed. */
export async function getValidAccessToken(tokenId: string): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT id, access_token, refresh_token, token_expires_at FROM user_google_tokens WHERE id = $1',
    [tokenId]
  )
  if (rows.length === 0) return null
  const row = rows[0]

  const accessToken = decrypt(row.access_token)
  const refreshToken = decrypt(row.refresh_token)
  const expiresAt = Number(row.token_expires_at)

  // Still valid (60s buffer)
  if (Date.now() < expiresAt - 60_000) return accessToken

  // Refresh
  try {
    const client = getOAuthAppClient()
    client.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await client.refreshAccessToken()
    if (!credentials.access_token) return null

    const newExpiresAt = credentials.expiry_date ?? Date.now() + 3600_000
    await pool.query(
      `UPDATE user_google_tokens
       SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [encrypt(credentials.access_token), credentials.refresh_token ? encrypt(credentials.refresh_token) : null, newExpiresAt, tokenId]
    )
    return credentials.access_token
  } catch (e) {
    console.warn(`[google/userOAuth] token refresh failed for ${tokenId}:`, String(e))
    return null
  }
}

/** Fetch calendar list from Google and sync with DB. Preserves existing colors/enabled state. */
export async function syncCalendarList(tokenId: string, accessToken: string): Promise<void> {
  const calendar = getOAuthCalendarClient(accessToken)
  const res = await calendar.calendarList.list({ fields: 'items(id,summary,backgroundColor)' })
  const items = res.data.items ?? []

  for (const item of items) {
    const calId = item.id ?? ''
    const name = item.summary ?? calId
    await pool.query(
      `INSERT INTO user_google_calendars (user_google_token_id, calendar_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_google_token_id, calendar_id)
       DO UPDATE SET name = $3`,
      [tokenId, calId, name]
    )
  }

  // Remove calendars no longer in Google
  const googleCalIds = items.map(i => i.id).filter(Boolean)
  if (googleCalIds.length > 0) {
    await pool.query(
      `DELETE FROM user_google_calendars
       WHERE user_google_token_id = $1 AND calendar_id != ALL($2)`,
      [tokenId, googleCalIds]
    )
  }
}

/** Get all connected Google accounts and their calendars for a user. */
export async function getUserGoogleAccounts(
  userEmail: string,
  accountId: string,
): Promise<UserGoogleAccount[]> {
  const { rows: tokens } = await pool.query(
    'SELECT id, google_email FROM user_google_tokens WHERE user_email = $1 AND account_id = $2 ORDER BY created_at',
    [userEmail, accountId]
  )

  const accounts: UserGoogleAccount[] = []
  for (const token of tokens) {
    const { rows: cals } = await pool.query(
      'SELECT id, calendar_id, name, color, enabled FROM user_google_calendars WHERE user_google_token_id = $1 ORDER BY name',
      [token.id]
    )
    accounts.push({
      id: token.id,
      googleEmail: token.google_email,
      calendars: cals.map(c => ({
        id: c.id,
        calendarId: c.calendar_id,
        name: c.name,
        color: c.color,
        enabled: c.enabled,
        googleEmail: token.google_email,
        tokenId: token.id,
      })),
    })
  }
  return accounts
}

/** Revoke a Google account and delete all associated data. */
export async function revokeGoogleAccount(
  userEmail: string,
  accountId: string,
  googleEmail: string,
): Promise<void> {
  const { rows } = await pool.query(
    'SELECT id, access_token FROM user_google_tokens WHERE user_email = $1 AND account_id = $2 AND google_email = $3',
    [userEmail, accountId, googleEmail]
  )
  if (rows.length === 0) return

  // Try to revoke with Google (best-effort)
  try {
    const accessToken = decrypt(rows[0].access_token)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' })
  } catch {}

  // Cascade deletes calendars
  await pool.query('DELETE FROM user_google_tokens WHERE id = $1', [rows[0].id])
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/google/userOAuth.ts
git commit -m "feat: per-user Google OAuth token management library"
```

---

### Task 5: OAuth Flow Endpoints

**Files:**
- Create: `app/api/google/auth/route.ts`
- Create: `app/api/google/callback/route.ts`

- [ ] **Step 1: Write the auth initiation + disconnect endpoint**

`app/api/google/auth/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getOAuthAppClient } from '@/lib/google/client'
import { revokeGoogleAccount } from '@/lib/google/userOAuth'
import { randomUUID } from 'crypto'

const OAUTH_NONCE_COOKIE = 'google_oauth_nonce'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

/** GET: Redirect to Google consent screen */
export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const nonce = randomUUID()
  const client = getOAuthAppClient()
  const authorizeUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: nonce,
  })

  const response = NextResponse.redirect(authorizeUrl)
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
  })
  return response
}

/** DELETE: Disconnect a Google account */
export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { googleEmail } = await req.json()
  if (!googleEmail || typeof googleEmail !== 'string') {
    return NextResponse.json({ error: 'googleEmail required' }, { status: 400 })
  }

  await revokeGoogleAccount(session.email, session.accountId, googleEmail)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the callback endpoint**

`app/api/google/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/herbe/auth-guard'
import { exchangeAndStoreTokens, syncCalendarList, getValidAccessToken } from '@/lib/google/userOAuth'

const OAUTH_NONCE_COOKIE = 'google_oauth_nonce'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.redirect(new URL('/cal?error=unauthorized', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    const msg = error ?? 'missing_code'
    return NextResponse.redirect(new URL(`/cal?error=${encodeURIComponent(msg)}`, req.url))
  }

  // Validate CSRF nonce
  const storedNonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value
  if (!storedNonce || state !== storedNonce) {
    return NextResponse.redirect(new URL('/cal?error=invalid_oauth_state', req.url))
  }

  try {
    const { googleEmail, tokenId } = await exchangeAndStoreTokens(
      code, session.email, session.accountId
    )

    // Fetch and store calendar list
    const accessToken = await getValidAccessToken(tokenId)
    if (accessToken) {
      await syncCalendarList(tokenId, accessToken)
    }

    const response = NextResponse.redirect(new URL('/cal?success=google_connected', req.url))
    response.cookies.delete(OAUTH_NONCE_COOKIE)
    return response
  } catch (e) {
    console.error('[google/callback] error:', e)
    return NextResponse.redirect(new URL('/cal?error=google_auth_failed', req.url))
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/google/auth/route.ts app/api/google/callback/route.ts
git commit -m "feat: Google OAuth initiate, callback, and disconnect endpoints"
```

---

### Task 6: Calendar Management Endpoint

**Files:**
- Create: `app/api/google/calendars/route.ts`

- [ ] **Step 1: Write the calendars CRUD endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getUserGoogleAccounts, getValidAccessToken, syncCalendarList } from '@/lib/google/userOAuth'
import { pool } from '@/lib/db'

/** GET: List all connected Google accounts and their calendars */
export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const accounts = await getUserGoogleAccounts(session.email, session.accountId)
  return NextResponse.json(accounts)
}

/** PUT: Toggle enabled or change color for a calendar */
export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { calendarDbId, enabled, color } = await req.json()
  if (!calendarDbId || typeof calendarDbId !== 'string') {
    return NextResponse.json({ error: 'calendarDbId required' }, { status: 400 })
  }

  // Verify ownership: calendar must belong to this user
  const { rows } = await pool.query(
    `SELECT c.id FROM user_google_calendars c
     JOIN user_google_tokens t ON t.id = c.user_google_token_id
     WHERE c.id = $1 AND t.user_email = $2 AND t.account_id = $3`,
    [calendarDbId, session.email, session.accountId]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  const updates: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (typeof enabled === 'boolean') {
    updates.push(`enabled = $${paramIdx++}`)
    params.push(enabled)
  }
  if (typeof color === 'string') {
    updates.push(`color = $${paramIdx++}`)
    params.push(color || null)
  }

  if (updates.length > 0) {
    params.push(calendarDbId)
    await pool.query(
      `UPDATE user_google_calendars SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params
    )
  }

  return NextResponse.json({ ok: true })
}

/** POST: Refresh calendar list from Google */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { tokenId } = await req.json()
  if (!tokenId || typeof tokenId !== 'string') {
    return NextResponse.json({ error: 'tokenId required' }, { status: 400 })
  }

  // Verify ownership
  const { rows } = await pool.query(
    'SELECT id FROM user_google_tokens WHERE id = $1 AND user_email = $2 AND account_id = $3',
    [tokenId, session.email, session.accountId]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  const accessToken = await getValidAccessToken(tokenId)
  if (!accessToken) {
    return NextResponse.json({ error: 'Could not refresh Google token — reconnect your account' }, { status: 401 })
  }

  await syncCalendarList(tokenId, accessToken)
  const accounts = await getUserGoogleAccounts(session.email, session.accountId)
  return NextResponse.json(accounts)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/google/calendars/route.ts
git commit -m "feat: Google calendars list, toggle, color, and refresh endpoints"
```

---

### Task 7: Event Fetching — Per-User Token Path

**Files:**
- Modify: `app/api/google/route.ts`

- [ ] **Step 1: Add per-user Google calendar fetching alongside domain-wide delegation**

Read the current file first. Then modify the GET handler. After the existing domain-wide delegation fetch, add per-user calendar fetching.

The key changes to the GET handler:

1. Import `getUserGoogleAccounts` and `getValidAccessToken` from `@/lib/google/userOAuth`
2. Import `getOAuthCalendarClient` from `@/lib/google/client`
3. After domain-wide events are collected, fetch per-user events:

```typescript
// --- Per-user OAuth calendars ---
const { getUserGoogleAccounts, getValidAccessToken } = await import('@/lib/google/userOAuth')
const { getOAuthCalendarClient } = await import('@/lib/google/client')
const userAccounts = await getUserGoogleAccounts(session.email, session.accountId)

for (const account of userAccounts) {
  const enabledCals = account.calendars.filter(c => c.enabled)
  if (enabledCals.length === 0) continue

  const accessToken = await getValidAccessToken(account.id)
  if (!accessToken) {
    warnings.push(`Google (${account.googleEmail}): token expired — reconnect in Settings`)
    continue
  }

  const calendar = getOAuthCalendarClient(accessToken)
  for (const cal of enabledCals) {
    try {
      const res = await calendar.events.list({
        calendarId: cal.calendarId,
        timeMin: `${dateFrom}T00:00:00Z`,
        timeMax: `${dateTo}T23:59:59Z`,
        singleEvents: true,
        maxResults: 250,
        fields: 'items(id,summary,description,start,end,organizer,attendees,conferenceData,htmlLink,status)',
      })
      for (const ev of res.data.items ?? []) {
        if (ev.status === 'cancelled') continue
        // Map to Activity using same pattern as domain-wide events
        // Add: googleCalendarId, googleAccountEmail, icsColor from cal.color
        perUserEvents.push(mapGoogleEvent(ev, session.email, cal))
      }
    } catch (e) {
      warnings.push(`Google (${account.googleEmail}) "${cal.name}": ${String(e).slice(0, 100)}`)
    }
  }
}
```

4. Deduplicate per-user events against domain-wide events by Google event ID
5. Return combined results with warnings (same `{ activities, warnings }` pattern as Outlook route)

**Important:** Extract the existing event mapping logic into a `mapGoogleEvent` helper function at the top of the file so both domain-wide and per-user paths can reuse it.

- [ ] **Step 2: Update the POST handler for per-user calendar creation**

When creating an event with source=google, check if a `googleTokenId` and `googleCalendarId` are provided in the request body. If so, use the per-user OAuth token instead of domain-wide delegation:

```typescript
if (body.googleTokenId && body.googleCalendarId) {
  const accessToken = await getValidAccessToken(body.googleTokenId)
  if (!accessToken) return NextResponse.json({ error: 'Google token expired' }, { status: 401 })
  const calendar = getOAuthCalendarClient(accessToken)
  // Use body.googleCalendarId instead of 'primary'
  const res = await calendar.events.insert({ calendarId: body.googleCalendarId, requestBody: event, conferenceDataVersion: 1 })
  return NextResponse.json({ id: res.data.id })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/google/route.ts
git commit -m "feat: fetch and create events via per-user Google OAuth tokens"
```

---

### Task 8: Event CRUD — Per-User Token Path

**Files:**
- Modify: `app/api/google/[id]/route.ts`

- [ ] **Step 1: Support per-user token for PUT and DELETE**

Both PUT and DELETE need to check for a `googleTokenId` query param. If present, use the per-user OAuth token instead of domain-wide delegation.

Add a helper at the top:

```typescript
import { getValidAccessToken } from '@/lib/google/userOAuth'
import { getOAuthCalendarClient } from '@/lib/google/client'

async function getCalendarClientForRequest(
  req: NextRequest,
  session: { email: string; accountId: string }
): Promise<{ calendar: calendar_v3.Calendar; calendarId: string } | NextResponse> {
  const tokenId = req.nextUrl.searchParams.get('googleTokenId')
  const calendarId = req.nextUrl.searchParams.get('googleCalendarId') ?? 'primary'

  if (tokenId) {
    const accessToken = await getValidAccessToken(tokenId)
    if (!accessToken) return NextResponse.json({ error: 'Google token expired' }, { status: 401 })
    return { calendar: getOAuthCalendarClient(accessToken), calendarId }
  }

  // Fall back to domain-wide delegation
  const googleConfig = await getGoogleConfig(session.accountId)
  if (!googleConfig) return NextResponse.json({ error: 'Google not configured' }, { status: 400 })
  return { calendar: getCalendarClient(googleConfig, session.email), calendarId: 'primary' }
}
```

Use this in both PUT and DELETE handlers, replacing the current `getGoogleConfig` + `getCalendarClient` calls. Pass `calendarId` to event patch/delete calls.

- [ ] **Step 2: Commit**

```bash
git add 'app/api/google/[id]/route.ts'
git commit -m "feat: Google event edit/delete supports per-user OAuth tokens"
```

---

### Task 9: Settings UI — Integrations Tab

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: Rename Calendars tab to Integrations**

Change the tab type from `'calendars'` to `'integrations'` and update the tab button label.

- [ ] **Step 2: Add Google section above existing ICS section**

In the Integrations tab content, add a Google section at the top:

```tsx
{/* Google Accounts */}
<div className="mb-6">
  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">Google Calendar</h3>
  {googleAccounts.map(account => (
    <div key={account.id} className="mb-3 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{account.googleEmail}</span>
        <div className="flex gap-2">
          <button onClick={() => refreshGoogleCalendars(account.id)}
            className="text-[10px] text-text-muted hover:text-text">Refresh</button>
          <button onClick={() => disconnectGoogle(account.googleEmail)}
            className="text-[10px] text-red-400 hover:text-red-300">Disconnect</button>
        </div>
      </div>
      {account.calendars.map(cal => (
        <div key={cal.id} className="flex items-center gap-2 py-1">
          <input type="checkbox" checked={cal.enabled}
            onChange={() => toggleGoogleCalendar(cal.id, !cal.enabled)} />
          <div className="w-3 h-3 rounded-full" style={{ background: cal.color || '#4285f4' }} />
          <span className="text-sm flex-1">{cal.name}</span>
          {/* Color picker — same pattern as ICS feeds */}
        </div>
      ))}
    </div>
  ))}
  <button onClick={() => window.location.href = '/api/google/auth'}
    className="text-sm text-primary font-semibold hover:underline">
    + Connect Google Account
  </button>
</div>

<div className="h-px bg-border my-4" />

{/* ICS Feeds — existing code moved here */}
<h3 className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">ICS Calendar Feeds</h3>
```

State additions:
```typescript
const [googleAccounts, setGoogleAccounts] = useState<UserGoogleAccount[]>([])
```

Fetch on tab open:
```typescript
useEffect(() => {
  if (activeTab === 'integrations') {
    fetch('/api/google/calendars').then(r => r.json()).then(setGoogleAccounts).catch(() => {})
    fetchCustomCals()  // existing ICS fetch
  }
}, [activeTab])
```

Handler functions for disconnect, toggle, color change, refresh — all calling the respective API endpoints.

- [ ] **Step 3: Commit**

```bash
git add components/SettingsModal.tsx
git commit -m "feat: Settings Integrations tab with Google account management"
```

---

### Task 10: Calendar Sources Dropdown — Grouped Google Calendars

**Files:**
- Modify: `components/CalendarShell.tsx`
- Modify: `components/CalendarSourcesDropdown.tsx`
- Modify: `types/index.ts`

- [ ] **Step 1: Extend CalendarSource type**

In `types/index.ts`, find the existing `CalendarSource` interface and add optional grouping fields:

```typescript
export interface CalendarSource {
  id: string
  label: string
  color: string
  personCode?: string
  group?: string          // e.g. "Google (elvis@gmail.com)"
  googleTokenId?: string  // for CRUD routing
  googleCalendarId?: string
}
```

- [ ] **Step 2: Update CalendarShell to fetch and include per-user Google calendars**

Add a state for user Google accounts. Fetch them alongside other data. Include each enabled calendar as a CalendarSource:

```typescript
// In the calendarSources useMemo:
...userGoogleAccounts.flatMap(account =>
  account.calendars.filter(c => c.enabled).map(cal => ({
    id: `google-user:${account.googleEmail}:${cal.calendarId}`,
    label: cal.name,
    color: cal.color ?? '#4285f4',
    group: `Google (${account.googleEmail})`,
    googleTokenId: account.id,
    googleCalendarId: cal.calendarId,
  }))
),
```

Update the activity filtering to respect these source IDs for hiding.

- [ ] **Step 3: Update CalendarSourcesDropdown to render groups**

Group sources by their `group` field. Render grouped items under a header:

```tsx
{/* Per-user Google account groups */}
{googleGroups.map(({ group, sources }) => (
  <div key={group}>
    <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wide font-bold">{group}</div>
    {sources.map(src => renderRow(src))}
  </div>
))}
```

- [ ] **Step 4: Commit**

```bash
git add components/CalendarShell.tsx components/CalendarSourcesDropdown.tsx types/index.ts
git commit -m "feat: per-user Google calendars in sources dropdown with grouping"
```

---

### Task 11: Activity Form — Unified Source Picker

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Add Google calendar sub-selector**

When `source === 'google'` and user has per-user Google accounts, show a calendar picker dropdown:

```tsx
{isGoogleSource && userGoogleAccounts.length > 0 && (
  <select
    value={selectedGoogleCalendar}
    onChange={e => {
      setSelectedGoogleCalendar(e.target.value)
      localStorage.setItem('lastGoogleCalendar', e.target.value)
    }}
    className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm"
  >
    {userGoogleAccounts.map(account => (
      <optgroup key={account.id} label={account.googleEmail}>
        {account.calendars.filter(c => c.enabled).map(cal => (
          <option key={cal.id} value={`${account.id}:${cal.calendarId}`}>
            {cal.name}
          </option>
        ))}
      </optgroup>
    ))}
    {/* Domain-wide delegation option if available */}
    {hasDomainWideGoogle && (
      <optgroup label="Workspace (domain)">
        <option value="domain:primary">Primary Calendar</option>
      </optgroup>
    )}
  </select>
)}
```

- [ ] **Step 2: Remember last selection in localStorage**

Initialize from localStorage:
```typescript
const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState(() =>
  localStorage.getItem('lastGoogleCalendar') ?? ''
)
```

Also add localStorage memory for ERP connection:
```typescript
// When source changes to an ERP connection, save it
useEffect(() => {
  if (activeErpConnection) localStorage.setItem('lastErpConnection', activeErpConnection.id)
}, [activeErpConnection])
```

Initialize ERP source from localStorage if available.

- [ ] **Step 3: Pass google token/calendar IDs when saving**

In the `handleSave` function, when creating a Google event, pass the selected token and calendar IDs:

```typescript
if (isGoogleSource && selectedGoogleCalendar && !selectedGoogleCalendar.startsWith('domain:')) {
  const [tokenId, calendarId] = selectedGoogleCalendar.split(':')
  body.googleTokenId = tokenId
  body.googleCalendarId = calendarId
}
```

- [ ] **Step 4: Pass userGoogleAccounts as a prop**

Add `userGoogleAccounts` to the ActivityForm props interface. CalendarShell passes it down from its state.

- [ ] **Step 5: Commit**

```bash
git add components/ActivityForm.tsx components/CalendarShell.tsx
git commit -m "feat: unified Google calendar picker in activity form with localStorage memory"
```

---

### Task 12: Environment Variables & GCP Setup

- [ ] **Step 1: Document required GCP configuration**

In the existing GCP project (same one with the service account):
1. Go to APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `https://herbe-calendar.vercel.app/api/google/callback`
4. Also add for preview: `https://herbe-calendar-test.vercel.app/api/google/callback`
5. Copy Client ID and Client Secret

- [ ] **Step 2: Add environment variables**

```bash
vercel env add GOOGLE_OAUTH_CLIENT_ID
vercel env add GOOGLE_OAUTH_CLIENT_SECRET
```

Add to all environments (Production, Preview, Development).

- [ ] **Step 3: Add test users in GCP**

Go to APIs & Services → OAuth consent screen → Test users → Add the Google emails you want to test with.

- [ ] **Step 4: Commit any .env.example updates if needed**

---

### Task 13: Integration Test & Deploy

- [ ] **Step 1: Test the full OAuth flow**

1. Open Settings → Integrations
2. Click "Connect Google Account"
3. Complete Google consent
4. Verify redirect back with calendars listed
5. Toggle calendars on/off, assign colors
6. Verify events appear in calendar view
7. Create an event via the form targeting a per-user calendar
8. Verify it appears in Google Calendar
9. Edit and delete events
10. Disconnect the account

- [ ] **Step 2: Test coexistence with domain-wide delegation**

1. With both domain-wide and per-user connected for the same Google email
2. Verify deduplication works (no double events)
3. Verify per-user calendars show separately in sources dropdown

- [ ] **Step 3: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
```

- [ ] **Step 4: Test on preview, then deploy to production**

```bash
git push origin main && vercel --prod
```
