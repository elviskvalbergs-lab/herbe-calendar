# ERP Cache Layer — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache ERP (Standard Books) activities in Neon so the calendar reads from local DB instead of hitting the ERP API on every page load. Incremental sync via `updates_after` keeps the cache fresh.

**Architecture:** Two new tables (`cached_events`, `sync_state`) store ERP activities and track sync cursors. A Vercel Cron job runs every 5 minutes using `updates_after={sequence}` for incremental sync, plus a daily full reconciliation to catch deletions. The `/api/activities` GET endpoint reads from cache. Write operations (POST/PATCH/DELETE) write-through to both ERP and cache. Outlook, Google, and ICS sources remain unchanged (live-fetched). A settings UI section provides cache management (date-range reset + full nuke).

**Tech Stack:** Next.js 16, Neon PostgreSQL (raw SQL via `@neondatabase/serverless`), Vercel Cron Jobs, Jest

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `db/migrations/22_create_cache_tables.sql` | Migration: `cached_events` + `sync_state` tables |
| `lib/cache/events.ts` | CRUD for `cached_events` table |
| `lib/cache/syncState.ts` | CRUD for `sync_state` table |
| `lib/sync/erp.ts` | ERP incremental + full sync engine |
| `app/api/sync/cron/route.ts` | Vercel Cron handler (incremental + daily full) |
| `app/api/sync/force/route.ts` | Force re-sync a date range from settings UI |
| `app/api/sync/nuke/route.ts` | Cache clear (date range or full nuke) |
| `app/api/sync/status/route.ts` | Last sync times for UI indicator |
| `__tests__/lib/cache/events.test.ts` | Tests for cache event CRUD |
| `__tests__/lib/sync/erp.test.ts` | Tests for sync engine logic |
| `vercel.json` | Cron schedule configuration |

### Modified files

| File | Change |
|------|--------|
| `lib/herbe/client.ts` | Export `herbeParseJSON`, add `herbeFetchWithSequence` |
| `app/api/activities/route.ts` | GET reads ERP from cache; POST write-through to cache |
| `app/api/activities/[id]/route.ts` | PUT/DELETE write-through to cache |
| `app/api/share/[token]/activities/route.ts` | ERP portion reads from cache |
| `components/SettingsModal.tsx` | Add "Cache" tab with management UI |

---

## Task 1: Database Migration

**Files:**
- Create: `db/migrations/22_create_cache_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 22_create_cache_tables.sql
-- Cache layer for calendar events synced from external sources

CREATE TABLE IF NOT EXISTS cached_events (
  source          TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  connection_id   TEXT NOT NULL DEFAULT '',
  person_code     TEXT NOT NULL,
  date            DATE NOT NULL,
  data            JSONB NOT NULL,
  cached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, source, source_id, person_code)
);

CREATE INDEX idx_cached_events_lookup
  ON cached_events (account_id, person_code, date);

CREATE INDEX idx_cached_events_source_conn
  ON cached_events (account_id, source, connection_id);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id        UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  connection_id     TEXT NOT NULL DEFAULT '',
  sync_cursor       TEXT,
  last_sync_at      TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  sync_status       TEXT NOT NULL DEFAULT 'idle',
  error_message     TEXT,
  PRIMARY KEY (account_id, source, connection_id)
);
```

- [ ] **Step 2: Run the migration**

Run: `psql "$DATABASE_URL" -f db/migrations/22_create_cache_tables.sql`
Expected: `CREATE TABLE` x2, `CREATE INDEX` x2

- [ ] **Step 3: Verify tables exist**

Run: `psql "$DATABASE_URL" -c "\dt cached_events; \dt sync_state;"`
Expected: Both tables listed

- [ ] **Step 4: Commit**

```bash
git add db/migrations/22_create_cache_tables.sql
git commit -m "feat: add cached_events and sync_state tables for ERP cache layer"
```

---

## Task 2: Cache Events Data Access Layer

**Files:**
- Create: `lib/cache/events.ts`
- Test: `__tests__/lib/cache/events.test.ts`

- [ ] **Step 1: Write tests for cache event functions**

Create `__tests__/lib/cache/events.test.ts`:

