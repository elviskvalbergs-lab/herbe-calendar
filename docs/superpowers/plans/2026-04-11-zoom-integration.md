# Zoom Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zoom meeting link generation as a third video provider alongside Teams and Meet, with admin config, manual activity creation, and booking template support.

**Architecture:** Admin configures Zoom Server-to-Server OAuth credentials in `/admin/config`. A new `lib/zoom/client.ts` handles token acquisition and meeting creation via the Zoom API. The `POST /api/zoom/meetings` endpoint creates meetings. The ActivityForm gets a "Zoom meeting" checkbox (source-independent). BookingTemplateEditor gets a Zoom toggle in targets. The booking flow creates Zoom meetings when enabled. ActivityBlock shows "Join Zoom" with Zoom-blue styling.

**Tech Stack:** Next.js App Router, Zoom Server-to-Server OAuth API, AES-256-GCM encryption (existing), PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-11-zoom-integration-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `db/migrations/16_add_zoom_config.sql` | Schema for account_zoom_config table |
| `lib/zoom/client.ts` | Zoom API client: token acquisition, meeting creation, config loader |
| `app/api/zoom/meetings/route.ts` | POST endpoint to create Zoom meetings |

### Modified files
| File | Change |
|------|--------|
| `types/index.ts` | Add `zoom` to `TemplateTargets` |
| `app/api/admin/config/route.ts` | Handle `type: 'zoom'` in PUT and `action: 'test-zoom'` in POST |
| `app/admin/config/ConfigClient.tsx` | Add Zoom config section |
| `components/ActivityBlock.tsx` | Add `videoProvider === 'zoom'` case with Zoom blue |
| `components/ActivityForm.tsx` | Add "Zoom meeting" checkbox and pass zoom data on save |
| `components/BookingTemplateEditor.tsx` | Add Zoom toggle in template targets |
| `app/api/share/[token]/book/route.ts` | Create Zoom meeting during booking flow |

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/16_add_zoom_config.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS account_zoom_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL UNIQUE,
  zoom_account_id TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  client_secret   BYTEA NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

- [ ] **Step 2: Run migration**

```bash
psql "$DATABASE_URL" -f db/migrations/16_add_zoom_config.sql
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/16_add_zoom_config.sql
git commit -m "feat: add account_zoom_config table"
```

---

### Task 2: Types — TemplateTargets Extension

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add zoom to TemplateTargets**

Find the `TemplateTargets` interface. After the `google?` field, add:

```typescript
  zoom?: {
    enabled: boolean
  }
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add zoom to TemplateTargets type"
```

---

### Task 3: Zoom API Client

**Files:**
- Create: `lib/zoom/client.ts`

- [ ] **Step 1: Write the Zoom client**

```typescript
import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'

export interface ZoomConfig {
  zoomAccountId: string
  clientId: string
  clientSecret: string
}

// In-memory token cache
let tokenCache: { token: string; expiresAt: number; key: string } | null = null

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token'
const ZOOM_API_BASE = 'https://api.zoom.us/v2'
const CONFIG_CACHE = new Map<string, { data: ZoomConfig | null; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

/** Get Zoom config for an account from the database (5-min cache). */
export async function getZoomConfig(accountId: string): Promise<ZoomConfig | null> {
  const cached = CONFIG_CACHE.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT zoom_account_id, client_id, client_secret FROM account_zoom_config WHERE account_id = $1',
      [accountId]
    )
    if (rows.length === 0) {
      CONFIG_CACHE.set(accountId, { data: null, ts: Date.now() })
      return null
    }
    const config: ZoomConfig = {
      zoomAccountId: rows[0].zoom_account_id,
      clientId: rows[0].client_id,
      clientSecret: decrypt(rows[0].client_secret),
    }
    CONFIG_CACHE.set(accountId, { data: config, ts: Date.now() })
    return config
  } catch (e) {
    console.warn('[zoom] config lookup failed:', String(e))
    return null
  }
}

/** Get a valid Zoom access token using Server-to-Server OAuth. */
async function getAccessToken(config: ZoomConfig): Promise<string> {
  const cacheKey = `${config.clientId}:${config.zoomAccountId}`
  if (tokenCache && tokenCache.key === cacheKey && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: config.zoomAccountId,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoom token request failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error('No access_token in Zoom response')

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    key: cacheKey,
  }
  return data.access_token
}

/** Create a Zoom meeting. Returns the join URL and meeting ID. */
export async function createZoomMeeting(
  config: ZoomConfig,
  topic: string,
  startTime: string,
  durationMinutes: number,
): Promise<{ joinUrl: string; meetingId: string }> {
  const token = await getAccessToken(config)
  const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: 2, // scheduled meeting
      start_time: startTime,
      duration: durationMinutes,
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoom meeting creation failed: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return { joinUrl: data.join_url, meetingId: String(data.id) }
}

/** Test Zoom credentials by fetching /users/me. */
export async function testZoomConnection(config: ZoomConfig): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const token = await getAccessToken(config)
    const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { ok: true, email: data.email }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Save Zoom config for an account. */
export async function saveZoomConfig(
  accountId: string,
  zoomAccountId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const encSecret = encrypt(clientSecret)
  await pool.query(
    `INSERT INTO account_zoom_config (account_id, zoom_account_id, client_id, client_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id)
     DO UPDATE SET zoom_account_id = $2, client_id = $3, client_secret = $4, updated_at = now()`,
    [accountId, zoomAccountId, clientId, encSecret]
  )
  CONFIG_CACHE.delete(accountId)
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/zoom/client.ts
git commit -m "feat: Zoom API client with token caching and meeting creation"
```

