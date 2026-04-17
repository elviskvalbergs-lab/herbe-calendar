# Google & Outlook Cache Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing ERP cache layer to cover Outlook (Microsoft Graph) and Google Calendar (domain-wide + per-user OAuth) sources, so /api/outlook, /api/google, /api/activities/summary, and the share endpoint all read from `cached_events` first and fall back to live provider fetches only when necessary.

**Architecture:** Reuse the existing `cached_events` and `sync_state` tables — `source ∈ {'outlook','google','google-user'}` distinguishes the new rows, `connection_id` stays empty for account-level providers and carries the `user_google_tokens.id` UUID for per-user rows. Two new sync modules (`lib/sync/graph.ts`, `lib/sync/google.ts`) mirror the shape of `lib/sync/erp.ts` and are driven by the same cron route. Read paths reuse the `isRangeCovered()` + `hasCompletedInitialSync(source)` guard the ERP layer already uses. Write-through on the existing mutation routes keeps in-app edits instant.

**Tech Stack:** Next.js 16 App Router, Neon PostgreSQL (raw SQL via `@neondatabase/serverless`), Vercel Cron, Microsoft Graph SDK (`lib/graph/client`), `googleapis` (`lib/google/client`, `lib/google/userOAuth`), Jest.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/cache/accountPersons.ts` | Query helper: list `{ code, email }[]` for an account (from `person_codes`) |
| `lib/sync/graph.ts` | Outlook sync engine: `buildOutlookCacheRows`, `syncAllOutlook(mode)` |
| `lib/sync/google.ts` | Google sync engine (domain-wide + per-user): `buildGoogleCacheRows`, `syncAllGoogle(mode)` |
| `__tests__/lib/sync/graph.test.ts` | Tests for Outlook row-building + sync orchestration |
| `__tests__/lib/sync/google.test.ts` | Tests for Google row-building + sync orchestration |
| `__tests__/lib/cache/accountPersons.test.ts` | Tests for the person-list helper |

### Modified files

| File | Change |
|------|--------|
| `lib/outlookUtils.ts` | Extract inline Graph-event → Activity mapping into `mapOutlookEvent(ev, personCode, sessionEmail)` and export it |
| `app/api/sync/cron/route.ts` | Run `syncAllOutlook` and `syncAllGoogle` alongside `syncAllErp` |
| `app/api/outlook/route.ts` | GET reads cache when range covered + initial sync done; POST write-through |
| `app/api/outlook/[id]/route.ts` | PUT re-fetches and upserts cache row; DELETE clears the cache row |
| `app/api/google/route.ts` | GET reads cache; POST write-through |
| `app/api/google/[id]/route.ts` | PUT upserts cache row; DELETE clears it |
| `app/api/activities/summary/route.ts` | Cache the Outlook and Google/Google-user branches like the ERP branch |
| `app/api/share/[token]/activities/route.ts` | Cache the Outlook and Google branches like the ERP branch |

---

## Task 1: Account Persons Helper

**Files:**
- Create: `lib/cache/accountPersons.ts`
- Test: `__tests__/lib/cache/accountPersons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/cache/accountPersons.test.ts`:

```typescript
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('listAccountPersons', () => {
  it('returns {code,email} rows for an account, skipping blanks', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { generated_code: 'EKS', email: 'eks@example.com' },
        { generated_code: 'JD', email: 'jd@example.com' },
      ],
    })
    const rows = await listAccountPersons('acc-1')
    expect(rows).toEqual([
      { code: 'EKS', email: 'eks@example.com' },
      { code: 'JD', email: 'jd@example.com' },
    ])
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('person_codes')
    expect(sql).toContain('generated_code')
    expect(params).toEqual(['acc-1'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/cache/accountPersons.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `lib/cache/accountPersons.ts`:

```typescript
import { pool } from '@/lib/db'

export interface AccountPerson {
  code: string
  email: string
}

/**
 * List all `{ code, email }` pairs known for an account. Uses `person_codes`
 * as the canonical map (column is `generated_code`, aliased to `code`).
 * Rows without a non-empty email are filtered out because Graph/Google
 * fetches need the email to work.
 */
export async function listAccountPersons(accountId: string): Promise<AccountPerson[]> {
  const { rows } = await pool.query<{ generated_code: string; email: string }>(
    `SELECT generated_code, email
     FROM person_codes
     WHERE account_id = $1 AND email IS NOT NULL AND email <> ''
     ORDER BY generated_code`,
    [accountId],
  )
  return rows.map(r => ({ code: r.generated_code, email: r.email }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/cache/accountPersons.test.ts --no-coverage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cache/accountPersons.ts __tests__/lib/cache/accountPersons.test.ts
git commit -m "feat: add listAccountPersons helper for sync engines"
```

---

## Task 2: Extract Outlook Event Mapper

**Files:**
- Modify: `lib/outlookUtils.ts`
- Modify: `app/api/outlook/route.ts`

The inline mapping logic in `app/api/outlook/route.ts` (lines ~62–97) needs to be callable from the sync engine. Extract it as a pure function.

- [ ] **Step 1: Add `mapOutlookEvent` to `lib/outlookUtils.ts`**

Append at the end of `lib/outlookUtils.ts`:

```typescript
import type { Activity } from '@/types'

/**
 * Convert a raw Microsoft Graph calendar event into an internal Activity.
 * Pure: no HTTP, no DB. Mirrors the inline mapping previously in /api/outlook GET.
 */
export function mapOutlookEvent(
  ev: OutlookEvent,
  personCode: string,
  sessionEmail: string,
): Activity {
  const startDt = ev.start?.dateTime ?? ''
  const endDt = ev.end?.dateTime ?? ''
  const organizerEmail = ev.organizer?.emailAddress?.address ?? ''
  const joinUrl = ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl ?? undefined
  const rawRsvp = ev.responseStatus?.response
  const rsvpStatus = (rawRsvp && rawRsvp !== 'none') ? rawRsvp as Activity['rsvpStatus'] : undefined
  const attendees = ev.attendees?.map(att => ({
    email: att.emailAddress?.address ?? '',
    name: att.emailAddress?.name ?? undefined,
    type: (att.type === 'optional' ? 'optional' : 'required') as 'required' | 'optional',
    responseStatus: att.status?.response ?? undefined,
  })).filter(a => a.email) ?? []
  return {
    id: ev.id ?? '',
    source: 'outlook' as const,
    personCode,
    description: ev.subject ?? '',
    date: startDt.slice(0, 10),
    timeFrom: startDt.slice(11, 16),
    timeTo: endDt.slice(11, 16),
    isOrganizer: organizerEmail.toLowerCase() === sessionEmail.toLowerCase(),
    isOnlineMeeting: ev.isOnlineMeeting === true,
    videoProvider: ev.isOnlineMeeting === true ? 'teams' as const : undefined,
    attendees,
    location: ev.location?.displayName,
    bodyPreview: ev.bodyPreview ?? '',
    joinUrl,
    webLink: ev.webLink ?? '',
    rsvpStatus,
  }
}
```

- [ ] **Step 2: Replace the inline block in `app/api/outlook/route.ts` (~lines 62–97) with a call**

In `app/api/outlook/route.ts`, replace the `graphEvents` mapping with:

```typescript
      const icsResult = await icsEventsPromise
      const graphEvents: Activity[] = rawEvents.map(ev => mapOutlookEvent(ev, code, sessionEmail))
```

Add to the import list at the top:

```typescript
import { fetchOutlookEventsForPerson, mapOutlookEvent } from '@/lib/outlookUtils'
```

- [ ] **Step 3: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: 406 tests pass (no new tests yet, refactor should be transparent).

- [ ] **Step 4: Commit**

```bash
git add lib/outlookUtils.ts app/api/outlook/route.ts
git commit -m "refactor: extract mapOutlookEvent so sync engine can reuse it"
```

---

## Task 3: Outlook Sync Engine — Row Building

**Files:**
- Create: `lib/sync/graph.ts`
- Test: `__tests__/lib/sync/graph.test.ts`

Row-building is pure and unit-testable; sync orchestration lands in Task 4.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/sync/graph.test.ts`:

```typescript
import { buildOutlookCacheRows } from '@/lib/sync/graph'
import type { OutlookEvent } from '@/lib/outlookUtils'

const baseEv: OutlookEvent = {
  id: 'AAMkAG...',
  subject: 'Standup',
  start: { dateTime: '2026-04-15T09:00:00.0000000' },
  end: { dateTime: '2026-04-15T09:30:00.0000000' },
}

describe('buildOutlookCacheRows', () => {
  it('produces one CachedEventRow for the given person, with source=outlook', () => {
    const rows = buildOutlookCacheRows(baseEv, 'acc-1', 'EKS', 'eks@example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('outlook')
    expect(rows[0].sourceId).toBe('AAMkAG...')
    expect(rows[0].accountId).toBe('acc-1')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].data.source).toBe('outlook')
    expect(rows[0].data.description).toBe('Standup')
  })

  it('skips events without a usable start.dateTime', () => {
    const ev = { ...baseEv, start: {} } as unknown as OutlookEvent
    expect(buildOutlookCacheRows(ev, 'acc-1', 'EKS', 'eks@example.com')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/sync/graph.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildOutlookCacheRows`**

Create `lib/sync/graph.ts`:

```typescript
import { fetchOutlookEventsForPerson, mapOutlookEvent, type OutlookEvent } from '@/lib/outlookUtils'
import { getAzureConfig } from '@/lib/accountConfig'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { getSyncState, updateSyncState } from '@/lib/cache/syncState'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { fullSyncRange } from '@/lib/sync/erp'
import { pool } from '@/lib/db'

const SOURCE = 'outlook'
const BATCH_SIZE = 500

/**
 * Convert one Graph event into a CachedEventRow for a specific person.
 * The sessionEmail is used for the isOrganizer flag baked into the Activity.
 */
export function buildOutlookCacheRows(
  ev: OutlookEvent,
  accountId: string,
  personCode: string,
  sessionEmail: string,
): CachedEventRow[] {
  const date = (ev.start?.dateTime ?? '').slice(0, 10)
  if (!date || !ev.id) return []
  const activity = mapOutlookEvent(ev, personCode, sessionEmail)
  return [{
    source: SOURCE,
    sourceId: ev.id,
    accountId,
    connectionId: '',
    personCode,
    date,
    data: activity as unknown as Record<string, unknown>,
  }]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/sync/graph.test.ts --no-coverage`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/graph.ts __tests__/lib/sync/graph.test.ts
git commit -m "feat: buildOutlookCacheRows — pure mapper for Outlook sync"
```

---

## Task 4: Outlook Sync Engine — `syncAllOutlook`

**Files:**
- Modify: `lib/sync/graph.ts`
- Modify: `__tests__/lib/sync/graph.test.ts`

- [ ] **Step 1: Add an orchestration test**

Append to `__tests__/lib/sync/graph.test.ts`:

```typescript
import { syncAllOutlook } from '@/lib/sync/graph'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn(),
}))
jest.mock('@/lib/cache/accountPersons', () => ({
  listAccountPersons: jest.fn(),
}))
jest.mock('@/lib/outlookUtils', () => {
  const actual = jest.requireActual('@/lib/outlookUtils')
  return { ...actual, fetchOutlookEventsForPerson: jest.fn() }
})
jest.mock('@/lib/cache/events', () => ({
  upsertCachedEvents: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/cache/syncState', () => ({
  getSyncState: jest.fn().mockResolvedValue(null),
  updateSyncState: jest.fn().mockResolvedValue(undefined),
}))

import { pool } from '@/lib/db'
import { getAzureConfig } from '@/lib/accountConfig'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'
import { upsertCachedEvents } from '@/lib/cache/events'

describe('syncAllOutlook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('iterates accounts, skips when Azure not configured', async () => {
    ;(pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
    ;(getAzureConfig as jest.Mock).mockResolvedValueOnce(null)
    const result = await syncAllOutlook('full')
    expect(result.accounts).toBe(1)
    expect(result.connections).toBe(0)
    expect(result.events).toBe(0)
    expect(upsertCachedEvents).not.toHaveBeenCalled()
  })

  it('fetches per-person and upserts when Azure is configured', async () => {
    ;(pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
    ;(getAzureConfig as jest.Mock).mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 'x@y' })
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchOutlookEventsForPerson as jest.Mock).mockResolvedValueOnce([
      { id: 'ev-1', subject: 'Mtg', start: { dateTime: '2026-04-15T09:00:00' }, end: { dateTime: '2026-04-15T10:00:00' } },
    ])
    const result = await syncAllOutlook('full')
    expect(result.events).toBe(1)
    expect(upsertCachedEvents).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx jest __tests__/lib/sync/graph.test.ts --no-coverage`
Expected: FAIL — `syncAllOutlook` is not exported yet.

- [ ] **Step 3: Implement `syncAllOutlook`**

Append to `lib/sync/graph.ts`:

```typescript
export type SyncMode = 'incremental' | 'full'

export interface SyncResult {
  accounts: number
  connections: number
  events: number
  errors: string[]
}

async function batchUpsert(rows: CachedEventRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertCachedEvents(rows.slice(i, i + BATCH_SIZE))
  }
}

async function syncAccountOutlook(
  accountId: string,
  mode: SyncMode,
): Promise<{ events: number; error?: string }> {
  const azure = await getAzureConfig(accountId)
  if (!azure) return { events: 0 }

  // No delta yet — always fetch the current sync window.
  const { dateFrom, dateTo } = fullSyncRange()
  const sessionEmail = azure.senderEmail

  try {
    await updateSyncState(accountId, SOURCE, '', { syncStatus: 'syncing' })

    if (mode === 'full') {
      await pool.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND source = $2`,
        [accountId, SOURCE],
      )
    }

    const people = await listAccountPersons(accountId)
    const rows: CachedEventRow[] = []
    for (const { code, email } of people) {
      const events = await fetchOutlookEventsForPerson(email, accountId, dateFrom, dateTo, sessionEmail)
      if (!events) continue
      for (const ev of events) {
        rows.push(...buildOutlookCacheRows(ev, accountId, code, sessionEmail))
      }
    }

    await batchUpsert(rows)

    await updateSyncState(accountId, SOURCE, '', {
      syncCursor: null,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })
    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, SOURCE, '', { syncStatus: 'error', errorMessage: msg }).catch(() => {})
    return { events: 0, error: msg }
  }
}

/**
 * Sync Outlook events for every active account with Azure configured.
 * `mode='full'` deletes the account's outlook rows first; `'incremental'`
 * just upserts (v1 has no delta, so both modes fetch the same window).
 */
export async function syncAllOutlook(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, connections: 0, events: 0, errors: [] }
  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )
  result.accounts = accounts.length

  for (const account of accounts) {
    const { events, error } = await syncAccountOutlook(account.id, mode)
    if (events > 0) result.connections++
    result.events += events
    if (error) result.errors.push(`${account.id}: ${error}`)
  }
  return result
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx jest __tests__/lib/sync/graph.test.ts --no-coverage`
Expected: PASS (4 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/graph.ts __tests__/lib/sync/graph.test.ts
git commit -m "feat: syncAllOutlook — full-window Outlook cache populator"
```

---

## Task 5: Google Sync Engine — Row Building

**Files:**
- Create: `lib/sync/google.ts`
- Test: `__tests__/lib/sync/google.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/sync/google.test.ts`:

```typescript
import { buildGoogleCacheRows } from '@/lib/sync/google'
import type { GoogleCalendarEvent } from '@/lib/googleUtils'

const baseEv = {
  id: 'gcal-1',
  summary: 'Call',
  start: { dateTime: '2026-04-15T09:00:00+03:00' },
  end: { dateTime: '2026-04-15T10:00:00+03:00' },
} as unknown as GoogleCalendarEvent

describe('buildGoogleCacheRows', () => {
  it('builds a single google row (domain-wide) with empty connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].sourceId).toBe('gcal-1')
  })

  it('builds a google-user row with the tokenId as connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google-user',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
      tokenId: 'tok-123',
      calendarId: 'cal-1',
      calendarName: 'Personal',
      accountEmail: 'eks@gmail.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google-user')
    expect(rows[0].connectionId).toBe('tok-123')
    expect(rows[0].data.googleTokenId).toBe('tok-123')
    expect(rows[0].data.googleCalendarName).toBe('Personal')
  })

  it('skips events without id or start date', () => {
    const bad = { ...baseEv, id: undefined } as GoogleCalendarEvent
    expect(buildGoogleCacheRows(bad, {
      source: 'google', accountId: 'acc-1', personCode: 'EKS',
      personEmail: 'eks@example.com', sessionEmail: 'eks@example.com',
    })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/sync/google.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildGoogleCacheRows`**

Create `lib/sync/google.ts`:

```typescript
import { mapGoogleEvent, type GoogleCalendarEvent } from '@/lib/googleUtils'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { updateSyncState } from '@/lib/cache/syncState'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { getGoogleConfig } from '@/lib/google/client'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { fullSyncRange } from '@/lib/sync/erp'
import { pool } from '@/lib/db'

const BATCH_SIZE = 500

export type GoogleSource = 'google' | 'google-user'

export interface BuildOpts {
  source: GoogleSource
  accountId: string
  personCode: string
  personEmail: string | null
  sessionEmail: string
  /** Required when source='google-user'. */
  tokenId?: string
  calendarId?: string
  calendarName?: string
  accountEmail?: string
  color?: string
}

/**
 * Build one CachedEventRow from a Google event. Pure, no I/O.
 * Accepts both the domain-wide 'google' source and the per-user
 * 'google-user' source; the latter stores the user_google_tokens.id
 * UUID as connection_id.
 */
export function buildGoogleCacheRows(
  ev: GoogleCalendarEvent,
  opts: BuildOpts,
): CachedEventRow[] {
  const start = ev.start?.dateTime ?? ev.start?.date ?? ''
  const date = start.slice(0, 10)
  if (!ev.id || !date) return []

  const activity = mapGoogleEvent(ev, opts.personCode, opts.sessionEmail, {
    googleCalendarId: opts.calendarId,
    googleCalendarName: opts.calendarName,
    googleAccountEmail: opts.accountEmail,
    googleTokenId: opts.tokenId,
    icsColor: opts.color,
  }, opts.personEmail ?? null)

  return [{
    source: opts.source,
    sourceId: ev.id,
    accountId: opts.accountId,
    connectionId: opts.tokenId ?? '',
    personCode: opts.personCode,
    date,
    data: activity as unknown as Record<string, unknown>,
  }]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/sync/google.test.ts --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/google.ts __tests__/lib/sync/google.test.ts
git commit -m "feat: buildGoogleCacheRows — pure mapper for Google sync"
```

---

## Task 6: Google Sync Engine — `syncAllGoogle`

**Files:**
- Modify: `lib/sync/google.ts`
- Modify: `__tests__/lib/sync/google.test.ts`

Covers both domain-wide (`source='google'`) and per-user OAuth (`source='google-user'`) flows.

- [ ] **Step 1: Add the orchestration test**

Append to `__tests__/lib/sync/google.test.ts`:

```typescript
import { syncAllGoogle } from '@/lib/sync/google'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn(),
}))
jest.mock('@/lib/googleUtils', () => {
  const actual = jest.requireActual('@/lib/googleUtils')
  return {
    ...actual,
    fetchGoogleEventsForPerson: jest.fn(),
    fetchPerUserGoogleEvents: jest.fn(),
  }
})
jest.mock('@/lib/cache/accountPersons', () => ({
  listAccountPersons: jest.fn(),
}))
jest.mock('@/lib/cache/events', () => ({
  upsertCachedEvents: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/cache/syncState', () => ({
  updateSyncState: jest.fn().mockResolvedValue(undefined),
}))

import { pool } from '@/lib/db'
import { getGoogleConfig } from '@/lib/google/client'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { upsertCachedEvents } from '@/lib/cache/events'

describe('syncAllGoogle', () => {
  beforeEach(() => jest.clearAllMocks())

  it('domain-wide: skips when Google not configured, still iterates per-user', async () => {
    ;(pool.query as jest.Mock)
      // tenant_accounts
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
      // user_google_tokens for acc-1
      .mockResolvedValueOnce({ rows: [] })
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce(null)
    const result = await syncAllGoogle('full')
    expect(result.accounts).toBe(1)
    expect(upsertCachedEvents).not.toHaveBeenCalled()
  })

  it('domain-wide: fetches per person when Google is configured', async () => {
    ;(pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // no per-user tokens
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce({ clientEmail: 'svc@', privateKey: 'k' })
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchGoogleEventsForPerson as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', summary: 'x', start: { dateTime: '2026-04-15T09:00:00Z' }, end: { dateTime: '2026-04-15T10:00:00Z' } },
    ])
    const result = await syncAllGoogle('full')
    expect(result.events).toBeGreaterThanOrEqual(1)
  })

  it('per-user: iterates user_google_tokens and calls fetchPerUserGoogleEvents', async () => {
    ;(pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1', user_email: 'eks@example.com', google_email: 'eks@gmail.com' }] })
      // any DELETE or auxiliary queries should also resolve
      .mockResolvedValue({ rows: [] })
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce(null) // skip domain-wide
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchPerUserGoogleEvents as jest.Mock).mockResolvedValueOnce({
      events: [{
        event: { id: 'pu1', summary: 'Gym', start: { dateTime: '2026-04-15T18:00:00Z' }, end: { dateTime: '2026-04-15T19:00:00Z' } },
        calendarId: 'cal-1', calendarName: 'Personal', accountEmail: 'eks@gmail.com', tokenId: 'tok-1',
      }],
      warnings: [],
    })
    const result = await syncAllGoogle('full')
    expect(result.events).toBe(1)
    expect(upsertCachedEvents).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/sync/google.test.ts --no-coverage`
Expected: FAIL — `syncAllGoogle` not exported.

- [ ] **Step 3: Implement `syncAllGoogle`**

Append to `lib/sync/google.ts`:

```typescript
export type SyncMode = 'incremental' | 'full'

export interface SyncResult {
  accounts: number
  connections: number
  events: number
  errors: string[]
}

async function batchUpsert(rows: CachedEventRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertCachedEvents(rows.slice(i, i + BATCH_SIZE))
  }
}

async function syncAccountGoogleDomainWide(
  accountId: string,
  mode: SyncMode,
  people: { code: string; email: string }[],
): Promise<{ events: number; error?: string }> {
  const config = await getGoogleConfig(accountId)
  if (!config) return { events: 0 }

  try {
    await updateSyncState(accountId, 'google', '', { syncStatus: 'syncing' })
    if (mode === 'full') {
      await pool.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND source = 'google'`,
        [accountId],
      )
    }
    const { dateFrom, dateTo } = fullSyncRange()
    const rows: CachedEventRow[] = []
    for (const { code, email } of people) {
      const events = await fetchGoogleEventsForPerson(email, accountId, dateFrom, dateTo)
      if (!events) continue
      for (const ev of events) {
        rows.push(...buildGoogleCacheRows(ev, {
          source: 'google',
          accountId,
          personCode: code,
          personEmail: email,
          sessionEmail: email,
        }))
      }
    }
    await batchUpsert(rows)
    await updateSyncState(accountId, 'google', '', {
      syncCursor: null,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })
    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, 'google', '', { syncStatus: 'error', errorMessage: msg }).catch(() => {})
    return { events: 0, error: msg }
  }
}