```typescript
import { upsertCachedEvents, getCachedEvents, deleteCachedEvents, deleteCachedEventsBySource } from '@/lib/cache/events'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('getCachedEvents', () => {
  it('queries by account, person codes, and date range', async () => {
    mockQuery.mockResolvedValue({ rows: [{ data: { id: '1', source: 'herbe' } }] })
    const result = await getCachedEvents('acc-1', ['EKS', 'JD'], '2026-04-10', '2026-04-16')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('cached_events')
    expect(params).toEqual(['acc-1', ['EKS', 'JD'], '2026-04-10', '2026-04-16', 'herbe'])
    expect(result).toEqual([{ id: '1', source: 'herbe' }])
  })
})

describe('upsertCachedEvents', () => {
  it('does nothing for empty array', async () => {
    await upsertCachedEvents([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('builds multi-row upsert for multiple events', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 })
    await upsertCachedEvents([
      { source: 'herbe', sourceId: '100', accountId: 'acc-1', connectionId: 'c1', personCode: 'EKS', date: '2026-04-10', data: { id: '100' } },
      { source: 'herbe', sourceId: '101', accountId: 'acc-1', connectionId: 'c1', personCode: 'JD', date: '2026-04-11', data: { id: '101' } },
    ])
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql] = mockQuery.mock.calls[0]
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('DO UPDATE')
  })
})

describe('deleteCachedEvents', () => {
  it('deletes by account, source, and date range', async () => {
    mockQuery.mockResolvedValue({ rowCount: 5 })
    const count = await deleteCachedEvents('acc-1', 'herbe', '2026-04-10', '2026-04-16')
    expect(count).toBe(5)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('DELETE')
    expect(params).toEqual(['acc-1', 'herbe', '2026-04-10', '2026-04-16'])
  })
})

describe('deleteCachedEventsBySource', () => {
  it('deletes all events for a source in an account', async () => {
    mockQuery.mockResolvedValue({ rowCount: 50 })
    const count = await deleteCachedEventsBySource('acc-1', 'herbe')
    expect(count).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/cache/events.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the cache events module**

Create `lib/cache/events.ts`:

```typescript
import { pool } from '@/lib/db'
import type { Activity } from '@/types'

export interface CachedEventRow {
  source: string
  sourceId: string
  accountId: string
  connectionId: string
  personCode: string
  date: string
  data: Record<string, unknown>
}

/**
 * Read cached ERP events for given person codes and date range.
 */
export async function getCachedEvents(
  accountId: string,
  personCodes: string[],
  dateFrom: string,
  dateTo: string,
  source = 'herbe',
): Promise<Activity[]> {
  const { rows } = await pool.query<{ data: Activity }>(
    `SELECT data FROM cached_events
     WHERE account_id = $1
       AND person_code = ANY($2)
       AND date BETWEEN $3 AND $4
       AND source = $5`,
    [accountId, personCodes, dateFrom, dateTo, source],
  )
  return rows.map(r => r.data)
}

/**
 * Upsert one or more cached events. Uses a multi-row INSERT ... ON CONFLICT.
 */
export async function upsertCachedEvents(events: CachedEventRow[]): Promise<void> {
  if (events.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let idx = 1

  for (const e of events) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, now())`)
    values.push(e.source, e.sourceId, e.accountId, e.connectionId, e.personCode, e.date, JSON.stringify(e.data))
    idx += 7
  }

  await pool.query(
    `INSERT INTO cached_events (source, source_id, account_id, connection_id, person_code, date, data, cached_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (account_id, source, source_id, person_code)
     DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, connection_id = EXCLUDED.connection_id, cached_at = now()`,
    values,
  )
}

/**
 * Delete cached events for a source within a date range.
 */
export async function deleteCachedEvents(
  accountId: string,
  source: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_events
     WHERE account_id = $1 AND source = $2 AND date BETWEEN $3 AND $4`,
    [accountId, source, dateFrom, dateTo],
  )
  return rowCount ?? 0
}

/**
 * Delete all cached events for a source (full nuke).
 */