---

### Task 4: Zoom Meetings API Endpoint

**Files:**
- Create: `app/api/zoom/meetings/route.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getZoomConfig, createZoomMeeting } from '@/lib/zoom/client'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const zoomConfig = await getZoomConfig(session.accountId)
  if (!zoomConfig) {
    return NextResponse.json({ error: 'Zoom not configured' }, { status: 400 })
  }

  const { topic, startTime, duration } = await req.json()
  if (!topic || !startTime || !duration) {
    return NextResponse.json({ error: 'topic, startTime, and duration required' }, { status: 400 })
  }

  try {
    const result = await createZoomMeeting(zoomConfig, topic, startTime, duration)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[zoom/meetings] creation failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/zoom/meetings/route.ts
git commit -m "feat: POST /api/zoom/meetings endpoint"
```

---

### Task 5: Admin Config — Zoom Section

**Files:**
- Modify: `app/api/admin/config/route.ts`
- Modify: `app/admin/config/ConfigClient.tsx`

- [ ] **Step 1: Add Zoom save/test to admin config API**

In `app/api/admin/config/route.ts`:

In the PUT handler, add a case for `type === 'zoom'` (after the existing google case):

```typescript
if (body.type === 'zoom') {
  const { saveZoomConfig } = await import('@/lib/zoom/client')
  await saveZoomConfig(accountId, body.zoomAccountId, body.clientId, body.clientSecret)
  return NextResponse.json({ ok: true })
}
```

In the POST handler (test actions), add a case for `action === 'test-zoom'`:

```typescript
if (body.action === 'test-zoom') {
  const { getZoomConfig, testZoomConnection } = await import('@/lib/zoom/client')
  const config = await getZoomConfig(accountId)
  if (!config) return NextResponse.json({ ok: false, error: 'Zoom not configured' })
  const result = await testZoomConnection(config)
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Add Zoom section to admin config page**

In `app/admin/config/ConfigClient.tsx`, add a Zoom section after the Google Workspace section. Follow the existing collapsible pattern (toggleSection/isSectionOpen):

Add state:
```typescript
const [zoomAccountId, setZoomAccountId] = useState(initialZoom?.zoomAccountId ?? '')
const [zoomClientId, setZoomClientId] = useState(initialZoom?.clientId ?? '')
const [zoomClientSecret, setZoomClientSecret] = useState('')
const [zoomStatus, setZoomStatus] = useState('')
```

Read the file first to understand how `initialZoom` should be passed. Check how `azure` and `google` initial data is loaded in the page.tsx server component and passed as props. Add the same pattern for zoom:
- In `app/admin/config/page.tsx`: fetch zoom config from DB and pass as prop
- In `ConfigClient.tsx`: receive `zoom` prop and use it

The Zoom section UI:
```tsx
<section className="bg-surface border border-border rounded-xl overflow-hidden">
  <button onClick={() => toggleSection('zoom')} className="w-full flex items-center justify-between p-4 text-left hover:bg-border/20">
    <span className="font-bold text-sm">Zoom</span>
    {initialZoom && <span className="text-[10px] text-green-400 font-bold">configured</span>}
  </button>
  {isSectionOpen('zoom') && (
    <div className="p-4 border-t border-border space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1">Account ID</label>
          <input value={zoomAccountId} onChange={e => setZoomAccountId(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" placeholder="Zoom Account ID" />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Client ID</label>
          <input value={zoomClientId} onChange={e => setZoomClientId(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" placeholder="Client ID" />
        </div>
      </div>
      <div>
        <label className="text-xs text-text-muted block mb-1">Client Secret</label>
        <input type="password" value={zoomClientSecret} onChange={e => setZoomClientSecret(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm" placeholder="Client Secret (leave empty to keep current)" />
      </div>
      {zoomStatus && <p className="text-xs text-text-muted">{zoomStatus}</p>}
      <div className="flex gap-2">
        <button onClick={async () => {
          setZoomStatus('Saving...')
          const res = await fetch('/api/admin/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'zoom', zoomAccountId, clientId: zoomClientId, clientSecret: zoomClientSecret || undefined }),
          })
          setZoomStatus(res.ok ? 'Saved!' : 'Error saving')
        }} className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg">Save Zoom Config</button>
        <button onClick={async () => {
          setZoomStatus('Testing...')
          const res = await fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test-zoom' }),
          })
          const data = await res.json()
          setZoomStatus(data.ok ? `Connected (${data.email})` : `Failed: ${data.error}`)
        }} className="text-xs font-bold px-4 py-2 rounded-lg border border-border hover:bg-border/30">Test Connection</button>
      </div>
    </div>
  )}
</section>
```

- [ ] **Step 3: Pass zoom config from page.tsx**

Read `app/admin/config/page.tsx` to understand how azure/google configs are loaded. Add zoom config loading with the same pattern (query `account_zoom_config`, decrypt secret, pass as prop).

- [ ] **Step 4: Verify compilation and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add app/api/admin/config/route.ts app/admin/config/ConfigClient.tsx app/admin/config/page.tsx
git commit -m "feat: Zoom admin config section with save and test"
```

---

### Task 6: ActivityBlock — Zoom Join Button

**Files:**
- Modify: `components/ActivityBlock.tsx`

- [ ] **Step 1: Add zoom case to the join button**

Find the join URL button (around line 293). The style currently checks for `meet` and `teams`. Add `zoom`:

Change the style line:
```typescript
style={{ background: activity.videoProvider === 'meet' ? '#1a73e8' : activity.videoProvider === 'teams' ? '#464EB8' : activity.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb' }}
```

Change the label:
```typescript
{activity.videoProvider === 'meet'
  ? <>🔗 Join Google Meet</>
  : activity.videoProvider === 'teams'
    ? <><TeamsIcon size={12} /> Join in Teams</>
    : activity.videoProvider === 'zoom'
      ? <>🔗 Join Zoom</>
      : <>🔗 Join meeting</>
}
```

Also check ActivityForm.tsx for the same pattern in the saved activity display (join button in the form) — update those too.

- [ ] **Step 2: Commit**

```bash
git add components/ActivityBlock.tsx components/ActivityForm.tsx
git commit -m "feat: Join Zoom button with Zoom blue styling"
```

---

### Task 7: ActivityForm — Zoom Meeting Checkbox

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Add zoom state and checkbox**

Add state:
```typescript
const [zoomMeeting, setZoomMeeting] = useState(false)
```

Add a prop to know if Zoom is configured. The `availableSources` prop already exists — check if it has a `zoom` field, or add one. Alternatively, add a `zoomConfigured?: boolean` prop.

After the existing "Online meeting" toggle (around line 1409), add:

```tsx
{/* Zoom meeting checkbox — appears for all sources when Zoom is configured */}
{zoomConfigured && (
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={zoomMeeting}
      onChange={e => setZoomMeeting(e.target.checked)}
      className="accent-primary w-4 h-4"
    />
    <span className="text-xs font-bold text-text-muted">Zoom meeting</span>
  </label>
)}
```

- [ ] **Step 2: Create Zoom meeting on save**

In the `handleSave` function, after the main event is created (after the fetch to the source-specific API), if `zoomMeeting` is true, create the Zoom meeting and inject the URL:

```typescript
// After the main event creation succeeds:
let zoomJoinUrl: string | undefined
if (zoomMeeting) {
  try {
    const startIso = `${date}T${timeFrom}:00`
    const durationMins = Math.round(
      ((parseInt(timeTo.split(':')[0]) * 60 + parseInt(timeTo.split(':')[1])) -
       (parseInt(timeFrom.split(':')[0]) * 60 + parseInt(timeFrom.split(':')[1])))
    )
    const zoomRes = await fetch('/api/zoom/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: description, startTime: startIso, duration: durationMins || 30 }),
    })
    if (zoomRes.ok) {
      const zoomData = await zoomRes.json()
      zoomJoinUrl = zoomData.joinUrl
    }
  } catch (e) {
    console.warn('[ActivityForm] Zoom meeting creation failed:', e)
  }
}
```

Then include `zoomJoinUrl` in the saved activity display so the join button appears immediately.

- [ ] **Step 3: Pass zoomConfigured prop from CalendarShell**

In CalendarShell, check if zoom config exists (fetch `/api/admin/config` or add a flag to the existing sources check). Pass `zoomConfigured` to ActivityForm.

The simplest approach: add `zoom: boolean` to the `sources` state object in CalendarShell. In the initial config fetch (where `sources.herbe`, `sources.azure`, `sources.google` are set), add a check for zoom config. Or check via a lightweight endpoint.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/ActivityForm.tsx components/CalendarShell.tsx
git commit -m "feat: Zoom meeting checkbox in ActivityForm with API integration"
```

---

### Task 8: BookingTemplateEditor — Zoom Toggle

**Files:**
- Modify: `components/BookingTemplateEditor.tsx`

- [ ] **Step 1: Add Zoom state and section**

Add state alongside the existing outlook/google states:
```typescript
const [zoomEnabled, setZoomEnabled] = useState(!!template?.targets?.zoom?.enabled)
```

After the Google section (around line 338), add:

```tsx
{/* Zoom */}
<div className="p-3 border border-border rounded-lg space-y-2">
  <label className="flex items-center gap-2 text-xs cursor-pointer">
    <input type="checkbox" checked={zoomEnabled} onChange={e => setZoomEnabled(e.target.checked)} className="accent-primary" />
    <span className="font-bold">Zoom meeting</span>
  </label>
</div>
```

- [ ] **Step 2: Include zoom in save payload**

Find the save function where `targets` is constructed. Add zoom:

```typescript
zoom: zoomEnabled ? { enabled: true } : undefined,
```

- [ ] **Step 3: Commit**

```bash
git add components/BookingTemplateEditor.tsx
git commit -m "feat: Zoom toggle in booking template targets"
```

---

### Task 9: Booking Flow — Zoom Meeting Creation

**Files:**
- Modify: `app/api/share/[token]/book/route.ts`

- [ ] **Step 1: Add Zoom meeting creation to booking flow**

Read the file to understand the booking flow. After the existing Outlook and Google event creation sections, add Zoom:

```typescript
// --- Zoom meeting ---
let zoomJoinUrl: string | undefined
if (targets.zoom?.enabled) {
  try {
    const { getZoomConfig, createZoomMeeting } = await import('@/lib/zoom/client')
    const zoomConfig = await getZoomConfig(accountId)
    if (zoomConfig) {
      const startIso = `${date}T${time}:00`
      const result = await createZoomMeeting(zoomConfig, templateName, startIso, durationMinutes)
      zoomJoinUrl = result.joinUrl
    }
  } catch (e) {
    console.warn('[book] Zoom meeting creation failed:', String(e))
  }
}
```

Inject the Zoom join URL into the notification email body and/or the ERP activity text if created. Find where `activityText` or the email body is constructed and append the Zoom URL:

```typescript
if (zoomJoinUrl) {
  // Append to activity text or email body
  // e.g.: activityText += `\nZoom: ${zoomJoinUrl}`
}
```

Check how the current Teams/Meet join URLs are handled in the booking flow for the pattern to follow.

- [ ] **Step 2: Commit**

```bash
git add 'app/api/share/[token]/book/route.ts'
git commit -m "feat: create Zoom meeting during booking flow"
```

---

### Task 10: Deploy & Test

- [ ] **Step 1: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
```

- [ ] **Step 2: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
git checkout main
```

- [ ] **Step 3: Test the full flow**

1. Admin: configure Zoom in /admin/config (Account ID, Client ID, Secret)
2. Admin: test connection (should show Zoom account email)
3. Activity form: verify "Zoom meeting" checkbox appears
4. Create an activity with Zoom meeting checked — verify join URL appears
5. Booking template: verify Zoom toggle in targets
6. Book via a share link with Zoom enabled — verify meeting is created