interface TokenRow { id: string; user_email: string; google_email: string }

async function syncAccountGoogleUser(
  accountId: string,
  mode: SyncMode,
  emailToCode: Map<string, string>,
): Promise<{ connections: number; events: number; errors: string[] }> {
  const { rows: tokens } = await pool.query<TokenRow>(
    `SELECT id, user_email, google_email FROM user_google_tokens WHERE account_id = $1`,
    [accountId],
  )

  let connections = 0
  let events = 0
  const errors: string[] = []

  for (const token of tokens) {
    const personCode = emailToCode.get(token.user_email.toLowerCase())
    // Skip tokens whose owner has no person_code — we need one for the schema
    if (!personCode) {
      errors.push(`${accountId}/${token.user_email}: no person_code — skipped`)
      continue
    }

    try {
      await updateSyncState(accountId, 'google-user', token.id, { syncStatus: 'syncing' })
      if (mode === 'full') {
        await pool.query(
          `DELETE FROM cached_events WHERE account_id = $1 AND source = 'google-user' AND connection_id = $2`,
          [accountId, token.id],
        )
      }
      const { dateFrom, dateTo } = fullSyncRange()
      const { events: fetched, warnings } = await fetchPerUserGoogleEvents(token.user_email, accountId, dateFrom, dateTo)
      const rows: CachedEventRow[] = []
      for (const item of fetched) {
        // fetchPerUserGoogleEvents returns events from ALL this user's tokens.
        // Filter to just the token we're iterating — each token gets its own sync_state.
        if (item.tokenId !== token.id) continue
        rows.push(...buildGoogleCacheRows(item.event, {
          source: 'google-user',
          accountId,
          personCode,
          personEmail: token.user_email,
          sessionEmail: token.user_email,
          tokenId: token.id,
          calendarId: item.calendarId,
          calendarName: item.calendarName,
          accountEmail: item.accountEmail,
          color: item.color,
        }))
      }
      await batchUpsert(rows)
      await updateSyncState(accountId, 'google-user', token.id, {
        syncCursor: null,
        syncStatus: 'idle',
        errorMessage: warnings.length ? warnings.join('; ').slice(0, 500) : null,
        isFullSync: true,
      })
      connections++
      events += rows.length
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${accountId}/${token.id}: ${msg}`)
      await updateSyncState(accountId, 'google-user', token.id, { syncStatus: 'error', errorMessage: msg }).catch(() => {})
    }
  }
  return { connections, events, errors }
}

/**
 * Sync Google events for every active account. Runs domain-wide ('google')
 * and per-user OAuth ('google-user') flows in sequence.
 */
export async function syncAllGoogle(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, connections: 0, events: 0, errors: [] }
  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )
  result.accounts = accounts.length

  for (const account of accounts) {
    const people = await listAccountPersons(account.id)
    const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))

    const dw = await syncAccountGoogleDomainWide(account.id, mode, people)
    if (dw.events > 0) result.connections++
    result.events += dw.events
    if (dw.error) result.errors.push(`${account.id}/google: ${dw.error}`)

    const pu = await syncAccountGoogleUser(account.id, mode, emailToCode)
    result.connections += pu.connections
    result.events += pu.events
    result.errors.push(...pu.errors)
  }
  return result
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/lib/sync/google.test.ts --no-coverage`
Expected: PASS (6 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add lib/sync/google.ts __tests__/lib/sync/google.test.ts
git commit -m "feat: syncAllGoogle — domain-wide + per-user Google cache populator"
```

---

## Task 7: Extend Cron Route

**Files:**
- Modify: `app/api/sync/cron/route.ts`

- [ ] **Step 1: Update the cron handler**

Replace the body of `app/api/sync/cron/route.ts` with (keep existing auth check intact):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { syncAllErp } from '@/lib/sync/erp'
import { syncAllOutlook } from '@/lib/sync/graph'
import { syncAllGoogle } from '@/lib/sync/google'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental'

  try {
    const [erp, outlook, google] = await Promise.all([
      syncAllErp(mode),
      syncAllOutlook(mode),
      syncAllGoogle(mode),
    ])
    const summary = { erp, outlook, google }
    console.log(`[sync/cron] ${mode} sync complete:`, JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (e) {
    console.error('[sync/cron] sync failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "sync/cron" | head -5`
Expected: no output (no errors in that file).

- [ ] **Step 3: Commit**

```bash
git add app/api/sync/cron/route.ts
git commit -m "feat: cron runs ERP + Outlook + Google sync in parallel"
```

---

## Task 8: /api/outlook GET — Read From Cache

**Files:**
- Modify: `app/api/outlook/route.ts`

- [ ] **Step 1: Swap the Graph-per-person block for a cache-first path**

In `app/api/outlook/route.ts`, add these imports at the top:

```typescript
import { getCachedEvents } from '@/lib/cache/events'
import { hasCompletedInitialSync } from '@/lib/cache/syncState'
import { isRangeCovered } from '@/lib/sync/erp'
```

Replace the Per-person `Promise.all(personList.map(...))` block (the one wrapping `rawEvents = await fetchOutlookEventsForPerson(...)` and the mapping) so that, before iterating, we decide once whether the cache can serve the range:

```typescript
    const [withinWindow, initialSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'outlook'),
    ])
    const canUseCache = withinWindow && initialSyncDone

    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code, session.accountId)
      if (!email) return { events: [], warnings: [] }

      const icsEventsPromise = fetchIcsForPerson(session.email, code, session.accountId, dateFrom, dateTo, bustIcsCache)
        .catch(e => {
          console.warn(`[outlook] ICS fetch failed for ${code}:`, e)
          return { events: [], warnings: [] }
        })

      if (!azureConfig) {
        const icsResult = await icsEventsPromise
        return { events: icsResult.events, warnings: icsResult.warnings }
      }

      let graphEvents: Activity[] = []
      if (canUseCache) {
        const cached = await getCachedEvents(session.accountId, [code], dateFrom, dateTo, 'outlook')
        graphEvents = cached as Activity[]
      }
      if (!canUseCache || graphEvents.length === 0) {
        const rawEvents = await fetchOutlookEventsForPerson(email, session.accountId, dateFrom, dateTo, sessionEmail)
        if (rawEvents === null) {
          const icsResult = await icsEventsPromise
          return { events: icsResult.events, warnings: [...icsResult.warnings, `Outlook: Graph request failed for ${email}`] }
        }
        graphEvents = rawEvents.map(ev => mapOutlookEvent(ev, code, sessionEmail))
      }

      const icsResult = await icsEventsPromise
      const uniqueIcs = deduplicateIcsAgainstGraph(graphEvents as unknown as Record<string, unknown>[], icsResult.events)
      return { events: [...graphEvents, ...uniqueIcs], warnings: icsResult.warnings }
    }))
```

- [ ] **Step 2: Run the Outlook route tests**

Run: `npx jest __tests__/api/outlook --no-coverage 2>&1 | tail -10`
Expected: existing tests pass. If the test file mocks `@/lib/sync/erp` or `@/lib/cache/syncState`, they already provide `isRangeCovered` / `hasCompletedInitialSync` (since Task 9 of the ERP plan). If either is missing, add the mock using the pattern shown in `__tests__/api/activities.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/outlook/route.ts
git commit -m "feat: /api/outlook GET reads cache when range covered + sync complete"
```

---

## Task 9: /api/google GET — Read From Cache

**Files:**
- Modify: `app/api/google/route.ts`

- [ ] **Step 1: Inspect the current GET handler**

Open `app/api/google/route.ts`. The GET handler fetches via `fetchGoogleEventsForPerson` (domain-wide) and `fetchPerUserGoogleEvents` (per-user). Both need the cache-first treatment.

- [ ] **Step 2: Add cache-first for both Google sources**

At the top of `app/api/google/route.ts`, add imports:

```typescript
import { getCachedEvents } from '@/lib/cache/events'
import { hasCompletedInitialSync } from '@/lib/cache/syncState'
import { isRangeCovered } from '@/lib/sync/erp'
```

Before the existing per-person loop, compute:

```typescript
  const withinWindow = isRangeCovered(dateFrom, dateTo)
  const [domainSyncDone, userSyncDone] = await Promise.all([
    hasCompletedInitialSync(session.accountId, 'google'),
    hasCompletedInitialSync(session.accountId, 'google-user'),
  ])
  const useDomainCache = withinWindow && domainSyncDone
  const useUserCache = withinWindow && userSyncDone
```

Replace the domain-wide fetch call so it reads from cache first:

```typescript
  let domainEvents: Activity[] = []
  if (useDomainCache) {
    domainEvents = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'google') as Activity[]
  }
  if (!useDomainCache || domainEvents.length === 0) {
    // existing live-fetch loop, mapping with mapGoogleEvent
  }
```

Similarly for per-user:

```typescript
  let userEvents: Activity[] = []
  if (useUserCache) {
    userEvents = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'google-user') as Activity[]
  }
  if (!useUserCache || userEvents.length === 0) {
    // existing fetchPerUserGoogleEvents + mapGoogleEvent loop
  }
```

Combine `domainEvents` and `userEvents` in the response exactly as the previous handler combined the two live fetches. Preserve all existing warning/error handling.

- [ ] **Step 3: Run the Google route tests**

Run: `npx jest __tests__/api/google --no-coverage 2>&1 | tail -10`
Expected: tests pass (add mocks if any test file complains about missing `isRangeCovered` or `hasCompletedInitialSync`).

- [ ] **Step 4: Commit**

```bash
git add app/api/google/route.ts
git commit -m "feat: /api/google GET reads cache for google + google-user"
```

---

## Task 10: Summary + Share Endpoints — Add Outlook & Google Cache

**Files:**
- Modify: `app/api/activities/summary/route.ts`
- Modify: `app/api/share/[token]/activities/route.ts`

The summary endpoint currently goes live for Outlook and Google. Wire the same cache-or-live pattern used for ERP.

- [ ] **Step 1: Update the summary route**

In `app/api/activities/summary/route.ts`, replace the Outlook block:

```typescript
  // Outlook
  try {
    const [withinWindow, outlookSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'outlook'),
    ])
    const canUseOutlookCache = withinWindow && outlookSyncDone
    let outlookFromCache: Activity[] = []
    if (canUseOutlookCache) {
      outlookFromCache = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'outlook')
    }
    if (canUseOutlookCache && outlookFromCache.length > 0) {
      for (const ev of outlookFromCache) {
        if (ev.date) addEntry(ev.date, 'outlook')
      }
    } else {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const events = await fetchOutlookEventsMinimal(email, session.accountId, dateFrom, dateTo)
          if (events) {
            for (const ev of events) {
              const date = (ev.start?.dateTime ?? '').slice(0, 10)
              if (date) addEntry(date, 'outlook')
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }
```

Do the same for the domain-wide `google` block (using source `'google'`) and the per-user `google-user` block (using source `'google-user'`). For each branch: try cache, fall back to the existing live loop if cache is unusable.

- [ ] **Step 2: Update the share route the same way**

In `app/api/share/[token]/activities/route.ts`, wrap the Outlook/Graph and Google fetches with the same pattern. `accountId` is already in scope.

- [ ] **Step 3: Run tests**

Run: `npm test 2>&1 | tail -6`
Expected: all tests pass. If share/activities test mocks are missing `hasCompletedInitialSync`, add:

```typescript
jest.mock('@/lib/cache/syncState', () => ({
  hasCompletedInitialSync: jest.fn().mockResolvedValue(true),
}))
```

- [ ] **Step 4: Commit**

```bash
git add app/api/activities/summary/route.ts app/api/share/\[token\]/activities/route.ts
git commit -m "feat: summary + share read Outlook/Google from cache when covered"
```

---

## Task 11: Outlook Write-Through (POST / PUT / DELETE)

**Files:**
- Modify: `app/api/outlook/route.ts`
- Modify: `app/api/outlook/[id]/route.ts`

- [ ] **Step 1: POST write-through**

In `app/api/outlook/route.ts` POST handler, after the successful `graphFetch` and response parse, and before returning, add:

```typescript
    // Write-through: cache the created event for every attendee with a person_code
    try {
      const accountPersons = await listAccountPersons(session.accountId)
      const emailToCode = new Map(accountPersons.map(p => [p.email.toLowerCase(), p.code]))
      const attendeeEmails = (data?.attendees ?? [])
        .map((a: any) => a.emailAddress?.address?.toLowerCase())
        .filter(Boolean) as string[]
      const codes = new Set<string>()
      // Always include the organizer (session user)
      const orgCode = emailToCode.get(session.email.toLowerCase())
      if (orgCode) codes.add(orgCode)
      for (const addr of attendeeEmails) {
        const c = emailToCode.get(addr)
        if (c) codes.add(c)
      }
      const rows: CachedEventRow[] = []
      for (const code of codes) {
        rows.push(...buildOutlookCacheRows(data, session.accountId, code, session.email))
      }
      if (rows.length > 0) {
        upsertCachedEvents(rows).catch(e => console.warn('[outlook/POST] cache write-through failed:', e))
      }
    } catch (e) {
      console.warn('[outlook/POST] cache write-through error:', e)
    }
```

Add imports at the top of the file:

```typescript
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { buildOutlookCacheRows } from '@/lib/sync/graph'
import { listAccountPersons } from '@/lib/cache/accountPersons'
```

- [ ] **Step 2: PUT write-through**

In `app/api/outlook/[id]/route.ts` PUT handler, after the Graph update call returns ok, re-fetch the updated event and upsert. Add imports at the top:

```typescript
import { upsertCachedEvents, deleteCachedEvent, type CachedEventRow } from '@/lib/cache/events'
import { buildOutlookCacheRows } from '@/lib/sync/graph'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { getAzureConfig } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
```

After the successful update response and before `return NextResponse.json(...)`, add:

```typescript
    try {
      const azure = await getAzureConfig(session.accountId)
      if (azure) {
        // Drop stale rows for this event first — attendee list may have changed
        await deleteCachedEvent(session.accountId, 'outlook', id)
        const refetch = await graphFetch(
          `/users/${session.email}/events/${id}?$select=id,subject,start,end,organizer,isOnlineMeeting,onlineMeetingUrl,onlineMeeting,attendees,location,bodyPreview,webLink,responseStatus`,
          { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
          azure,
        )
        if (refetch.ok) {
          const updated = await refetch.json()
          const people = await listAccountPersons(session.accountId)
          const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
          const codes = new Set<string>()
          const orgCode = emailToCode.get(session.email.toLowerCase())
          if (orgCode) codes.add(orgCode)
          for (const att of (updated.attendees ?? [])) {
            const addr = att.emailAddress?.address?.toLowerCase()
            if (addr) {
              const c = emailToCode.get(addr)
              if (c) codes.add(c)
            }
          }
          const rows: CachedEventRow[] = []
          for (const code of codes) {
            rows.push(...buildOutlookCacheRows(updated, session.accountId, code, session.email))
          }
          if (rows.length > 0) {
            upsertCachedEvents(rows).catch(e => console.warn('[outlook/PUT] cache write-through failed:', e))
          }
        }
      }
    } catch (e) {
      console.warn('[outlook/PUT] cache write-through error:', e)
    }
```

- [ ] **Step 3: DELETE write-through**

In `app/api/outlook/[id]/route.ts` DELETE handler, after a successful delete and before the response, add:

```typescript
    deleteCachedEvent(session.accountId, 'outlook', id).catch(e =>
      console.warn('[outlook/DELETE] cache write-through failed:', e)
    )
```

Import `deleteCachedEvent` from `@/lib/cache/events`.

- [ ] **Step 4: Typecheck + tests**

Run: `npm test 2>&1 | tail -6`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/outlook/route.ts app/api/outlook/\[id\]/route.ts
git commit -m "feat: outlook routes write through to cache on create/edit/delete"
```

---

## Task 12: Google Write-Through (POST / PUT / DELETE)

**Files:**
- Modify: `app/api/google/route.ts`
- Modify: `app/api/google/[id]/route.ts`

Mirrors Task 11 but accounts for the two Google sources. Inspect the POST handler to determine whether it writes via domain-wide (`getCalendarClient`) or per-user OAuth (`getOAuthCalendarClient`). That decision determines `source` and `connection_id`:

- Domain-wide write → `source='google'`, `connectionId=''`, `personCode` resolved from session/organizer email.
- Per-user OAuth write → `source='google-user'`, `connectionId=<user_google_tokens.id>`, `personCode` resolved from the token owner's email.

- [ ] **Step 1: POST write-through**

After the create succeeds, construct a `BuildOpts` matching the write path used and call `buildGoogleCacheRows(createdEvent, opts)` then `upsertCachedEvents(rows)`.

```typescript
    try {
      const people = await listAccountPersons(session.accountId)
      const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
      const personCode = emailToCode.get(session.email.toLowerCase())
      if (personCode && createdEvent?.id) {
        const rows = buildGoogleCacheRows(createdEvent, {
          source: tokenId ? 'google-user' : 'google',
          accountId: session.accountId,
          personCode,
          personEmail: session.email,
          sessionEmail: session.email,
          tokenId: tokenId ?? undefined,
          calendarId: calendarId ?? undefined,
          calendarName: calendarName ?? undefined,
          accountEmail: googleAccountEmail ?? undefined,
        })
        if (rows.length > 0) {
          upsertCachedEvents(rows).catch(e => console.warn('[google/POST] cache write-through failed:', e))
        }
      }
    } catch (e) {
      console.warn('[google/POST] cache write-through error:', e)
    }
```

Replace `tokenId`, `calendarId`, `calendarName`, `googleAccountEmail`, `createdEvent` with the variable names actually used in the POST handler (inspect before implementing).

Add imports:

```typescript
import { upsertCachedEvents } from '@/lib/cache/events'
import { buildGoogleCacheRows } from '@/lib/sync/google'
import { listAccountPersons } from '@/lib/cache/accountPersons'
```

- [ ] **Step 2: PUT write-through**

In `app/api/google/[id]/route.ts` PUT handler, after the update succeeds, call the same `buildGoogleCacheRows` + `upsertCachedEvents` with the updated event payload. If the Google API response doesn't include the full event, re-fetch via `calendar.events.get(...)` first.

- [ ] **Step 3: DELETE write-through**

After a successful delete, remove every cached row with that sourceId across both Google sources:

```typescript
    try {
      await pool.query(
        `DELETE FROM cached_events
         WHERE account_id = $1 AND source IN ('google','google-user') AND source_id = $2`,
        [session.accountId, id],
      )
    } catch (e) {
      console.warn('[google/DELETE] cache write-through failed:', e)
    }
```

Add `import { pool } from '@/lib/db'` if not already present.

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | tail -6`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/google/route.ts app/api/google/\[id\]/route.ts
git commit -m "feat: google routes write through to cache on create/edit/delete"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Deploy preview**

Run: `vercel deploy`
Capture the preview URL from stdout.

- [ ] **Step 2: Alias to herbe-calendar-test**

Run: `vercel alias set <preview-url> herbe-calendar-test.vercel.app`

- [ ] **Step 3: Trigger a full sync on preview**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://herbe-calendar-test.vercel.app/api/sync/cron?mode=full"
```
Expected response shape:
```json
{
  "erp":    { "accounts": 2, "connections": 3, "events": ..., "errors": [] },
  "outlook":{ "accounts": 2, "connections": ..., "events": ..., "errors": [] },
  "google": { "accounts": 2, "connections": ..., "events": ..., "errors": [] }
}
```

- [ ] **Step 4: Verify DB**

```bash
psql "$DATABASE_URL" -c "SELECT source, count(*) FROM cached_events GROUP BY source ORDER BY source;"
```
Expected: rows for each of `herbe`, `outlook`, `google`, `google-user` (any that have data).

- [ ] **Step 5: Verify sync_state**

```bash
psql "$DATABASE_URL" -c "SELECT source, sync_status, last_full_sync_at IS NOT NULL AS synced FROM sync_state ORDER BY source;"
```
Expected: every row `sync_status='idle'`, `synced=t`.

- [ ] **Step 6: Browser spot-check**

Open preview in browser:
- Navigate to a day that has Outlook meetings. Network tab: `/api/outlook` response should be fast (single DB read), events should match what Outlook shows natively.
- Navigate to a day with Google events (domain + personal Google account). Same check.
- Create a new Outlook meeting via the calendar UI. Verify it appears immediately (write-through).
- Create a new Google event via the UI. Verify it appears immediately.
- Delete one of each. Verify removed from the calendar without requiring refresh.

- [ ] **Step 7: Trigger incremental sync**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://herbe-calendar-test.vercel.app/api/sync/cron"
```
Expected: incremental mode runs without deleting rows; counts match a fresh fetch.

- [ ] **Step 8: Final commit marker**

```bash
git commit --allow-empty -m "chore: google + outlook cache layer — ready for prod"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-17-google-outlook-cache.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