export async function deleteCachedEventsBySource(
  accountId: string,
  source: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = $2`,
    [accountId, source],
  )
  return rowCount ?? 0
}

/**
 * Delete a single cached event by source ID (for write-through on delete).
 */
export async function deleteCachedEvent(
  accountId: string,
  source: string,
  sourceId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND source_id = $3`,
    [accountId, source, sourceId],
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/cache/events.test.ts --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cache/events.ts __tests__/lib/cache/events.test.ts
git commit -m "feat: add cached events data access layer with tests"
```

---

## Task 3: Sync State Data Access Layer

**Files:**
- Create: `lib/cache/syncState.ts`

- [ ] **Step 1: Implement sync state module**

Create `lib/cache/syncState.ts`:

```typescript
import { pool } from '@/lib/db'

export interface SyncState {
  accountId: string
  source: string
  connectionId: string
  syncCursor: string | null
  lastSyncAt: Date | null
  lastFullSyncAt: Date | null
  syncStatus: string
  errorMessage: string | null
}

/**
 * Get sync state for a specific source+connection.
 */
export async function getSyncState(
  accountId: string,
  source: string,
  connectionId = '',
): Promise<SyncState | null> {
  const { rows } = await pool.query<{
    account_id: string
    source: string
    connection_id: string
    sync_cursor: string | null
    last_sync_at: Date | null
    last_full_sync_at: Date | null
    sync_status: string
    error_message: string | null
  }>(
    `SELECT * FROM sync_state
     WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
    [accountId, source, connectionId],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    accountId: r.account_id,
    source: r.source,
    connectionId: r.connection_id,
    syncCursor: r.sync_cursor,
    lastSyncAt: r.last_sync_at,
    lastFullSyncAt: r.last_full_sync_at,
    syncStatus: r.sync_status,
    errorMessage: r.error_message,
  }
}

/**
 * Get all sync states for an account (for status display).
 */
export async function getAllSyncStates(accountId: string): Promise<SyncState[]> {
  const { rows } = await pool.query(
    `SELECT * FROM sync_state WHERE account_id = $1 ORDER BY source, connection_id`,
    [accountId],
  )
  return rows.map((r: any) => ({
    accountId: r.account_id,
    source: r.source,
    connectionId: r.connection_id,
    syncCursor: r.sync_cursor,
    lastSyncAt: r.last_sync_at,
    lastFullSyncAt: r.last_full_sync_at,
    syncStatus: r.sync_status,
    errorMessage: r.error_message,
  }))
}

/**
 * Upsert sync state after a sync run.
 */
export async function updateSyncState(
  accountId: string,
  source: string,
  connectionId: string,
  update: {
    syncCursor?: string | null
    syncStatus?: string
    errorMessage?: string | null
    isFullSync?: boolean
  },
): Promise<void> {
  const now = new Date()
  await pool.query(
    `INSERT INTO sync_state (account_id, source, connection_id, sync_cursor, last_sync_at, last_full_sync_at, sync_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (account_id, source, connection_id)
     DO UPDATE SET
       sync_cursor = COALESCE($4, sync_state.sync_cursor),
       last_sync_at = $5,
       last_full_sync_at = CASE WHEN $9 THEN $5 ELSE sync_state.last_full_sync_at END,
       sync_status = $7,
       error_message = $8`,
    [
      accountId,
      source,
      connectionId,
      update.syncCursor ?? null,
      now,
      update.isFullSync ? now : null,
      update.syncStatus ?? 'idle',
      update.errorMessage ?? null,
      update.isFullSync ?? false,
    ],
  )
}

/**
 * Reset sync state (clear cursor, forcing next sync to be a full sync).
 */
export async function resetSyncState(
  accountId: string,
  source: string,
  connectionId?: string,
): Promise<void> {
  if (connectionId !== undefined) {
    await pool.query(
      `DELETE FROM sync_state WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
      [accountId, source, connectionId],
    )
  } else {
    await pool.query(
      `DELETE FROM sync_state WHERE account_id = $1 AND source = $2`,
      [accountId, source],
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/cache/syncState.ts
git commit -m "feat: add sync state data access layer"
```

---

## Task 4: Add Incremental Fetch to ERP Client

**Files:**
- Modify: `lib/herbe/client.ts` (export `herbeParseJSON`, add `herbeFetchWithSequence`)

- [ ] **Step 1: Export herbeParseJSON**

In `lib/herbe/client.ts`, change the `herbeParseJSON` function from a private function to an exported one.

Find:
```typescript
async function herbeParseJSON(res: Response): Promise<unknown> {
```

Replace with:
```typescript
export async function herbeParseJSON(res: Response): Promise<unknown> {
```

- [ ] **Step 2: Add herbeFetchWithSequence function**

Add at the end of `lib/herbe/client.ts`, before the closing of the file:

```typescript
/**
 * Fetch records with sequence tracking. Used for incremental sync.
 * Returns all records plus the Sequence header from the last page.
 *
 * For incremental sync: pass `updates_after` in params.
 * For full sync: pass `sort` and `range` in params.
 */
export async function herbeFetchWithSequence(
  register: string,
  params: Record<string, string> = {},
  limit = 1000,
  conn?: ErpConnection
): Promise<{ records: unknown[]; sequence: string | null }> {
  const records: unknown[] = []
  let lastSequence: string | null = null
  let offset = 0

  while (true) {
    const query = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) }).toString()
    const res = await herbeFetch(register, query, undefined, conn)
    if (!res.ok) throw new Error(`Herbe ${register} fetch failed: ${res.status}`)

    const seq = res.headers.get('Sequence')
    if (seq) lastSequence = seq

    const json = await herbeParseJSON(res)
    const page = ((json as Record<string, unknown>)?.data?.[register as keyof unknown] ?? []) as unknown[]
    records.push(...page)

    if (page.length < limit) break
    offset += limit
  }

  return { records, sequence: lastSequence }
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `client.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/herbe/client.ts
git commit -m "feat: export herbeParseJSON, add herbeFetchWithSequence for incremental sync"
```

---

## Task 5: ERP Sync Engine

**Files:**
- Create: `lib/sync/erp.ts`
- Test: `__tests__/lib/sync/erp.test.ts`

- [ ] **Step 1: Write tests for the sync engine**

Create `__tests__/lib/sync/erp.test.ts`:

```typescript
import { buildCacheRows } from '@/lib/sync/erp'

describe('buildCacheRows', () => {
  it('creates one row per person from MainPersons', () => {
    const record = {
      SerNr: '100',
      TransDate: '2026-04-15',
      StartTime: '09:00',
      EndTime: '10:00',
      Comment: 'Meeting',
      MainPersons: 'EKS, JD',
      CCPersons: '',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '0',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', 'conn-name')
    expect(rows).toHaveLength(2)
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].sourceId).toBe('100')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].data.source).toBe('herbe')
    expect(rows[1].personCode).toBe('JD')
  })

  it('includes CC persons who are not in MainPersons', () => {
    const record = {
      SerNr: '101',
      TransDate: '2026-04-15',
      MainPersons: 'EKS',
      CCPersons: 'EKS, MK',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '0',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', '')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.personCode)).toEqual(['EKS', 'MK'])
  })

  it('skips tasks (TodoFlag != 0)', () => {
    const record = {
      SerNr: '102',
      TransDate: '2026-04-15',
      MainPersons: 'EKS',
      CCPersons: '',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '1',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', '')
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/sync/erp.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the ERP sync engine**

Create `lib/sync/erp.ts`:

```typescript
import { herbeFetchWithSequence } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { isCalendarRecord, mapHerbeRecord } from '@/lib/herbe/recordUtils'
import { getErpConnections } from '@/lib/accountConfig'
import { upsertCachedEvents, deleteCachedEventsBySource, type CachedEventRow } from '@/lib/cache/events'
import { getSyncState, updateSyncState } from '@/lib/cache/syncState'
import { pool } from '@/lib/db'

/**
 * Build cache rows from a raw ERP record.
 * Creates one row per MainPerson + one per CCPerson (if not already in Main).
 * Skips non-calendar records (tasks).
 * Exported for testing.
 */
export function buildCacheRows(
  record: Record<string, unknown>,
  accountId: string,
  connectionId: string,
  connectionName: string,
): CachedEventRow[] {
  const todoFlag = String(record['TodoFlag'] ?? '0')
  if (todoFlag !== '0' && todoFlag !== '') return []

  const main = String(record['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const cc = String(record['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const serNr = String(record['SerNr'] ?? '')
  const date = String(record['TransDate'] ?? '')

  const persons = new Set<string>()
  const rows: CachedEventRow[] = []

  for (const code of main) {
    if (persons.has(code)) continue
    persons.add(code)
    const activity = mapHerbeRecord(record, code, {
      includePrivateFields: true,
      erpConnectionId: connectionId,
      erpConnectionName: connectionName !== 'Default (env)' ? connectionName : undefined,
    })
    rows.push({
      source: 'herbe',
      sourceId: serNr,
      accountId,
      connectionId,
      personCode: code,
      date,
      data: activity as unknown as Record<string, unknown>,
    })
  }

  for (const code of cc) {
    if (persons.has(code)) continue
    persons.add(code)
    const activity = mapHerbeRecord(record, code, {
      includePrivateFields: true,
      erpConnectionId: connectionId,
      erpConnectionName: connectionName !== 'Default (env)' ? connectionName : undefined,
    })
    rows.push({
      source: 'herbe',
      sourceId: serNr,
      accountId,
      connectionId,
      personCode: code,
      date,
      data: activity as unknown as Record<string, unknown>,
    })
  }

  return rows
}

/**
 * Run incremental sync for one ERP connection.
 * Uses `updates_after` if we have a stored sequence, otherwise does a full fetch.
 */
async function syncConnection(
  accountId: string,
  conn: { id: string; name: string } & Record<string, unknown>,
): Promise<{ eventsUpserted: number; isFullSync: boolean }> {
  const state = await getSyncState(accountId, 'herbe', conn.id)
  const hasSequence = state?.syncCursor

  await updateSyncState(accountId, 'herbe', conn.id, { syncStatus: 'syncing' })

  try {
    let result: { records: unknown[]; sequence: string | null }

    if (hasSequence) {
      // Incremental: only records changed since last sequence
      result = await herbeFetchWithSequence(
        REGISTERS.activities,
        { updates_after: state.syncCursor! },
        1000,
        conn as any,
      )
    } else {
      // Full sync: fetch past 90 days + next 30 days
      const now = new Date()
      const from = new Date(now)
      from.setDate(from.getDate() - 90)
      const to = new Date(now)
      to.setDate(to.getDate() + 30)
      const dateFrom = from.toISOString().slice(0, 10)
      const dateTo = to.toISOString().slice(0, 10)

      result = await herbeFetchWithSequence(
        REGISTERS.activities,
        { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
        1000,
        conn as any,
      )
    }

    // Build cache rows from all returned records
    const allRows: CachedEventRow[] = []
    for (const record of result.records) {
      const rows = buildCacheRows(
        record as Record<string, unknown>,
        accountId,
        conn.id,
        conn.name as string,
      )
      allRows.push(...rows)
    }

    // Batch upsert (chunks of 500 to avoid query size limits)
    for (let i = 0; i < allRows.length; i += 500) {
      await upsertCachedEvents(allRows.slice(i, i + 500))
    }

    await updateSyncState(accountId, 'herbe', conn.id, {
      syncCursor: result.sequence,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: !hasSequence,
    })

    return { eventsUpserted: allRows.length, isFullSync: !hasSequence }
  } catch (e) {
    await updateSyncState(accountId, 'herbe', conn.id, {
      syncStatus: 'error',
      errorMessage: String(e).slice(0, 500),
    })
    throw e
  }
}

/**
 * Full reconciliation sync for one connection.
 * Fetches all records in range, replaces cache for that connection.
 * Used for daily cleanup to catch deletions.
 */
async function fullReconciliation(
  accountId: string,
  conn: { id: string; name: string } & Record<string, unknown>,
): Promise<{ eventsUpserted: number }> {
  await updateSyncState(accountId, 'herbe', conn.id, { syncStatus: 'syncing' })

  try {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - 90)
    const to = new Date(now)
    to.setDate(to.getDate() + 30)
    const dateFrom = from.toISOString().slice(0, 10)
    const dateTo = to.toISOString().slice(0, 10)

    const result = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn as any,
    )

    const allRows: CachedEventRow[] = []
    for (const record of result.records) {
      const rows = buildCacheRows(
        record as Record<string, unknown>,
        accountId,
        conn.id,
        conn.name as string,
      )
      allRows.push(...rows)
    }

    // Delete existing cache for this connection, then insert fresh data
    await pool.query(
      `DELETE FROM cached_events WHERE account_id = $1 AND source = 'herbe' AND connection_id = $2`,
      [accountId, conn.id],
    )

    for (let i = 0; i < allRows.length; i += 500) {
      await upsertCachedEvents(allRows.slice(i, i + 500))
    }

    await updateSyncState(accountId, 'herbe', conn.id, {
      syncCursor: result.sequence,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })

    return { eventsUpserted: allRows.length }
  } catch (e) {
    await updateSyncState(accountId, 'herbe', conn.id, {
      syncStatus: 'error',
      errorMessage: String(e).slice(0, 500),
    })
    throw e
  }
}

/**
 * Main sync entry point. Syncs all ERP connections for all accounts.
 * @param mode 'incremental' (default) or 'full' (daily reconciliation)
 */
export async function syncAllErp(
  mode: 'incremental' | 'full' = 'incremental',
): Promise<{ accounts: number; connections: number; events: number; errors: string[] }> {
  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )

  let totalConnections = 0
  let totalEvents = 0
  const errors: string[] = []

  for (const account of accounts) {
    let connections: any[] = []
    try {
      connections = await getErpConnections(account.id)
    } catch (e) {
      errors.push(`Account ${account.id}: ${String(e).slice(0, 200)}`)
      continue
    }

    for (const conn of connections) {
      try {
        const result = mode === 'full'
          ? await fullReconciliation(account.id, conn)
          : await syncConnection(account.id, conn)
        totalConnections++
        totalEvents += result.eventsUpserted
      } catch (e) {
        errors.push(`${account.id}/${conn.name}: ${String(e).slice(0, 200)}`)
      }
    }
  }

  return { accounts: accounts.length, connections: totalConnections, events: totalEvents, errors }
}

/**
 * Force sync a specific date range for an account.
 * Deletes cached events in that range, then fetches fresh from ERP.
 */
export async function forceSyncRange(
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ eventsUpserted: number }> {
  // Delete existing cache for this range
  await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = 'herbe' AND date BETWEEN $2 AND $3`,
    [accountId, dateFrom, dateTo],
  )

  const connections = await getErpConnections(accountId)
  let totalEvents = 0

  for (const conn of connections) {
    const result = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn as any,
    )

    const allRows: CachedEventRow[] = []
    for (const record of result.records) {
      allRows.push(...buildCacheRows(
        record as Record<string, unknown>,
        accountId,
        conn.id,
        conn.name,
      ))
    }

    for (let i = 0; i < allRows.length; i += 500) {
      await upsertCachedEvents(allRows.slice(i, i + 500))
    }

    // Update cursor from latest fetch
    if (result.sequence) {
      await updateSyncState(accountId, 'herbe', conn.id, {
        syncCursor: result.sequence,
        syncStatus: 'idle',
        errorMessage: null,
      })
    }

    totalEvents += allRows.length
  }

  return { eventsUpserted: totalEvents }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/sync/erp.test.ts --no-coverage`
Expected: All 3 tests PASS

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/sync/erp.ts __tests__/lib/sync/erp.test.ts
git commit -m "feat: ERP sync engine with incremental and full reconciliation modes"
```

---

## Task 6: Cron API Route

**Files:**
- Create: `app/api/sync/cron/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron handler**

Create `app/api/sync/cron/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { syncAllErp } from '@/lib/sync/erp'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verify request is from Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental'

  try {
    const result = await syncAllErp(mode)
    console.log(`[sync/cron] ${mode} sync complete:`, JSON.stringify(result))
    return NextResponse.json(result)
  } catch (e) {
    console.error('[sync/cron] sync failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create vercel.json with cron schedule**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync/cron",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/sync/cron?mode=full",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sync/cron/route.ts vercel.json
git commit -m "feat: add Vercel Cron routes for ERP sync (5-min incremental + daily full)"
```

---

## Task 7: Switch /api/activities GET to Read from Cache

**Files:**
- Modify: `app/api/activities/route.ts`

This is the critical switch: the GET handler reads ERP data from `cached_events` instead of calling `fetchErpActivities`. The POST handler remains unchanged (still writes to ERP).

- [ ] **Step 1: Modify the GET handler**

In `app/api/activities/route.ts`, replace the GET function. The key change: swap `fetchErpActivities(...)` for `getCachedEvents(...)`.

Find:
```typescript
  try {
    const personList = persons.split(',').map(p => p.trim())

    const allResults = await fetchErpActivities(
      session.accountId, personList, dateFrom, dateTo ?? dateFrom,
      { includePrivateFields: true }
    )

    // Track day_viewed (fire-and-forget)
    if (dateFrom && session.email) {
      trackEvent(session.accountId, session.email, 'day_viewed', { date: dateFrom }).catch(() => {})
    }

    return NextResponse.json(allResults, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
```

Replace with:
```typescript
  try {
    const personList = persons.split(',').map(p => p.trim())

    const allResults = await getCachedEvents(
      session.accountId, personList, dateFrom, dateTo ?? dateFrom,
    )

    // Track day_viewed (fire-and-forget)
    if (dateFrom && session.email) {
      trackEvent(session.accountId, session.email, 'day_viewed', { date: dateFrom }).catch(() => {})
    }

    return NextResponse.json(allResults, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
```

- [ ] **Step 2: Update the imports**

At the top of `app/api/activities/route.ts`, add the cache import and remove the unused ERP import.

Find:
```typescript
import { fetchErpActivities } from '@/lib/herbe/recordUtils'
```

Replace with:
```typescript
import { getCachedEvents } from '@/lib/cache/events'
```

Also remove `herbeFetch` from imports if it's only used in GET (check — it's also used in POST, so keep it). Remove `REGISTERS` only if unused after the change. The POST handler still uses `herbeFetch` and `REGISTERS`, so keep those imports.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/activities/route.ts
git commit -m "feat: /api/activities GET reads ERP data from cache instead of live API"
```

---

## Task 8: Write-Through on Create, Edit, Delete

**Files:**
- Modify: `app/api/activities/route.ts` (POST)
- Modify: `app/api/activities/[id]/route.ts` (PUT, DELETE)

When the user creates/edits/deletes an activity, we write to ERP (existing flow) and also update the cache so the UI reflects changes immediately.

- [ ] **Step 1: Add write-through to POST (create)**

In `app/api/activities/route.ts`, after the successful POST to ERP returns the created record, upsert it into the cache. Add this import at the top:

```typescript
import { upsertCachedEvents } from '@/lib/cache/events'
import { buildCacheRows } from '@/lib/sync/erp'
```

Then, right after `trackEvent(...)` in the POST handler and before `return NextResponse.json(created, { status: 201 })`, add:

```typescript
    // Write-through: cache the new activity
    try {
      const connectionId = conn?.id ?? ''
      const connectionName = conn?.name ?? ''
      const cacheRows = buildCacheRows(
        created as Record<string, unknown>,
        postSession.accountId,
        connectionId,
        connectionName,
      )
      if (cacheRows.length > 0) {
        upsertCachedEvents(cacheRows).catch(e =>
          console.warn('[activities/POST] cache write-through failed:', e)
        )
      }
    } catch (e) {
      console.warn('[activities/POST] cache write-through error:', e)
    }
```

- [ ] **Step 2: Add write-through to PUT (edit)**

In `app/api/activities/[id]/route.ts`, add these imports at the top:

```typescript
import { upsertCachedEvents, deleteCachedEvent } from '@/lib/cache/events'
import { buildCacheRows } from '@/lib/sync/erp'
```

In the PUT handler, after `trackEvent(...)` and before `return NextResponse.json(data ?? {}, { status: 200 })`, add:

```typescript
    // Write-through: update cache with the edited activity
    try {
      // Delete old cache entries (person assignments may have changed)
      await deleteCachedEvent(session.accountId, 'herbe', id)
      // Re-fetch the updated record to get full field set
      const updated = await fetchActivity(id, conn)
      if (updated) {
        const cacheRows = buildCacheRows(
          updated,
          session.accountId,
          conn?.id ?? '',
          conn?.name ?? '',
        )
        if (cacheRows.length > 0) {
          upsertCachedEvents(cacheRows).catch(e =>
            console.warn('[activities/PUT] cache write-through failed:', e)
          )
        }
      }
    } catch (e) {
      console.warn('[activities/PUT] cache write-through error:', e)
    }
```

- [ ] **Step 3: Add write-through to DELETE**

In the DELETE handler in `app/api/activities/[id]/route.ts`, after `trackEvent(...)` and before `return new NextResponse(null, { status: 204 })`, add:

```typescript
    // Write-through: remove from cache
    deleteCachedEvent(session.accountId, 'herbe', id).catch(e =>
      console.warn('[activities/DELETE] cache write-through failed:', e)
    )
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/api/activities/route.ts app/api/activities/[id]/route.ts
git commit -m "feat: write-through to cache on activity create, edit, and delete"
```

---

## Task 9: Force Sync and Cache Nuke API Routes

**Files:**
- Create: `app/api/sync/force/route.ts`
- Create: `app/api/sync/nuke/route.ts`
- Create: `app/api/sync/status/route.ts`

- [ ] **Step 1: Create force sync route**

Create `app/api/sync/force/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { forceSyncRange } from '@/lib/sync/erp'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const { dateFrom, dateTo } = body as { dateFrom?: string; dateTo?: string }

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  try {
    const result = await forceSyncRange(session.accountId, dateFrom, dateTo)
    return NextResponse.json({ synced: true, ...result })
  } catch (e) {
    console.error('[sync/force] failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create cache nuke route**

Create `app/api/sync/nuke/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { deleteCachedEvents, deleteCachedEventsBySource } from '@/lib/cache/events'
import { resetSyncState } from '@/lib/cache/syncState'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const body = await req.json().catch(() => ({}))
  const { dateFrom, dateTo, all } = body as { dateFrom?: string; dateTo?: string; all?: boolean }

  try {
    let deleted: number

    if (all) {
      deleted = await deleteCachedEventsBySource(session.accountId, 'herbe')
      await resetSyncState(session.accountId, 'herbe')
    } else if (dateFrom && dateTo) {
      deleted = await deleteCachedEvents(session.accountId, 'herbe', dateFrom, dateTo)
    } else {
      return NextResponse.json({ error: 'Provide dateFrom+dateTo or all=true' }, { status: 400 })
    }

    return NextResponse.json({ cleared: true, eventsDeleted: deleted })
  } catch (e) {
    console.error('[sync/nuke] failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create sync status route**

Create `app/api/sync/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAllSyncStates } from '@/lib/cache/syncState'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const states = await getAllSyncStates(session.accountId)
    return NextResponse.json(states)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/api/sync/force/route.ts app/api/sync/nuke/route.ts app/api/sync/status/route.ts
git commit -m "feat: add force sync, cache nuke, and sync status API routes"
```

---

## Task 10: Update Share Endpoint to Read from Cache

**Files:**
- Modify: `app/api/share/[token]/activities/route.ts`

The share endpoint currently calls `fetchErpActivities` directly. Switch it to read from cache, matching what we did in Task 7.

- [ ] **Step 1: Replace ERP fetch with cache read**

In `app/api/share/[token]/activities/route.ts`, add the import:

```typescript
import { getCachedEvents } from '@/lib/cache/events'
```

Find the ERP fetch block (around line 126-129):

```typescript
  if (!hiddenCalendarsSet.has('herbe')) {
    const erpActivities = await fetchErpActivities(accountId, personCodes, dateFrom, cappedDateTo)
    allActivities.push(...erpActivities)
  }
```

Replace with:

```typescript
  if (!hiddenCalendarsSet.has('herbe')) {
    const erpActivities = await getCachedEvents(accountId, personCodes, dateFrom, cappedDateTo)
    allActivities.push(...erpActivities)
  }
```

- [ ] **Step 2: Clean up unused import**

Remove `fetchErpActivities` from the imports at the top of the file:

Find:
```typescript
import { fetchErpActivities } from '@/lib/herbe/recordUtils'
```

Remove this line entirely.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/share/[token]/activities/route.ts
git commit -m "feat: share endpoint reads ERP data from cache"
```

---

## Task 11: Cache Management UI in Settings

**Files:**
- Modify: `components/SettingsModal.tsx`

Add a "Cache" tab to the existing settings modal with date-range reset and full nuke controls.

- [ ] **Step 1: Add 'cache' to the Tab type and tab bar**

In `components/SettingsModal.tsx`, find the Tab type:

```typescript
type Tab = 'style' | 'colors' | 'integrations' | 'templates'
```

Replace with:

```typescript
type Tab = 'style' | 'colors' | 'integrations' | 'templates' | 'cache'
```

Then find the tab bar rendering (search for the tabs array or tab buttons — they're rendered as buttons with `activeTab` checks). Add a "Cache" tab button after the existing ones, following the same pattern.

- [ ] **Step 2: Add cache tab state**

Inside the component, add state for the cache management form:

```typescript
const [cacheDateFrom, setCacheDateFrom] = useState('')
const [cacheDateTo, setCacheDateTo] = useState('')
const [cacheNukeAll, setCacheNukeAll] = useState(false)
const [cacheLoading, setCacheLoading] = useState(false)
const [cacheMessage, setCacheMessage] = useState<string | null>(null)
```

- [ ] **Step 3: Add cache management handlers**

```typescript
async function handleForceSync() {
  if (!cacheDateFrom || !cacheDateTo) return
  setCacheLoading(true)
  setCacheMessage(null)
  try {
    const res = await fetch('/api/sync/force', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom: cacheDateFrom, dateTo: cacheDateTo }),
    })
    const data = await res.json()
    if (res.ok) {
      setCacheMessage(`Cache refreshed: ${data.eventsUpserted} events synced`)
    } else {
      setCacheMessage(`Error: ${data.error}`)
    }
  } catch (e) {
    setCacheMessage(`Error: ${String(e)}`)
  } finally {
    setCacheLoading(false)
  }
}

async function handleNukeCache() {
  setCacheLoading(true)
  setCacheMessage(null)
  try {
    const body = cacheNukeAll
      ? { all: true }
      : { dateFrom: cacheDateFrom, dateTo: cacheDateTo }

    if (!cacheNukeAll && (!cacheDateFrom || !cacheDateTo)) {
      setCacheMessage('Enter a date range or check "Clear all"')
      setCacheLoading(false)
      return
    }

    const res = await fetch('/api/sync/nuke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) {
      setCacheMessage(`Cache cleared: ${data.eventsDeleted} events removed`)
      setCacheNukeAll(false)
    } else {
      setCacheMessage(`Error: ${data.error}`)
    }
  } catch (e) {
    setCacheMessage(`Error: ${String(e)}`)
  } finally {
    setCacheLoading(false)
  }
}
```

- [ ] **Step 4: Add cache tab content**

In the tab content rendering section (where other tabs like `activeTab === 'style'` are handled), add:

```tsx
{activeTab === 'cache' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
      ERP data is synced automatically every 5 minutes. Use these tools if you need to refresh manually.
    </p>

    <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        From
        <input type="date" value={cacheDateFrom} onChange={e => setCacheDateFrom(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        To
        <input type="date" value={cacheDateTo} onChange={e => setCacheDateTo(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }} />
      </label>
      <button onClick={handleForceSync} disabled={cacheLoading || !cacheDateFrom || !cacheDateTo}
        style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--brand)', color: '#fff', fontSize: 13, cursor: 'pointer', opacity: cacheLoading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
        {cacheLoading ? 'Syncing...' : 'Re-sync range'}
      </button>
    </div>

    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
        Clear cached data
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
        Removes cached ERP data. The next automatic sync will re-populate it.
        Use the date range above to clear a specific period, or check below to clear everything.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={cacheNukeAll} onChange={e => setCacheNukeAll(e.target.checked)} />
        Clear ALL cached data (ignores date range)
      </label>
      <button onClick={() => showConfirm(
        cacheNukeAll
          ? 'This will delete ALL cached ERP data. The next sync cycle will re-populate it. Continue?'
          : `This will delete cached ERP data from ${cacheDateFrom} to ${cacheDateTo}. Continue?`,
        handleNukeCache,
        { confirmLabel: 'Clear cache', destructive: true }
      )} disabled={cacheLoading || (!cacheNukeAll && (!cacheDateFrom || !cacheDateTo))}
        style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--error, #e53935)', background: 'transparent', color: 'var(--error, #e53935)', fontSize: 13, cursor: 'pointer', opacity: cacheLoading ? 0.6 : 1, alignSelf: 'flex-start' }}>
        Clear cache
      </button>
    </div>

    {cacheMessage && (
      <p style={{ fontSize: 13, color: cacheMessage.startsWith('Error') ? 'var(--error, #e53935)' : 'var(--text-secondary)' }}>
        {cacheMessage}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/SettingsModal.tsx
git commit -m "feat: add Cache tab to settings with date-range re-sync and full nuke"
```

---

## Task 12: Set CRON_SECRET Environment Variable

**Files:** None (Vercel dashboard + `.env.local`)

- [ ] **Step 1: Generate a cron secret**

Run: `openssl rand -hex 32`

Copy the output.

- [ ] **Step 2: Add to Vercel**

Run: `vercel env add CRON_SECRET` and paste the generated secret for Production and Preview environments.

- [ ] **Step 3: Add to local .env.local**

Add the same value to `.env.local`:
```
CRON_SECRET=<the-generated-value>
```

- [ ] **Step 4: Verify env is available**

Run: `vercel env pull .env.local` to sync.

---

## Task 13: Initial Cache Population and End-to-End Test

This task verifies the full flow works end-to-end before merging.

- [ ] **Step 1: Run migration on production/preview database**

Run: `psql "$DATABASE_URL" -f db/migrations/22_create_cache_tables.sql`

- [ ] **Step 2: Trigger initial full sync manually**

Run locally (or via curl):
```bash
curl -X GET "http://localhost:3000/api/sync/cron?mode=full" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: JSON response with `accounts`, `connections`, `events` counts. Events > 0.

- [ ] **Step 3: Verify cache has data**

Run: `psql "$DATABASE_URL" -c "SELECT source, count(*) FROM cached_events GROUP BY source;"`
Expected: `herbe | <number>` rows

- [ ] **Step 4: Verify /api/activities returns cached data**

Open the app in browser, navigate the calendar. Activities should load from cache (check Network tab — `/api/activities` should return data, response time should be fast ~50ms vs previous ~500ms+).

- [ ] **Step 5: Test write-through — create an activity**

Create a new activity in the app. Verify:
1. It appears immediately in the calendar
2. It exists in `cached_events`: `psql "$DATABASE_URL" -c "SELECT source_id, date FROM cached_events WHERE source = 'herbe' ORDER BY cached_at DESC LIMIT 5;"`

- [ ] **Step 6: Test write-through — edit and delete**

Edit an activity, verify the change appears immediately. Delete an activity, verify it disappears immediately.

- [ ] **Step 7: Test incremental sync**

Create an activity directly in ERP (not through the app). Wait 5 minutes (or trigger cron manually). Verify it appears in the calendar.

- [ ] **Step 8: Test force sync from settings**

Open Settings > Cache > enter today's date range > click "Re-sync range". Verify the success message and that data refreshes.

- [ ] **Step 9: Test cache nuke from settings**

Open Settings > Cache > check "Clear ALL cached data" > click "Clear cache" > confirm. Verify the success message. Wait for next cron cycle (or trigger manually) to verify data repopulates.

- [ ] **Step 10: Run all tests**

Run: `npm test`
Expected: All tests pass including new cache and sync tests.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat: complete ERP cache layer — Phase 1"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-16-erp-cache-layer.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?