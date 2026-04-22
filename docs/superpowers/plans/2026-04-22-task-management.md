# Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-source task sidebar (ERP, Microsoft To Do, Google Tasks) to `/cal`, integrated into the existing right-panel toggle as the third option (Day / Agenda / Tasks).

**Architecture:** Task state lives in `CalendarShell` alongside event state. A single aggregator API (`GET /api/tasks`) fans out to three server-side source fetchers, each failure-tolerant with DB-backed cache fallback. Per-source mutation routes wrap the vendor APIs. The existing `ActivityForm` is reused in a slim task mode for create/edit/copy. Responsive: desktop opens Tasks in a right pane; mobile swaps the main area.

**Tech stack:** Next.js 16 App Router, TypeScript, Postgres (Neon) via `pg.Pool`, Jest 29 with ts-jest, React Testing Library, Microsoft Graph v1.0 (application permissions with `.default` scope via `lib/graph/client.ts`), Google APIs (`googleapis` npm) via per-user OAuth.

**Spec:** `docs/superpowers/specs/2026-04-22-task-management-design.md`.

---

## Important cross-cutting notes

- **Microsoft Graph auth model** — existing `lib/graph/client.ts` uses **client credentials** (app permissions) with `scope='.default'`. For Tasks, the app needs `Tasks.ReadWrite.All` **Application permission** in Azure AD (admin consent), and endpoints use `/users/{userEmail}/todo/lists` rather than `/me/todo/lists`. The Graph scope constant does not change — we rely on `.default` + the registration adding the new application permission.
- **Google Tasks auth model** — uses per-user OAuth via `lib/google/userOAuth.ts`. Requires adding `https://www.googleapis.com/auth/tasks` to the client's scope list. Tokens are re-consented on next login; existing tokens without the scope are detected at read time and the source is reported as "not configured".
- **Test command** is `npm test`. Use `npm test -- <pattern>` to run a subset. All tests use jsdom (`jest.config.ts` defaults) and mock `@/lib/db`.
- **ERP completion semantics** — see spec §"ERP semantics". A task has `TodoFlag='1'`; `done` is `OKFlag==='1'`. Toggling done mutates `OKFlag` only.
- **Aggregator failure tolerance** — `GET /api/tasks` MUST return 200 even when one or more sources error, with per-source error info in the body. The UI surfaces per-source stale/error states.
- **Commit granularity** — one commit per task step sequence. Conventional commit prefixes already used in repo: `feat`, `fix`, `docs`, `refactor`, `test`.

---

## File structure

### New files

**Types and shared utilities**
- `types/task.ts` — `TaskSource` union and `Task` interface (entity shape consumed by UI and API).

**Database**
- `db/migrations/25_create_task_cache.sql` — `cached_tasks` table.

**Cache**
- `lib/cache/tasks.ts` — `getCachedTasks`, `upsertCachedTasks`, `deleteCachedTasksForSource`.

**Source fetchers / mutators**
- `lib/herbe/taskRecordUtils.ts` — ERP task fetcher + mapper + mutation helpers. Mirrors `lib/herbe/recordUtils.ts` patterns.
- `lib/outlook/tasks.ts` — Microsoft To Do fetcher + create/update.
- `lib/google/tasks.ts` — Google Tasks fetcher + create/update.

**API routes**
- `app/api/tasks/route.ts` — `GET` aggregator.
- `app/api/tasks/[source]/route.ts` — `POST` create.
- `app/api/tasks/[source]/[id]/route.ts` — `PATCH` edit / toggle done.

**UI components**
- `components/TaskRow.tsx` — single task row.
- `components/TasksList.tsx` — list renderer for a tab.
- `components/TasksSidebar.tsx` — top-level sidebar with tabs.

**Tests**
- `__tests__/lib/cache/tasks.test.ts`
- `__tests__/lib/herbe/taskRecordUtils.test.ts`
- `__tests__/lib/outlook/tasks.test.ts`
- `__tests__/lib/google/tasks.test.ts`
- `__tests__/api/tasks/route.test.ts`
- `__tests__/api/tasks/source-id/route.test.ts` (filename cannot use brackets; maps to `app/api/tasks/[source]/[id]/route.ts`)
- `__tests__/api/tasks/source-create/route.test.ts` (maps to `app/api/tasks/[source]/route.ts`)
- `__tests__/components/TaskRow.test.tsx`
- `__tests__/components/TasksSidebar.test.tsx`

### Modified files

- `lib/google/client.ts` — add `auth/tasks` to OAuth scope list.
- `components/ActivityForm.tsx` — add a `mode?: 'event' | 'task'` prop that hides event-only fields.
- `components/MonthView.tsx` — extend `rightSide` union to include `'tasks'`; add Tasks button to segmented control; render `<TasksSidebar>` when active; rename "1D" label to "Day".
- `components/CalendarShell.tsx` — own `tasks`, `taskSources`, `taskErrors`, `rightPanel` state; fetch from `/api/tasks`; wire handlers; responsive α/β rendering.
- `components/CalendarGrid.tsx` — if the accidental 1D/Agenda toggle shows here too, extend it with Tasks; otherwise (single source of truth in CalendarShell) no change.

### No-change files (referenced by the plan)
- `lib/herbe/recordUtils.ts` — read-only reference for the fetcher pattern.
- `lib/herbe/client.ts` — existing `herbeFetch` / `herbeFetchAll` used to issue ERP calls.
- `lib/herbe/auth-guard.ts` — `requireSession` + `unauthorized` used by every API route.
- `lib/graph/client.ts` — `graphFetch` used for Microsoft calls.
- `lib/cache/events.ts` — template for `lib/cache/tasks.ts`.

---

## Task 1: Task type

**Files:**
- Create: `types/task.ts`

- [ ] **Step 1: Create the Task type**

Create `types/task.ts`:

```ts
export type TaskSource = 'herbe' | 'outlook' | 'google'

export interface Task {
  /** Source-prefixed id, e.g. "herbe:12345", "outlook:AAMkAG...", "google:xyz" */
  id: string
  source: TaskSource
  /** ERP connection id (accounts can have multiple). Empty string for Outlook/Google. */
  sourceConnectionId: string
  title: string
  description?: string
  /** YYYY-MM-DD, omitted when no due date set */
  dueDate?: string
  done: boolean
  /** Outlook: list display name; Google: list title; ERP: project or customer label */
  listName?: string
  /** ERP-only metadata used for the copy-to-event pre-fill and row meta line */
  erp?: {
    activityTypeCode?: string
    projectCode?: string
    projectName?: string
    customerCode?: string
    customerName?: string
    textInMatrix?: string
  }
  /** Deep link for "Open in source" menu action */
  sourceUrl?: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. If `tsconfig.json` path aliases miss `types/task.ts`, no action needed — `@/types/task` resolves via existing baseUrl config.

- [ ] **Step 3: Commit**

```bash
git add types/task.ts
git commit -m "feat(tasks): add unified Task type"
```

---

## Task 2: Cache migration

**Files:**
- Create: `db/migrations/25_create_task_cache.sql`

- [ ] **Step 1: Create the migration**

Create `db/migrations/25_create_task_cache.sql`:

```sql
-- Task cache for multi-source task feature. Stale fallback when a
-- source (ERP / Microsoft Graph / Google Tasks) fails during live fetch.

CREATE TABLE IF NOT EXISTS cached_tasks (
  account_id     UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email     TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('herbe', 'outlook', 'google')),
  connection_id  TEXT NOT NULL DEFAULT '',
  task_id        TEXT NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_email, source, connection_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_cached_tasks_lookup
  ON cached_tasks (account_id, user_email, source);
```

- [ ] **Step 2: Apply the migration to the local dev DB**

Run the existing migration runner (check `scripts/` or package.json for migration command; otherwise execute with psql):
```bash
psql "$DATABASE_URL" -f db/migrations/25_create_task_cache.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Verify schema**

```bash
psql "$DATABASE_URL" -c "\d cached_tasks"
```
Expected: five columns plus primary key + `idx_cached_tasks_lookup` index.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/25_create_task_cache.sql
git commit -m "feat(tasks): add cached_tasks migration"
```

---

## Task 3: Cache module

**Files:**
- Create: `lib/cache/tasks.ts`
- Test: `__tests__/lib/cache/tasks.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/cache/tasks.test.ts`:

```ts
import {
  getCachedTasks,
  upsertCachedTasks,
  deleteCachedTasksForSource,
  type CachedTaskRow,
} from '@/lib/cache/tasks'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('getCachedTasks', () => {
  it('queries by account, user email, and source', async () => {
    mockQuery.mockResolvedValue({ rows: [{ payload: { id: 'herbe:1', source: 'herbe', title: 't' } }] })
    const result = await getCachedTasks('acc-1', 'u@x.com', 'herbe')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('cached_tasks')
    expect(params).toEqual(['acc-1', 'u@x.com', 'herbe'])
    expect(result).toEqual([{ id: 'herbe:1', source: 'herbe', title: 't' }])
  })
})

describe('upsertCachedTasks', () => {
  it('does nothing for empty array', async () => {
    await upsertCachedTasks([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('builds multi-row upsert', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 })
    const rows: CachedTaskRow[] = [
      { accountId: 'a', userEmail: 'u@x.com', source: 'herbe', connectionId: 'c1', taskId: '1', payload: { id: 'herbe:1' } },
      { accountId: 'a', userEmail: 'u@x.com', source: 'outlook', connectionId: '', taskId: '2', payload: { id: 'outlook:2' } },
    ]
    await upsertCachedTasks(rows)
    const [sql] = mockQuery.mock.calls[0]
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('DO UPDATE')
  })
})

describe('deleteCachedTasksForSource', () => {
  it('deletes all rows for an account+user+source', async () => {
    mockQuery.mockResolvedValue({ rowCount: 7 })
    const count = await deleteCachedTasksForSource('acc-1', 'u@x.com', 'herbe')
    expect(count).toBe(7)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('DELETE')
    expect(params).toEqual(['acc-1', 'u@x.com', 'herbe'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cache/tasks`
Expected: FAIL — module `@/lib/cache/tasks` does not exist.

- [ ] **Step 3: Implement the cache module**

Create `lib/cache/tasks.ts`:

```ts
import { pool } from '@/lib/db'
import type { Task, TaskSource } from '@/types/task'

export interface CachedTaskRow {
  accountId: string
  userEmail: string
  source: TaskSource
  connectionId: string
  taskId: string
  payload: Record<string, unknown>
}

/**
 * Read cached tasks for a given (account, user, source).
 * Returns the raw `Task` shape.
 */
export async function getCachedTasks(
  accountId: string,
  userEmail: string,
  source: TaskSource,
): Promise<Task[]> {
  const { rows } = await pool.query<{ payload: Task }>(
    `SELECT payload FROM cached_tasks
     WHERE account_id = $1 AND user_email = $2 AND source = $3`,
    [accountId, userEmail, source],
  )
  return rows.map(r => r.payload)
}

/**
 * Upsert cached task rows. Primary key is
 * (account_id, user_email, source, connection_id, task_id).
 */
export async function upsertCachedTasks(
  rows: CachedTaskRow[],
  queryable: { query: (...args: any[]) => Promise<any> } = pool,
): Promise<void> {
  if (rows.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let idx = 1
  for (const r of rows) {
    placeholders.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, now())`,
    )
    values.push(r.accountId, r.userEmail, r.source, r.connectionId, r.taskId, JSON.stringify(r.payload))
    idx += 6
  }
  await queryable.query(
    `INSERT INTO cached_tasks (account_id, user_email, source, connection_id, task_id, payload, fetched_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (account_id, user_email, source, connection_id, task_id)
     DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
    values,
  )
}

/**
 * Delete all cached rows for an account+user+source. Used when a live
 * fetch succeeds so orphaned rows (task deleted in source) disappear.
 */
export async function deleteCachedTasksForSource(
  accountId: string,
  userEmail: string,
  source: TaskSource,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_tasks
     WHERE account_id = $1 AND user_email = $2 AND source = $3`,
    [accountId, userEmail, source],
  )
  return rowCount ?? 0
}

/**
 * Write-through: atomically replace an entire source's cache for a user.
 * Runs inside a transaction to avoid an inconsistent window.
 */
export async function replaceCachedTasksForSource(
  accountId: string,
  userEmail: string,
  source: TaskSource,
  rows: CachedTaskRow[],
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM cached_tasks WHERE account_id = $1 AND user_email = $2 AND source = $3`,
      [accountId, userEmail, source],
    )
    await upsertCachedTasks(rows, client)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cache/tasks`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cache/tasks.ts __tests__/lib/cache/tasks.test.ts
git commit -m "feat(tasks): add cached_tasks cache module"
```

---

## Task 4: ERP task fetcher and mappers

**Files:**
- Create: `lib/herbe/taskRecordUtils.ts`
- Test: `__tests__/lib/herbe/taskRecordUtils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/herbe/taskRecordUtils.test.ts`:

```ts
import { mapHerbeTask, isTaskRecord } from '@/lib/herbe/taskRecordUtils'

describe('isTaskRecord', () => {
  it('returns true for TodoFlag=1', () => {
    expect(isTaskRecord({ TodoFlag: '1' })).toBe(true)
  })
  it('returns false for TodoFlag=0 (calendar entry)', () => {
    expect(isTaskRecord({ TodoFlag: '0' })).toBe(false)
  })
  it('returns false for empty TodoFlag', () => {
    expect(isTaskRecord({ TodoFlag: '' })).toBe(false)
  })
  it('returns false for undefined TodoFlag', () => {
    expect(isTaskRecord({})).toBe(false)
  })
})

describe('mapHerbeTask', () => {
  const baseRecord = {
    SerNr: '12345',
    Comment: 'Review prototype',
    TransDate: '2026-04-25',
    ActType: 'CALL',
    PRName: 'Burti Product',
    PRCode: 'P001',
    CUName: 'Burti',
    CUCode: 'C001',
    MainPersons: 'EKS',
    TodoFlag: '1',
    OKFlag: '0',
  }

  it('maps TodoFlag=1, OKFlag=0 to an open task', () => {
    const task = mapHerbeTask(baseRecord, 'EKS', 'conn-1', 'Burti ERP')
    expect(task).toMatchObject({
      id: 'herbe:12345',
      source: 'herbe',
      sourceConnectionId: 'conn-1',
      title: 'Review prototype',
      dueDate: '2026-04-25',
      done: false,
      listName: 'Burti Product',
    })
    expect(task.erp?.activityTypeCode).toBe('CALL')
    expect(task.erp?.projectCode).toBe('P001')
  })

  it('maps OKFlag=1 to done=true', () => {
    const task = mapHerbeTask({ ...baseRecord, OKFlag: '1' }, 'EKS', 'conn-1', 'x')
    expect(task.done).toBe(true)
  })

  it('uses customer name when project name is absent', () => {
    const task = mapHerbeTask({ ...baseRecord, PRName: '', CUName: 'Acme' }, 'EKS', 'conn-1', 'x')
    expect(task.listName).toBe('Acme')
  })

  it('omits dueDate when TransDate is empty', () => {
    const task = mapHerbeTask({ ...baseRecord, TransDate: '' }, 'EKS', 'conn-1', 'x')
    expect(task.dueDate).toBeUndefined()
  })
})

describe('regression: calendar/task filter independence', () => {
  it('TodoFlag=0 must NOT be classified as task', () => {
    expect(isTaskRecord({ TodoFlag: '0', OKFlag: '1' })).toBe(false)
  })
  it('TodoFlag=1, OKFlag=1 is a DONE task (not a calendar entry)', () => {
    expect(isTaskRecord({ TodoFlag: '1', OKFlag: '1' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- taskRecordUtils`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the fetcher**

Create `lib/herbe/taskRecordUtils.ts`:

```ts
import { herbeFetchAll } from './client'
import { REGISTERS } from './constants'
import { getErpConnections } from '@/lib/accountConfig'
import { parsePersons } from './recordUtils'
import type { ErpConnection } from '@/lib/accountConfig'
import type { Task } from '@/types/task'

/** Returns true if a Herbe record is a task (TodoFlag='1'). */
export function isTaskRecord(r: Record<string, unknown>): boolean {
  return String(r['TodoFlag'] ?? '') === '1'
}

/** Map a Herbe task record to the unified Task shape. */
export function mapHerbeTask(
  r: Record<string, unknown>,
  personCode: string,
  connectionId: string,
  connectionName: string,
): Task {
  const sernr = String(r['SerNr'] ?? '')
  const transDate = String(r['TransDate'] ?? '')
  const prName = String(r['PRName'] ?? '')
  const cuName = String(r['CUName'] ?? '')
  const rows = r['rows'] as Record<string, unknown>[] | undefined
  let textValue = String(r['Text'] ?? '')
  if (!textValue && rows && rows.length > 0) {
    textValue = rows.map(row => String(row['Text'] ?? '')).filter(Boolean).join('\n')
  }

  const task: Task = {
    id: `herbe:${sernr}`,
    source: 'herbe',
    sourceConnectionId: connectionId,
    title: String(r['Comment'] ?? ''),
    description: undefined,
    dueDate: transDate || undefined,
    done: String(r['OKFlag'] ?? '0') === '1',
    listName: prName || cuName || undefined,
    erp: {
      activityTypeCode: String(r['ActType'] ?? '') || undefined,
      projectCode: String(r['PRCode'] ?? '') || undefined,
      projectName: prName || undefined,
      customerCode: String(r['CUCode'] ?? '') || undefined,
      customerName: cuName || undefined,
      textInMatrix: textValue || undefined,
    },
  }
  // Silence unused-var for connectionName (we keep it in the signature for symmetry with mapHerbeRecord).
  void personCode
  void connectionName
  return task
}

/** Fetch ERP tasks for the signed-in user across all ERP connections. */
export async function fetchErpTasks(
  accountId: string,
  personCodes: string[],
): Promise<{ tasks: Task[]; errors: { connection: string; msg: string }[] }> {
  const result: { tasks: Task[]; errors: { connection: string; msg: string }[] } = {
    tasks: [],
    errors: [],
  }

  let connections: ErpConnection[] = []
  try {
    connections = await getErpConnections(accountId)
  } catch (e) {
    result.errors.push({ connection: '(all)', msg: String(e) })
    return result
  }

  const perConn = await Promise.all(connections.map(async conn => {
    try {
      const tasks = await fetchErpTasksForConnection(conn, personCodes)
      return { tasks, error: null }
    } catch (e) {
      return { tasks: [] as Task[], error: { connection: conn.name, msg: String(e) } }
    }
  }))
  for (const r of perConn) {
    result.tasks.push(...r.tasks)
    if (r.error) result.errors.push(r.error)
  }
  return result
}

async function fetchErpTasksForConnection(conn: ErpConnection, personCodes: string[]): Promise<Task[]> {
  const personSet = new Set(personCodes)
  const today = new Date()
  const from = new Date(today); from.setFullYear(from.getFullYear() - 2)
  const to = new Date(today); to.setFullYear(to.getFullYear() + 2)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const raw = await herbeFetchAll(REGISTERS.activities, {
    sort: 'TransDate',
    range: `${fmt(from)}:${fmt(to)}`,
  }, 100, conn)

  const tasks: Task[] = []
  for (const record of raw) {
    const r = record as Record<string, unknown>
    if (!isTaskRecord(r)) continue
    const { main, cc } = parsePersons(r)
    const mainSet = new Set(main)
    const allPersons = [...main, ...cc.filter(p => !mainSet.has(p))]
    for (const p of allPersons) {
      if (personSet.has(p)) {
        tasks.push(mapHerbeTask(r, p, conn.id, conn.name))
        break // one task per record, not per person
      }
    }
  }
  return tasks
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- taskRecordUtils`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/herbe/taskRecordUtils.ts __tests__/lib/herbe/taskRecordUtils.test.ts
git commit -m "feat(tasks): add ERP task fetcher with regression tests"
```

---

## Task 5: ERP task mutation helpers

**Files:**
- Modify: `lib/herbe/taskRecordUtils.ts`
- Modify: `__tests__/lib/herbe/taskRecordUtils.test.ts`

Rationale: keep mutation code next to its fetcher to make the "write back via OKFlag" invariant obvious to the reader.

- [ ] **Step 1: Add failing tests for the mutation helpers**

Append to `__tests__/lib/herbe/taskRecordUtils.test.ts`:

```ts
import { buildCompleteTaskBody, buildCreateTaskBody, buildEditTaskBody } from '@/lib/herbe/taskRecordUtils'

describe('buildCompleteTaskBody', () => {
  it('encodes OKFlag=1 for done=true', () => {
    expect(buildCompleteTaskBody(true)).toEqual({ OKFlag: '1' })
  })
  it('encodes OKFlag=0 for done=false', () => {
    expect(buildCompleteTaskBody(false)).toEqual({ OKFlag: '0' })
  })
})

describe('buildCreateTaskBody', () => {
  it('always sets TodoFlag=1 on new tasks', () => {
    const body = buildCreateTaskBody({
      title: 'Do the thing',
      personCode: 'EKS',
      dueDate: '2026-05-01',
    })
    expect(body.TodoFlag).toBe('1')
    expect(body.Comment).toBe('Do the thing')
    expect(body.MainPersons).toBe('EKS')
    expect(body.TransDate).toBe('2026-05-01')
  })
})

describe('buildEditTaskBody', () => {
  it('passes only the fields provided', () => {
    expect(buildEditTaskBody({ title: 'New' })).toEqual({ Comment: 'New' })
    expect(buildEditTaskBody({ dueDate: '2026-05-05' })).toEqual({ TransDate: '2026-05-05' })
    expect(buildEditTaskBody({ description: 'Notes' })).toEqual({ Text: 'Notes' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- taskRecordUtils`
Expected: the three new `describe` blocks FAIL — helpers not exported.

- [ ] **Step 3: Add the mutation helpers**

Append to `lib/herbe/taskRecordUtils.ts`:

```ts
export function buildCompleteTaskBody(done: boolean): Record<string, string> {
  return { OKFlag: done ? '1' : '0' }
}

export interface CreateTaskInput {
  title: string
  description?: string
  personCode: string
  dueDate?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
}

export function buildCreateTaskBody(input: CreateTaskInput): Record<string, string> {
  const body: Record<string, string> = {
    TodoFlag: '1',
    Comment: input.title,
    MainPersons: input.personCode,
  }
  if (input.description) body.Text = input.description
  if (input.dueDate) body.TransDate = input.dueDate
  if (input.activityTypeCode) body.ActType = input.activityTypeCode
  if (input.projectCode) body.PRCode = input.projectCode
  if (input.customerCode) body.CUCode = input.customerCode
  return body
}

export interface EditTaskInput {
  title?: string
  description?: string
  dueDate?: string
}

export function buildEditTaskBody(input: EditTaskInput): Record<string, string> {
  const body: Record<string, string> = {}
  if (input.title !== undefined) body.Comment = input.title
  if (input.description !== undefined) body.Text = input.description
  if (input.dueDate !== undefined) body.TransDate = input.dueDate
  return body
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- taskRecordUtils`
Expected: all tests PASS (original 6 plus the new 5).

- [ ] **Step 5: Commit**

```bash
git add lib/herbe/taskRecordUtils.ts __tests__/lib/herbe/taskRecordUtils.test.ts
git commit -m "feat(tasks): ERP task mutation body builders"
```

---

## Task 6: Microsoft To Do fetcher

**Files:**
- Create: `lib/outlook/tasks.ts`
- Test: `__tests__/lib/outlook/tasks.test.ts`

**Note:** Uses application permissions via existing `graphFetch`. Endpoints: `/users/{userEmail}/todo/lists` then `/users/{userEmail}/todo/lists/{listId}/tasks`. Scope check: the code attempts the list endpoint; a 403/401 marks the source as `notConfigured`.

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/outlook/tasks.test.ts`:

```ts
import { mapOutlookTask, fetchOutlookTasks, type OutlookTaskApi } from '@/lib/outlook/tasks'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
import { graphFetch } from '@/lib/graph/client'
const mockGraph = graphFetch as jest.Mock

beforeEach(() => mockGraph.mockReset())

describe('mapOutlookTask', () => {
  it('maps an Outlook task to the unified shape', () => {
    const api: OutlookTaskApi = {
      id: 'AAMkAG==',
      title: 'Sign addendum',
      body: { contentType: 'text', content: 'Notes' },
      dueDateTime: { dateTime: '2026-04-22T00:00:00', timeZone: 'UTC' },
      status: 'notStarted',
    }
    const task = mapOutlookTask(api, 'Tasks')
    expect(task).toMatchObject({
      id: 'outlook:AAMkAG==',
      source: 'outlook',
      sourceConnectionId: '',
      title: 'Sign addendum',
      description: 'Notes',
      dueDate: '2026-04-22',
      done: false,
      listName: 'Tasks',
    })
  })
  it('marks completed status as done=true', () => {
    const api: OutlookTaskApi = { id: '1', title: 't', status: 'completed' }
    expect(mapOutlookTask(api, 'Tasks').done).toBe(true)
  })
  it('omits dueDate when absent', () => {
    const api: OutlookTaskApi = { id: '1', title: 't', status: 'notStarted' }
    expect(mapOutlookTask(api, 'Tasks').dueDate).toBeUndefined()
  })
})

describe('fetchOutlookTasks', () => {
  it('returns notConfigured when lists endpoint returns 403', async () => {
    mockGraph.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' })
    const r = await fetchOutlookTasks('u@x.com', {} as any)
    expect(r.configured).toBe(false)
    expect(r.tasks).toEqual([])
  })

  it('returns tasks from the default list', async () => {
    mockGraph
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [
          { id: 'list-a', displayName: 'Other', isDefaultFolder: false, wellknownListName: 'none' },
          { id: 'list-b', displayName: 'Tasks', isDefaultFolder: true, wellknownListName: 'defaultList' },
        ] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [
          { id: '1', title: 'One', status: 'notStarted' },
          { id: '2', title: 'Two', status: 'completed' },
        ] }),
      })
    const r = await fetchOutlookTasks('u@x.com', {} as any)
    expect(r.configured).toBe(true)
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks[0].listName).toBe('Tasks')
    expect(r.tasks[1].done).toBe(true)
    // Assert list endpoint was called first then the tasks endpoint for list-b
    expect(mockGraph).toHaveBeenCalledTimes(2)
    expect((mockGraph.mock.calls[0][0] as string)).toContain('/users/u%40x.com/todo/lists')
    expect((mockGraph.mock.calls[1][0] as string)).toContain('/todo/lists/list-b/tasks')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- outlook/tasks`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the fetcher**

Create `lib/outlook/tasks.ts`:

```ts
import { graphFetch } from '@/lib/graph/client'
import type { AzureConfig } from '@/lib/accountConfig'
import type { Task } from '@/types/task'

export interface OutlookTaskApi {
  id: string
  title: string
  body?: { contentType: string; content: string }
  dueDateTime?: { dateTime: string; timeZone: string }
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'
}

interface OutlookListApi {
  id: string
  displayName: string
  isDefaultFolder?: boolean
  wellknownListName?: string
}

export interface FetchOutlookTasksResult {
  tasks: Task[]
  configured: boolean
  stale?: boolean
  error?: string
}

/** Map one Microsoft Graph todo task to the unified Task shape. */
export function mapOutlookTask(api: OutlookTaskApi, listName: string): Task {
  const dueDate = api.dueDateTime?.dateTime
    ? api.dueDateTime.dateTime.slice(0, 10)
    : undefined
  return {
    id: `outlook:${api.id}`,
    source: 'outlook',
    sourceConnectionId: '',
    title: api.title,
    description: api.body?.content || undefined,
    dueDate,
    done: api.status === 'completed',
    listName,
  }
}

/**
 * Fetch a user's tasks from their default Microsoft To Do list.
 * Returns `configured: false` when Graph returns 401/403 (missing Tasks.ReadWrite.All).
 */
export async function fetchOutlookTasks(
  userEmail: string,
  azureConfig: AzureConfig,
): Promise<FetchOutlookTasksResult> {
  const enc = encodeURIComponent(userEmail)
  const listsRes = await graphFetch(`/users/${enc}/todo/lists`, undefined, azureConfig)
  if (!listsRes.ok) {
    if (listsRes.status === 401 || listsRes.status === 403) {
      return { tasks: [], configured: false }
    }
    const text = await listsRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `lists ${listsRes.status}: ${text.slice(0, 120)}` }
  }
  const listsBody = await listsRes.json() as { value: OutlookListApi[] }
  const defaultList =
    listsBody.value.find(l => l.wellknownListName === 'defaultList')
      ?? listsBody.value.find(l => l.isDefaultFolder === true)
      ?? listsBody.value[0]
  if (!defaultList) return { tasks: [], configured: true }

  const tasksRes = await graphFetch(
    `/users/${enc}/todo/lists/${defaultList.id}/tasks`,
    undefined,
    azureConfig,
  )
  if (!tasksRes.ok) {
    const text = await tasksRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `tasks ${tasksRes.status}: ${text.slice(0, 120)}` }
  }
  const body = await tasksRes.json() as { value: OutlookTaskApi[] }
  const tasks = body.value.map(t => mapOutlookTask(t, defaultList.displayName))
  return { tasks, configured: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- outlook/tasks`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/outlook/tasks.ts __tests__/lib/outlook/tasks.test.ts
git commit -m "feat(tasks): Microsoft To Do fetcher"
```

---

## Task 7: Microsoft To Do mutation helpers

**Files:**
- Modify: `lib/outlook/tasks.ts`
- Modify: `__tests__/lib/outlook/tasks.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/lib/outlook/tasks.test.ts`:

```ts
import { createOutlookTask, updateOutlookTask } from '@/lib/outlook/tasks'

describe('createOutlookTask', () => {
  it('POSTs to default list with title + status notStarted', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // POST
        ok: true,
        json: async () => ({ id: 'NEW', title: 'Buy milk', status: 'notStarted' }),
      })
    const t = await createOutlookTask('u@x.com', { title: 'Buy milk' }, {} as any)
    expect(t.id).toBe('outlook:NEW')
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toMatchObject({ title: 'Buy milk', status: 'notStarted' })
  })
})

describe('updateOutlookTask', () => {
  it('PATCHes status to completed when done=true', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // PATCH
        ok: true,
        json: async () => ({ id: 'T', title: 'Buy milk', status: 'completed' }),
      })
    const t = await updateOutlookTask('u@x.com', 'T', { done: true }, {} as any)
    expect(t.done).toBe(true)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toMatchObject({ status: 'completed' })
  })

  it('PATCHes title + dueDateTime when edit fields provided', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T', title: 'New', status: 'notStarted' }) })
    await updateOutlookTask('u@x.com', 'T', { title: 'New', dueDate: '2026-05-01' }, {} as any)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    const payload = JSON.parse(opts.body)
    expect(payload.title).toBe('New')
    expect(payload.dueDateTime?.dateTime).toBe('2026-05-01T00:00:00')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- outlook/tasks`
Expected: new tests FAIL.

- [ ] **Step 3: Implement mutation helpers**

Append to `lib/outlook/tasks.ts`:

```ts
async function resolveDefaultListId(userEmail: string, azureConfig: AzureConfig): Promise<string> {
  const enc = encodeURIComponent(userEmail)
  const res = await graphFetch(`/users/${enc}/todo/lists`, undefined, azureConfig)
  if (!res.ok) throw new Error(`lists fetch failed: ${res.status}`)
  const body = await res.json() as { value: OutlookListApi[] }
  const def = body.value.find(l => l.wellknownListName === 'defaultList')
    ?? body.value.find(l => l.isDefaultFolder === true)
    ?? body.value[0]
  if (!def) throw new Error('no default To Do list')
  return def.id
}

export interface CreateOutlookTaskInput {
  title: string
  description?: string
  dueDate?: string
}

export async function createOutlookTask(
  userEmail: string,
  input: CreateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {
    title: input.title,
    status: 'notStarted',
  }
  if (input.description) {
    payload.body = { contentType: 'text', content: input.description }
  }
  if (input.dueDate) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${listId}/tasks`,
    { method: 'POST', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`create failed: ${res.status}`)
  const created = await res.json() as OutlookTaskApi
  return mapOutlookTask(created, 'Tasks')
}

export interface UpdateOutlookTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null  // null clears
}

export async function updateOutlookTask(
  userEmail: string,
  taskId: string,
  input: UpdateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {}
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'notStarted'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.body = { contentType: 'text', content: input.description }
  if (input.dueDate === null) payload.dueDateTime = null
  else if (input.dueDate !== undefined) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${listId}/tasks/${taskId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`update failed: ${res.status}`)
  const updated = await res.json() as OutlookTaskApi
  return mapOutlookTask(updated, 'Tasks')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- outlook/tasks`
Expected: all tests PASS (5 old + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/outlook/tasks.ts __tests__/lib/outlook/tasks.test.ts
git commit -m "feat(tasks): Microsoft To Do create/update"
```

---

## Task 8: Google Tasks fetcher and scope

**Files:**
- Modify: `lib/google/client.ts` — add `auth/tasks` scope.
- Create: `lib/google/tasks.ts`
- Test: `__tests__/lib/google/tasks.test.ts`

- [ ] **Step 1: Inspect `lib/google/client.ts` for the scope list location**

Read `lib/google/client.ts` to find the `scope` array passed to `generateAuthUrl` or OAuth client setup. The plan's Step 3 assumes a `SCOPES` const exists; if it doesn't, locate the scope array inline and add to it in place.

- [ ] **Step 2: Write failing tests**

Create `__tests__/lib/google/tasks.test.ts`:

```ts
import { mapGoogleTask, fetchGoogleTasks, type GoogleTaskApi } from '@/lib/google/tasks'

jest.mock('@/lib/google/userOAuth', () => ({
  getValidAccessTokenForUser: jest.fn(),
}))

import { getValidAccessTokenForUser } from '@/lib/google/userOAuth'
const mockToken = getValidAccessTokenForUser as jest.Mock

const realFetch = global.fetch
afterEach(() => { global.fetch = realFetch })

describe('mapGoogleTask', () => {
  it('maps a Google task', () => {
    const api: GoogleTaskApi = {
      id: 'abc',
      title: 'Foo',
      notes: 'Bar',
      due: '2026-05-01T00:00:00.000Z',
      status: 'needsAction',
    }
    const t = mapGoogleTask(api, 'My Tasks')
    expect(t).toMatchObject({
      id: 'google:abc', source: 'google', sourceConnectionId: '',
      title: 'Foo', description: 'Bar', dueDate: '2026-05-01',
      done: false, listName: 'My Tasks',
    })
  })
  it('marks completed status as done', () => {
    expect(mapGoogleTask({ id: '1', title: 't', status: 'completed' }, 'X').done).toBe(true)
  })
})

describe('fetchGoogleTasks', () => {
  it('returns notConfigured when token lookup returns null', async () => {
    mockToken.mockResolvedValueOnce(null)
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(false)
  })

  it('returns notConfigured when tasks scope is missing (401)', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false, status: 401, text: async () => 'unauthorized',
    }) as any
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(false)
  })

  it('fetches tasks from the default list', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [
          { id: 't1', title: 'A', status: 'needsAction' },
          { id: 't2', title: 'B', status: 'completed' },
        ] }),
      }) as any
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(true)
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks[0].listName).toBe('My Tasks')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- google/tasks`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `lib/google/tasks.ts`:

```ts
import { getValidAccessTokenForUser } from './userOAuth'
import type { Task } from '@/types/task'

export interface GoogleTaskApi {
  id: string
  title: string
  notes?: string
  due?: string
  status: 'needsAction' | 'completed'
}

interface GoogleListApi {
  id: string
  title: string
}

export interface FetchGoogleTasksResult {
  tasks: Task[]
  configured: boolean
  error?: string
}

export function mapGoogleTask(api: GoogleTaskApi, listName: string): Task {
  return {
    id: `google:${api.id}`,
    source: 'google',
    sourceConnectionId: '',
    title: api.title,
    description: api.notes || undefined,
    dueDate: api.due ? api.due.slice(0, 10) : undefined,
    done: api.status === 'completed',
    listName,
  }
}

async function tasksFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://tasks.googleapis.com/tasks/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchGoogleTasks(
  tokenId: string,
  userEmail: string,
  accountId: string,
): Promise<FetchGoogleTasksResult> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) return { tasks: [], configured: false }

  const listsRes = await tasksFetch(accessToken, '/users/@me/lists')
  if (!listsRes.ok) {
    if (listsRes.status === 401 || listsRes.status === 403) return { tasks: [], configured: false }
    const text = await listsRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `lists ${listsRes.status}: ${text.slice(0, 120)}` }
  }
  const listsBody = await listsRes.json() as { items?: GoogleListApi[] }
  const list = listsBody.items?.[0]
  if (!list) return { tasks: [], configured: true }

  const tasksRes = await tasksFetch(accessToken, `/lists/${list.id}/tasks?showCompleted=true&showHidden=false`)
  if (!tasksRes.ok) {
    const text = await tasksRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `tasks ${tasksRes.status}: ${text.slice(0, 120)}` }
  }
  const body = await tasksRes.json() as { items?: GoogleTaskApi[] }
  return { tasks: (body.items ?? []).map(t => mapGoogleTask(t, list.title)), configured: true }
}
```

- [ ] **Step 5: Add `auth/tasks` scope to the Google OAuth client**

Open `lib/google/client.ts`. Locate the scopes array passed to `generateAuthUrl` or to the OAuth client configuration (search for `www.googleapis.com/auth/calendar`). Add `'https://www.googleapis.com/auth/tasks'` to the same array. No other change.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- google/tasks`
Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/google/tasks.ts lib/google/client.ts __tests__/lib/google/tasks.test.ts
git commit -m "feat(tasks): Google Tasks fetcher + auth/tasks scope"
```

---

## Task 9: Google Tasks mutation helpers

**Files:**
- Modify: `lib/google/tasks.ts`
- Modify: `__tests__/lib/google/tasks.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `__tests__/lib/google/tasks.test.ts`:

```ts
import { createGoogleTask, updateGoogleTask } from '@/lib/google/tasks'

describe('createGoogleTask', () => {
  it('POSTs to the default list and maps the response', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new', title: 'Buy', status: 'needsAction' }) }) as any
    const t = await createGoogleTask('tok-1', 'u@x.com', 'acc-1', { title: 'Buy' })
    expect(t.id).toBe('google:new')
    const callArgs = (global.fetch as jest.Mock).mock.calls[1]
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toMatchObject({ title: 'Buy' })
  })
})

describe('updateGoogleTask', () => {
  it('PATCHes status to completed when done=true', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't', title: 'x', status: 'completed' }) }) as any
    const t = await updateGoogleTask('tok-1', 'u@x.com', 'acc-1', 't', { done: true })
    expect(t.done).toBe(true)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)
    expect(body.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- google/tasks`
Expected: new tests FAIL.

- [ ] **Step 3: Implement mutation helpers**

Append to `lib/google/tasks.ts`:

```ts
async function resolveDefaultGoogleListId(accessToken: string): Promise<{ id: string; title: string }> {
  const res = await tasksFetch(accessToken, '/users/@me/lists')
  if (!res.ok) throw new Error(`lists ${res.status}`)
  const body = await res.json() as { items?: GoogleListApi[] }
  const list = body.items?.[0]
  if (!list) throw new Error('no Google task list found')
  return { id: list.id, title: list.title }
}

export interface CreateGoogleTaskInput {
  title: string
  description?: string
  dueDate?: string
}

export async function createGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  input: CreateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  const list = await resolveDefaultGoogleListId(accessToken)
  const payload: Record<string, unknown> = { title: input.title }
  if (input.description) payload.notes = input.description
  if (input.dueDate) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${list.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
  const created = await res.json() as GoogleTaskApi
  return mapGoogleTask(created, list.title)
}

export interface UpdateGoogleTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
}

export async function updateGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  taskId: string,
  input: UpdateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  const list = await resolveDefaultGoogleListId(accessToken)
  const payload: Record<string, unknown> = { id: taskId }
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'needsAction'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.notes = input.description
  if (input.dueDate === null) payload.due = null
  else if (input.dueDate !== undefined) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${list.id}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`update ${res.status}`)
  const updated = await res.json() as GoogleTaskApi
  return mapGoogleTask(updated, list.title)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- google/tasks`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/google/tasks.ts __tests__/lib/google/tasks.test.ts
git commit -m "feat(tasks): Google Tasks create/update"
```

---

## Task 10: GET /api/tasks aggregator

**Files:**
- Create: `app/api/tasks/route.ts`
- Test: `__tests__/api/tasks/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/tasks/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { GET } from '@/app/api/tasks/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/taskRecordUtils', () => ({
  fetchErpTasks: jest.fn(),
}))
jest.mock('@/lib/outlook/tasks', () => ({
  fetchOutlookTasks: jest.fn(),
}))
jest.mock('@/lib/google/tasks', () => ({
  fetchGoogleTasks: jest.fn(),
}))
jest.mock('@/lib/cache/tasks', () => ({
  getCachedTasks: jest.fn().mockResolvedValue([]),
  replaceCachedTasksForSource: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/personCodes', () => ({
  getPersonCodeForUser: jest.fn().mockResolvedValue('EKS'),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue(null),
  getUserGoogleTokenId: jest.fn().mockResolvedValue(null),
}))

import { requireSession } from '@/lib/herbe/auth-guard'
import { fetchErpTasks } from '@/lib/herbe/taskRecordUtils'
import { fetchOutlookTasks } from '@/lib/outlook/tasks'
import { fetchGoogleTasks } from '@/lib/google/tasks'

const mockReq = (): Request => new Request('http://localhost/api/tasks')

beforeEach(() => {
  ;(requireSession as jest.Mock).mockResolvedValue({ accountId: 'a1', email: 'u@x.com' })
  ;(fetchErpTasks as jest.Mock).mockResolvedValue({ tasks: [], errors: [] })
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValue({ tasks: [], configured: false })
  ;(fetchGoogleTasks as jest.Mock).mockResolvedValue({ tasks: [], configured: false })
})

it('returns 401 when no session', async () => {
  ;(requireSession as jest.Mock).mockRejectedValueOnce(new Error('no session'))
  const res = await GET(mockReq())
  expect(res.status).toBe(401)
})

it('returns 200 with merged tasks and configured flags', async () => {
  ;(fetchErpTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [{ id: 'herbe:1', source: 'herbe', sourceConnectionId: 'c1', title: 'E', done: false }],
    errors: [],
  })
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [{ id: 'outlook:1', source: 'outlook', sourceConnectionId: '', title: 'O', done: false }],
    configured: true,
  })
  const res = await GET(mockReq())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.tasks).toHaveLength(2)
  expect(body.configured).toEqual({ herbe: true, outlook: true, google: false })
})

it('returns 200 even when a source errors; error is reported per-source', async () => {
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [], configured: true, error: 'network timeout',
  })
  const res = await GET(mockReq())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.errors.find((e: any) => e.source === 'outlook')?.msg).toContain('network timeout')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- api/tasks/route`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement the aggregator**

Create `app/api/tasks/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { fetchErpTasks } from '@/lib/herbe/taskRecordUtils'
import { fetchOutlookTasks } from '@/lib/outlook/tasks'
import { fetchGoogleTasks } from '@/lib/google/tasks'
import {
  getCachedTasks,
  replaceCachedTasksForSource,
  type CachedTaskRow,
} from '@/lib/cache/tasks'
import { getPersonCodeForUser } from '@/lib/personCodes'
import { getAzureConfig, getUserGoogleTokenId } from '@/lib/accountConfig'
import type { Task, TaskSource } from '@/types/task'

interface SourceErrorInfo { source: TaskSource; msg: string; stale?: boolean }

export async function GET(_req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { accountId, email } = session
  const personCode = await getPersonCodeForUser(accountId, email)
  const azureConfig = await getAzureConfig(accountId)
  const googleTokenId = await getUserGoogleTokenId(email, accountId)

  const [erpR, outlookR, googleR] = await Promise.all([
    fetchErpAndCache(accountId, email, personCode ? [personCode] : []),
    azureConfig
      ? fetchOutlookAndCache(accountId, email, azureConfig)
      : Promise.resolve({ tasks: [], configured: false }),
    googleTokenId
      ? fetchGoogleAndCache(accountId, email, googleTokenId)
      : Promise.resolve({ tasks: [], configured: false }),
  ])

  const errors: SourceErrorInfo[] = []
  if (erpR.error) errors.push({ source: 'herbe', msg: erpR.error, stale: erpR.stale })
  if (outlookR.error) errors.push({ source: 'outlook', msg: outlookR.error, stale: outlookR.stale })
  if (googleR.error) errors.push({ source: 'google', msg: googleR.error, stale: googleR.stale })

  const tasks: Task[] = [
    ...erpR.tasks, ...outlookR.tasks, ...googleR.tasks,
  ]

  const configured = {
    herbe: true, // ERP is always configured for this account (see spec)
    outlook: !!outlookR.configured,
    google: !!googleR.configured,
  }
  return NextResponse.json({ tasks, configured, errors }, { headers: { 'Cache-Control': 'no-store' } })
}

// -------- per-source helpers with cache fallback --------

function cacheRowsFrom(
  tasks: Task[],
  accountId: string,
  userEmail: string,
  source: TaskSource,
): CachedTaskRow[] {
  return tasks.map(t => ({
    accountId,
    userEmail,
    source,
    connectionId: t.sourceConnectionId ?? '',
    taskId: t.id,
    payload: t as unknown as Record<string, unknown>,
  }))
}

async function fetchErpAndCache(accountId: string, userEmail: string, personCodes: string[]) {
  if (personCodes.length === 0) return { tasks: [] as Task[], configured: true }
  try {
    const r = await fetchErpTasks(accountId, personCodes)
    if (r.errors.length > 0 && r.tasks.length === 0) {
      const cached = await getCachedTasks(accountId, userEmail, 'herbe')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.errors[0].msg }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'herbe',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'herbe'))
    return { tasks: r.tasks, configured: true }
  } catch (e) {
    const cached = await getCachedTasks(accountId, userEmail, 'herbe')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: String(e) }
  }
}

async function fetchOutlookAndCache(accountId: string, userEmail: string, azureConfig: any) {
  try {
    const r = await fetchOutlookTasks(userEmail, azureConfig)
    if (!r.configured) return r
    if (r.error) {
      const cached = await getCachedTasks(accountId, userEmail, 'outlook')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.error }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'outlook',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'outlook'))
    return r
  } catch (e) {
    const cached = await getCachedTasks(accountId, userEmail, 'outlook')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: String(e) }
  }
}

async function fetchGoogleAndCache(accountId: string, userEmail: string, tokenId: string) {
  try {
    const r = await fetchGoogleTasks(tokenId, userEmail, accountId)
    if (!r.configured) return r
    if (r.error) {
      const cached = await getCachedTasks(accountId, userEmail, 'google')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.error }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'google',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'google'))
    return r
  } catch (e) {
    const cached = await getCachedTasks(accountId, userEmail, 'google')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: String(e) }
  }
}
```

- [ ] **Step 4: Verify helper imports**

This route imports `getPersonCodeForUser`, `getAzureConfig`, `getUserGoogleTokenId` from existing modules. Verify they exist / rename as needed:
```bash
grep -n "getPersonCodeForUser\|getAzureConfig\|getUserGoogleTokenId" lib/personCodes.ts lib/accountConfig.ts 2>&1 | head
```
If a helper name differs, update the route imports to match the existing name (same intent — look up the signed-in user's ERP person code, the account's Azure config, and the user's Google token id). Record the renames in the commit message.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- api/tasks/route`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/tasks/route.ts __tests__/api/tasks/route.test.ts
git commit -m "feat(tasks): GET /api/tasks aggregator with per-source cache fallback"
```

---

## Task 11: PATCH /api/tasks/[source]/[id]

**Files:**
- Create: `app/api/tasks/[source]/[id]/route.ts`
- Test: `__tests__/api/tasks/source-id/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/tasks/source-id/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { PATCH } from '@/app/api/tasks/[source]/[id]/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ accountId: 'a1', email: 'u@x.com' }),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetchById: jest.fn(),
}))
jest.mock('@/lib/outlook/tasks', () => ({
  updateOutlookTask: jest.fn(),
}))
jest.mock('@/lib/google/tasks', () => ({
  updateGoogleTask: jest.fn(),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({}),
  getUserGoogleTokenId: jest.fn().mockResolvedValue('tok-1'),
  getErpConnections: jest.fn().mockResolvedValue([{ id: 'c1', name: 'C' }]),
}))

import { updateOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import { herbeFetchById } from '@/lib/herbe/client'

const req = (body: unknown) => new Request('http://localhost/api/tasks/x/y', {
  method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

it('toggling Outlook done calls updateOutlookTask', async () => {
  ;(updateOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:T', done: true })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'outlook', id: 'T' }) })
  expect(res.status).toBe(200)
  expect(updateOutlookTask).toHaveBeenCalledWith('u@x.com', 'T', { done: true }, expect.anything())
})

it('toggling Google done calls updateGoogleTask', async () => {
  ;(updateGoogleTask as jest.Mock).mockResolvedValue({ id: 'google:T', done: true })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'google', id: 'T' }) })
  expect(res.status).toBe(200)
  expect(updateGoogleTask).toHaveBeenCalledWith('tok-1', 'u@x.com', 'a1', 'T', { done: true })
})

it('toggling ERP done PATCHes ActVc via herbeFetchById with OKFlag=1', async () => {
  ;(herbeFetchById as jest.Mock).mockResolvedValue(new Response('{}', { status: 200 }))
  const res = await PATCH(
    req({ done: true, connectionId: 'c1' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(200)
  const [register, id, init] = (herbeFetchById as jest.Mock).mock.calls[0]
  expect(register).toBe('ActVc')
  expect(id).toBe('12345')
  expect(init.method).toBe('PATCH')
  expect(String(init.body)).toContain('OKFlag=1')
})

it('returns 400 for unknown source', async () => {
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'zzz', id: 'T' }) })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- source-id/route`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/[source]/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchById } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { updateOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import {
  getAzureConfig, getUserGoogleTokenId, getErpConnections,
} from '@/lib/accountConfig'
import { buildCompleteTaskBody, buildEditTaskBody } from '@/lib/herbe/taskRecordUtils'
import { toHerbeForm } from '@/app/api/activities/route'

interface PatchBody {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
  connectionId?: string
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { source, id } = await params
  if (!['herbe', 'outlook', 'google'].includes(source)) {
    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as PatchBody

  try {
    if (source === 'herbe') {
      const conns = await getErpConnections(session.accountId)
      const conn = conns.find(c => c.id === body.connectionId) ?? conns[0]
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const merged = {
        ...(body.done !== undefined ? buildCompleteTaskBody(body.done) : {}),
        ...buildEditTaskBody({
          title: body.title,
          description: body.description,
          dueDate: body.dueDate ?? undefined,
        }),
      }
      // Use the same Herbe PATCH pattern as app/api/activities/[id]/route.ts:
      // herbeFetchById(register, id, { method: 'PATCH', body: formBody, headers }) — body is form-encoded via toHerbeForm.
      const formBody = toHerbeForm(merged)
      const res = await herbeFetchById(REGISTERS.activities, id, {
        method: 'PATCH',
        body: formBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      }, conn)
      if (!res.ok) {
        return NextResponse.json({ error: `ERP update ${res.status}` }, { status: 502 })
      }
      return NextResponse.json({ ok: true })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await updateOutlookTask(session.email, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
      }, azure)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const tokenId = await getUserGoogleTokenId(session.email, session.accountId)
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await updateGoogleTask(tokenId, session.email, session.accountId, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
      })
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks PATCH ${source}/${id}]`, e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

Note: `toHerbeForm` is exported from `app/api/activities/route.ts`. Cross-route imports between API handlers are already used in the codebase (see `app/api/activities/[id]/route.ts` line 10). If lint flags the import, relocate `toHerbeForm` to `lib/herbe/formEncoding.ts` and update both consumers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- source-id/route`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/ __tests__/api/tasks/source-id/
git commit -m "feat(tasks): PATCH /api/tasks/[source]/[id]"
```

---

## Task 12: POST /api/tasks/[source]

**Files:**
- Create: `app/api/tasks/[source]/route.ts`
- Test: `__tests__/api/tasks/source-create/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/tasks/source-create/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { POST } from '@/app/api/tasks/[source]/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ accountId: 'a1', email: 'u@x.com' }),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/client', () => ({ herbeFetch: jest.fn() }))
jest.mock('@/lib/outlook/tasks', () => ({ createOutlookTask: jest.fn() }))
jest.mock('@/lib/google/tasks', () => ({ createGoogleTask: jest.fn() }))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({}),
  getUserGoogleTokenId: jest.fn().mockResolvedValue('tok-1'),
  getErpConnections: jest.fn().mockResolvedValue([{ id: 'c1', name: 'C' }]),
}))
jest.mock('@/lib/personCodes', () => ({ getPersonCodeForUser: jest.fn().mockResolvedValue('EKS') }))
// toHerbeForm is imported from @/app/api/activities/route — stub it to a predictable string
jest.mock('@/app/api/activities/route', () => ({
  toHerbeForm: (body: Record<string, unknown>) => new URLSearchParams(body as Record<string, string>).toString(),
}))

import { createOutlookTask } from '@/lib/outlook/tasks'
import { createGoogleTask } from '@/lib/google/tasks'
import { herbeFetch } from '@/lib/herbe/client'

const req = (body: unknown) => new Request('http://localhost/api/tasks/x', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

it('POST outlook creates via Graph', async () => {
  ;(createOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:N' })
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'outlook' }) })
  expect(res.status).toBe(200)
  expect(createOutlookTask).toHaveBeenCalledWith('u@x.com', { title: 'Hi' }, expect.anything())
})

it('POST google creates via Tasks API', async () => {
  ;(createGoogleTask as jest.Mock).mockResolvedValue({ id: 'google:N' })
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'google' }) })
  expect(res.status).toBe(200)
  expect(createGoogleTask).toHaveBeenCalledWith('tok-1', 'u@x.com', 'a1', { title: 'Hi' })
})

it('POST herbe posts TodoFlag=1 to ActVc with MainPersons=person_code', async () => {
  ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ SerNr: '99' }), { status: 200 }))
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'herbe' }) })
  expect(res.status).toBe(200)
  const [register, id, init] = (herbeFetch as jest.Mock).mock.calls[0]
  expect(register).toBe('ActVc')
  expect(id).toBeUndefined()
  expect(init.method).toBe('POST')
  expect(String(init.body)).toContain('TodoFlag=1')
  expect(String(init.body)).toContain('MainPersons=EKS')
})

it('returns 400 for unknown source', async () => {
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'zzz' }) })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- source-create/route`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/api/tasks/[source]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetch } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { createOutlookTask } from '@/lib/outlook/tasks'
import { createGoogleTask } from '@/lib/google/tasks'
import {
  getAzureConfig, getUserGoogleTokenId, getErpConnections,
} from '@/lib/accountConfig'
import { getPersonCodeForUser } from '@/lib/personCodes'
import { buildCreateTaskBody } from '@/lib/herbe/taskRecordUtils'
import { toHerbeForm } from '@/app/api/activities/route'

interface CreateBody {
  title: string
  description?: string
  dueDate?: string
  connectionId?: string   // ERP
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { source } = await params
  if (!['herbe', 'outlook', 'google'].includes(source)) {
    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as CreateBody
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  try {
    if (source === 'herbe') {
      const personCode = await getPersonCodeForUser(session.accountId, session.email)
      if (!personCode) return NextResponse.json({ error: 'no person code for user' }, { status: 400 })
      const conns = await getErpConnections(session.accountId)
      const conn = conns.find(c => c.id === body.connectionId) ?? conns[0]
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const formBody = toHerbeForm(buildCreateTaskBody({
        title: body.title,
        description: body.description,
        personCode,
        dueDate: body.dueDate,
        activityTypeCode: body.activityTypeCode,
        projectCode: body.projectCode,
        customerCode: body.customerCode,
      }))
      // Mirrors app/api/activities/route.ts POST — herbeFetch(register, id?, options, conn).
      const res = await herbeFetch(REGISTERS.activities, undefined, {
        method: 'POST',
        body: formBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      }, conn)
      if (!res.ok) return NextResponse.json({ error: `ERP create ${res.status}` }, { status: 502 })
      return NextResponse.json({ ok: true })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await createOutlookTask(session.email, {
        title: body.title, description: body.description, dueDate: body.dueDate,
      }, azure)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const tokenId = await getUserGoogleTokenId(session.email, session.accountId)
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await createGoogleTask(tokenId, session.email, session.accountId, {
        title: body.title, description: body.description, dueDate: body.dueDate,
      })
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks POST ${source}]`, e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- source-create/route`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/ __tests__/api/tasks/source-create/
git commit -m "feat(tasks): POST /api/tasks/[source]"
```

---

## Task 13: TaskRow component

**Files:**
- Create: `components/TaskRow.tsx`
- Test: `__tests__/components/TaskRow.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/TaskRow.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskRow } from '@/components/TaskRow'
import type { Task } from '@/types/task'

const taskFixture: Task = {
  id: 'herbe:1',
  source: 'herbe',
  sourceConnectionId: 'c1',
  title: 'Review prototype',
  done: false,
  listName: 'Burti · Product',
  dueDate: '2026-04-20',
}

it('renders the title', () => {
  render(<TaskRow task={taskFixture} onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByText('Review prototype')).toBeInTheDocument()
})

it('fires onToggleDone when the checkbox is clicked', () => {
  const onToggleDone = jest.fn()
  render(<TaskRow task={taskFixture} onToggleDone={onToggleDone} onEdit={() => {}} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onToggleDone).toHaveBeenCalledWith(taskFixture, true)
})

it('fires onEdit when the title is clicked', () => {
  const onEdit = jest.fn()
  render(<TaskRow task={taskFixture} onToggleDone={() => {}} onEdit={onEdit} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByText('Review prototype'))
  expect(onEdit).toHaveBeenCalledWith(taskFixture)
})

it('fires onCopyToEvent when the copy-to-event icon is clicked', () => {
  const onCopyToEvent = jest.fn()
  render(<TaskRow task={taskFixture} onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={onCopyToEvent} />)
  fireEvent.click(screen.getByLabelText('Copy to calendar event'))
  expect(onCopyToEvent).toHaveBeenCalledWith(taskFixture)
})

it('shows overdue styling for a past due date', () => {
  const past: Task = { ...taskFixture, dueDate: '2020-01-01' }
  render(<TaskRow task={past} onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('due-badge')).toHaveClass('overdue')
})

it('strikes through title when done', () => {
  const done: Task = { ...taskFixture, done: true }
  render(<TaskRow task={done} onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('task-row')).toHaveClass('done')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/TaskRow`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement**

Create `components/TaskRow.tsx`:

```tsx
'use client'
import type { Task } from '@/types/task'

const SOURCE_COLOR: Record<Task['source'], string> = {
  herbe: '#00AEE7',
  outlook: '#6264a7',
  google: '#4285f4',
}

function isOverdue(dueDate: string | undefined, done: boolean): boolean {
  if (!dueDate || done) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
}

export function TaskRow(props: {
  task: Task
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
}) {
  const { task, onToggleDone, onEdit, onCopyToEvent } = props
  const overdue = isOverdue(task.dueDate, task.done)

  return (
    <div
      data-testid="task-row"
      className={`task-row ${task.done ? 'done' : ''}`}
      style={{
        borderLeft: `3px solid ${SOURCE_COLOR[task.source]}`,
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
      }}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={e => onToggleDone(task, e.currentTarget.checked)}
        aria-label="Mark done"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={() => onEdit(task)}
          style={{ cursor: 'pointer', textDecoration: task.done ? 'line-through' : 'none' }}
        >
          {task.title}
        </div>
        {(task.dueDate || task.listName) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 3, fontSize: 11, opacity: 0.7 }}>
            {task.dueDate && (
              <span
                data-testid="due-badge"
                className={overdue ? 'overdue' : ''}
              >
                {task.dueDate}
              </span>
            )}
            {task.listName && <span>{task.listName}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          aria-label="Copy to calendar event"
          onClick={() => onCopyToEvent(task)}
        >→📅</button>
        <button
          aria-label="Edit"
          onClick={() => onEdit(task)}
        >✎</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/TaskRow`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/TaskRow.tsx __tests__/components/TaskRow.test.tsx
git commit -m "feat(tasks): TaskRow component"
```

---

## Task 14: TasksList component

**Files:**
- Create: `components/TasksList.tsx`

- [ ] **Step 1: Implement**

Create `components/TasksList.tsx`:

```tsx
'use client'
import type { Task, TaskSource } from '@/types/task'
import { TaskRow } from './TaskRow'
import { useState } from 'react'

const SOURCE_LABEL: Record<TaskSource, string> = {
  herbe: 'Standard ERP',
  outlook: 'Microsoft To Do',
  google: 'Google Tasks',
}

interface CommonHandlers {
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
  onCreate: (source: TaskSource) => void
}

function SourceSection(props: {
  source: TaskSource
  tasks: Task[]
  handlers: CommonHandlers
  showHeader: boolean
}) {
  const { source, tasks, handlers, showHeader } = props
  const [showCompleted, setShowCompleted] = useState(false)
  const open = tasks.filter(t => !t.done)
  const completed = tasks.filter(t => t.done)

  return (
    <section>
      {showHeader && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 4px' }}>
          <strong>{SOURCE_LABEL[source]}</strong>
          <span style={{ opacity: 0.5, fontSize: 11 }}>{open.length}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => handlers.onCreate(source)}>+ New task</button>
        </header>
      )}
      <div>
        {open.length === 0 && (
          <p style={{ opacity: 0.5, padding: '6px 14px', fontSize: 12 }}>No open tasks.</p>
        )}
        {open.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onToggleDone={handlers.onToggleDone}
            onEdit={handlers.onEdit}
            onCopyToEvent={handlers.onCopyToEvent}
          />
        ))}
      </div>
      {completed.length > 0 && (
        <>
          <button
            onClick={() => setShowCompleted(s => !s)}
            style={{ padding: '4px 14px', fontSize: 11, opacity: 0.6, width: '100%', textAlign: 'left' }}
          >
            {showCompleted ? '▾' : '▸'} {completed.length} completed
          </button>
          {showCompleted && completed.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onToggleDone={handlers.onToggleDone}
              onEdit={handlers.onEdit}
              onCopyToEvent={handlers.onCopyToEvent}
            />
          ))}
        </>
      )}
    </section>
  )
}

export function TasksList(props: {
  tab: 'all' | TaskSource
  tasks: Task[]
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  handlers: CommonHandlers
}) {
  const { tab, tasks, configured, handlers } = props
  if (tab === 'all') {
    const sources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
      .filter(s => configured[s])
    return (
      <div>
        {sources.map(s => (
          <SourceSection
            key={s}
            source={s}
            tasks={tasks.filter(t => t.source === s)}
            handlers={handlers}
            showHeader={true}
          />
        ))}
      </div>
    )
  }
  return (
    <SourceSection
      source={tab}
      tasks={tasks.filter(t => t.source === tab)}
      handlers={handlers}
      showHeader={true}
    />
  )
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/TasksList.tsx
git commit -m "feat(tasks): TasksList component"
```

---

## Task 15: TasksSidebar component

**Files:**
- Create: `components/TasksSidebar.tsx`
- Test: `__tests__/components/TasksSidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/TasksSidebar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TasksSidebar } from '@/components/TasksSidebar'
import type { Task } from '@/types/task'

const tasks: Task[] = [
  { id: 'herbe:1', source: 'herbe', sourceConnectionId: 'c1', title: 'E', done: false },
  { id: 'outlook:1', source: 'outlook', sourceConnectionId: '', title: 'O', done: false },
]

const noopHandlers = { onToggleDone: jest.fn(), onEdit: jest.fn(), onCopyToEvent: jest.fn(), onCreate: jest.fn() }

it('only renders tabs for configured sources', () => {
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: false }}
      errors={[]}
      activeTab="all"
      onTabChange={() => {}}
      handlers={noopHandlers}
    />,
  )
  expect(screen.getByRole('button', { name: /ERP/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Outlook/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
})

it('switching tab calls onTabChange', () => {
  const onTabChange = jest.fn()
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: true }}
      errors={[]}
      activeTab="all"
      onTabChange={onTabChange}
      handlers={noopHandlers}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Outlook/ }))
  expect(onTabChange).toHaveBeenCalledWith('outlook')
})

it('shows stale banner when a source is stale', () => {
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: false }}
      errors={[{ source: 'outlook', msg: 'timeout', stale: true }]}
      activeTab="all"
      onTabChange={() => {}}
      handlers={noopHandlers}
    />,
  )
  expect(screen.getByText(/last known state/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/TasksSidebar`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `components/TasksSidebar.tsx`:

```tsx
'use client'
import type { Task, TaskSource } from '@/types/task'
import { TasksList } from './TasksList'

interface SourceError { source: TaskSource; msg: string; stale?: boolean }

const TAB_LABEL: Record<TaskSource, string> = {
  herbe: 'ERP',
  outlook: 'Outlook',
  google: 'Google',
}

export function TasksSidebar(props: {
  tasks: Task[]
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  errors: SourceError[]
  activeTab: 'all' | TaskSource
  onTabChange: (tab: 'all' | TaskSource) => void
  handlers: {
    onToggleDone: (task: Task, next: boolean) => void
    onEdit: (task: Task) => void
    onCopyToEvent: (task: Task) => void
    onCreate: (source: TaskSource) => void
  }
}) {
  const { tasks, configured, errors, activeTab, onTabChange, handlers } = props
  const visibleSources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
    .filter(s => configured[s])
  const countBy = (s: TaskSource) => tasks.filter(t => t.source === s && !t.done).length
  const total = tasks.filter(t => !t.done).length

  return (
    <div className="tasks-sidebar">
      <div className="tasks-tabs" role="tablist">
        <button
          onClick={() => onTabChange('all')}
          aria-pressed={activeTab === 'all'}
        >All <span>{total}</span></button>
        {visibleSources.map(s => (
          <button
            key={s}
            onClick={() => onTabChange(s)}
            aria-pressed={activeTab === s}
          >{TAB_LABEL[s]} <span>{countBy(s)}</span></button>
        ))}
      </div>

      {errors.filter(e => e.stale).map(e => (
        <div key={e.source} className="stale-banner" role="alert">
          {TAB_LABEL[e.source]}: showing last known state ({e.msg}).
        </div>
      ))}

      <TasksList
        tab={activeTab}
        tasks={tasks}
        configured={configured}
        handlers={handlers}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/TasksSidebar`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/TasksSidebar.tsx __tests__/components/TasksSidebar.test.tsx
git commit -m "feat(tasks): TasksSidebar with tabs + stale banner"
```

---

## Task 16: ActivityForm slim task mode

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Add a `mode` prop and conditional rendering**

Open `components/ActivityForm.tsx`. Add a new prop at the top of the `Props` interface:

```ts
mode?: 'event' | 'task'   // default 'event'
```

Then, at the top of the component body, destructure it with a default:

```ts
const { mode = 'event', /* …other existing props */ } = props
```

In the JSX, wrap each of the following field blocks in `{mode === 'event' && ( ... )}`:
- Start/end time inputs
- Attendees picker
- Zoom / Teams meeting toggles and link inputs
- "Planned" flag (`CalTimeFlag`) toggle

All other fields (title, description, due date, source picker, ERP type/project/customer) remain unconditionally rendered. Save the file.

- [ ] **Step 2: Verify existing calendar flows still render**

Run: `npm test -- components/ActivityForm` (if tests exist)
If no ActivityForm tests exist, manually verify by starting the dev server and opening an event — the form should look unchanged when `mode` is not passed.
```bash
npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add components/ActivityForm.tsx
git commit -m "feat(tasks): ActivityForm slim task mode (hides event-only fields)"
```

---

## Task 17: CalendarShell integration

**Files:**
- Modify: `components/CalendarShell.tsx`

This is the largest wiring task. It touches state, fetching, handler functions, and rendering. Split into multiple steps.

- [ ] **Step 1: Add task-related state**

In `CalendarShell.tsx`, locate the existing `useState` declarations for `activities`/`rightSide`/etc. and add:

```tsx
import type { Task, TaskSource } from '@/types/task'
// ... existing imports

const [tasks, setTasks] = useState<Task[]>([])
const [taskSources, setTaskSources] = useState<{ herbe: boolean; outlook: boolean; google: boolean }>({
  herbe: true, outlook: false, google: false,
})
const [taskErrors, setTaskErrors] = useState<{ source: TaskSource; msg: string; stale?: boolean }[]>([])
const [tasksTab, setTasksTab] = useState<'all' | TaskSource>(/* TODO: read from cookie */ 'all')
```

Replace the `/* TODO: read from cookie */` comment with the existing cookie-reading pattern used for `rightSide` in this file (search for `document.cookie` in the same file).

- [ ] **Step 2: Add a loader and wire it into an effect**

Still in `CalendarShell.tsx`, add:

```tsx
const loadTasks = useCallback(async () => {
  try {
    const res = await fetch('/api/tasks')
    if (!res.ok) return
    const body = await res.json() as {
      tasks: Task[]
      configured: { herbe: boolean; outlook: boolean; google: boolean }
      errors: { source: TaskSource; msg: string; stale?: boolean }[]
    }
    setTasks(body.tasks)
    setTaskSources(body.configured)
    setTaskErrors(body.errors)
  } catch (e) {
    console.warn('[CalendarShell] loadTasks failed:', e)
  }
}, [])

useEffect(() => { loadTasks() }, [loadTasks])
```

- [ ] **Step 3: Add handlers**

Append to the same component:

```tsx
async function onToggleDone(task: Task, done: boolean) {
  const prev = tasks
  setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done } : t))
  const sourceId = task.id.split(':', 2)[1]
  const body: Record<string, unknown> = { done }
  if (task.source === 'herbe') body.connectionId = task.sourceConnectionId
  try {
    const res = await fetch(`/api/tasks/${task.source}/${sourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
  } catch (e) {
    console.warn('toggleDone failed:', e)
    setTasks(prev) // rollback
  }
}

function onEditTask(task: Task) {
  // Open existing ActivityForm in task mode, pre-filled from task.
  // (Implementation varies by how CalendarShell currently opens the form.)
  openActivityForm({
    mode: 'task',
    initial: activityShapeFromTask(task),
    editId: task.id,
  })
}

function onCopyToEvent(task: Task) {
  openActivityForm({
    mode: 'event',
    initial: activityShapeFromTask(task, /* asEvent */ true),
    // editId intentionally omitted — creating new
  })
}

function onCreateTask(source: TaskSource) {
  openActivityForm({
    mode: 'task',
    initial: { source },
  })
}
```

Where `openActivityForm` is the existing open-form helper in this file, and `activityShapeFromTask` is a small helper you add at the bottom of the file:

```tsx
function activityShapeFromTask(task: Task, asEvent = false): Partial<Activity> {
  return {
    source: task.source,
    description: task.title,
    textInMatrix: task.description ?? task.erp?.textInMatrix,
    date: task.dueDate,
    activityTypeCode: task.erp?.activityTypeCode,
    projectCode: task.erp?.projectCode,
    projectName: task.erp?.projectName,
    customerCode: task.erp?.customerCode,
    customerName: task.erp?.customerName,
    // `asEvent` is the only difference: when copying to calendar, the form
    // ends up creating a TodoFlag=0 record (regular calendar event).
  }
}
```

Adjust the exact field names to match the `Activity` type used by `ActivityForm` (see existing `handleDuplicate` in `ActivityForm.tsx` — lines ~704–767 — for the full pre-fill shape).

- [ ] **Step 4: Extend `rightPanel`/`rightSide` state**

Find the existing `rightSide` state (`'agenda' | 'day'`). Rename both the type and usages to:

```ts
const [rightPanel, setRightPanel] = useState<'day' | 'agenda' | 'tasks'>(
  /* cookie default as today */
)
```

Pass `rightPanel`, `setRightPanel`, `tasks`, `taskSources`, `taskErrors`, `tasksTab`, `setTasksTab`, and the handlers down into `MonthView` and the day/week view components as needed.

- [ ] **Step 5: Render TasksSidebar conditionally**

In the part of `CalendarShell.tsx` where the right panel/sidebar is rendered, add the responsive split:

```tsx
import { TasksSidebar } from './TasksSidebar'

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768
}

// Inside the JSX where Agenda/Day panel is rendered today:
{rightPanel === 'tasks' && (
  isMobile() ? (
    <div className="main-area-tasks">
      <TasksSidebar
        tasks={tasks} configured={taskSources} errors={taskErrors}
        activeTab={tasksTab} onTabChange={setTasksTab}
        handlers={{ onToggleDone, onEdit: onEditTask, onCopyToEvent, onCreate: onCreateTask }}
      />
    </div>
  ) : (
    <aside className="right-pane-tasks" style={{ width: 340 }}>
      <TasksSidebar {/* same props */}
        tasks={tasks} configured={taskSources} errors={taskErrors}
        activeTab={tasksTab} onTabChange={setTasksTab}
        handlers={{ onToggleDone, onEdit: onEditTask, onCopyToEvent, onCreate: onCreateTask }}
      />
    </aside>
  )
)}
```

Tune the CSS classes to match existing conventions (the file already has classes like `right-pane` and `main-area` — look at what `rightSide === 'agenda'` renders today).

- [ ] **Step 6: Persist `tasksTab` to a cookie**

Use the same `document.cookie` setter pattern already in the file:

```tsx
useEffect(() => {
  document.cookie = `tasksTab=${tasksTab}; Path=/; Max-Age=${60 * 60 * 24 * 365}`
}, [tasksTab])
```

- [ ] **Step 7: Run type check + manual smoke test**

```bash
npx tsc --noEmit
```
Expected: no errors.

```bash
npm run dev
```
Open the calendar, click the Tasks button in the right-panel toggle (added in Task 18 next). Verify the sidebar appears and tasks load. If tasks are empty, verify the API directly:
```bash
curl 'http://localhost:3000/api/tasks' -H "Cookie: <session cookie>"
```

- [ ] **Step 8: Commit**

```bash
git add components/CalendarShell.tsx
git commit -m "feat(tasks): CalendarShell state + handlers + TasksSidebar wiring"
```

---

## Task 18: MonthView right-panel toggle extension

**Files:**
- Modify: `components/MonthView.tsx`

- [ ] **Step 1: Extend the `rightSide` type and add the Tasks button**

Open `components/MonthView.tsx`. Update the state type (line 45) — if `CalendarShell` now owns the state, convert `rightSide` into a prop instead of local state:

```tsx
// Was: const [rightSide, setRightSide] = useState<'agenda' | 'day'>('agenda')
// Now: accept from props
interface Props {
  rightPanel: 'day' | 'agenda' | 'tasks'
  setRightPanel: (p: 'day' | 'agenda' | 'tasks') => void
  // ... existing props
}
```

Near lines 421–450 where the segmented control is rendered, add a third button:

```tsx
<div className="segmented agenda-open" title="Switch view">
  <button onClick={() => setRightPanel('day')} aria-pressed={rightPanel === 'day'}>Day</button>
  <button onClick={() => setRightPanel('agenda')} aria-pressed={rightPanel === 'agenda'}>Agenda</button>
  <button onClick={() => setRightPanel('tasks')} aria-pressed={rightPanel === 'tasks'}>Tasks</button>
</div>
```

(Rename `1D` → `Day` in the process.)

In the right-panel body rendering, add a branch for `rightPanel === 'tasks'`:

```tsx
{rightPanel === 'tasks' ? (
  <TasksSidebar
    tasks={props.tasks}
    configured={props.taskSources}
    errors={props.taskErrors}
    activeTab={props.tasksTab}
    onTabChange={props.setTasksTab}
    handlers={props.taskHandlers}
  />
) : rightPanel === 'day' && dayViewPanel ? (/* existing day view */) : (/* existing agenda */)}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Navigate to `/cal` → switch to Month view → segmented control now shows Day | Agenda | Tasks → click Tasks → TasksSidebar renders. Switch to Day view from main view selector → same segmented toggle works there too (the bug-becomes-feature case).

- [ ] **Step 4: Commit**

```bash
git add components/MonthView.tsx
git commit -m "feat(tasks): MonthView segmented control adds Tasks option"
```

---

## Task 19: Admin hint for Tasks scope re-consent

**Files:**
- Modify: the admin Connections UI file.

- [ ] **Step 1: Locate the Connections admin page**

Run:
```bash
ls /Users/elviskvalbergs/AI/herbe-calendar/app/admin
```
Find the Connections page (likely a `*Connections*` file or a subdirectory). Open it.

- [ ] **Step 2: Add a compact hint block**

Below the existing Microsoft/Google connection status indicators, add:

```tsx
<p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
  Task sync (Microsoft To Do, Google Tasks) requires additional scopes.
  If tasks don't appear in the sidebar after a Microsoft or Google admin
  updates app permissions, re-connect from this page.
</p>
```

Scope this text to only show near each provider's connection panel (not as a global banner).

- [ ] **Step 3: Commit**

```bash
git add app/admin/
git commit -m "docs(admin): hint about Tasks scope re-consent"
```

---

## Task 20: Final end-to-end sanity check

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests PASS (existing + new). No regressions.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual golden-path test**

Start the dev server. In your browser, with an account that has ERP + Microsoft + Google connected:

1. Open `/cal` — confirm right-panel toggle shows Day / Agenda / Tasks.
2. Click Tasks → sidebar renders with All tab active.
3. Verify tabs appear only for configured sources (ERP always; Outlook only if Microsoft connected and scope consented; Google only if Google connected and scope consented).
4. Toggle a task's checkbox → optimistic update → API roundtrip succeeds → refresh page → state persists.
5. Click `+ New task` in the ERP section → form opens in task mode (no time/attendees/Zoom) with ERP pre-selected → save → task appears in sidebar.
6. Click the →📅 icon on a task → form opens in event mode pre-filled from the task → save → calendar event appears; original task unchanged.
7. Resize window across 768px → desktop α (right pane) ↔ mobile β (main swap) transitions cleanly; `tasksTab` + `rightPanel` persist.
8. Simulate a source failure (e.g. invalidate Graph credentials) → stale banner appears for Outlook; other sources still render.

- [ ] **Step 4: Commit any final polish fixes from the manual test**

If the manual test surfaced any rough edges (CSS, state persistence), commit them as `fix(tasks): …` commits as needed, each with its own failing-test-first cycle where a test is practical.

---

## Out-of-scope reminder

The following are explicitly deferred (see spec §"Deferred / phase 2") — **do not implement in this plan**:
- Drag-and-drop between task rows and calendar slots
- Kanban view
- Date-based task scheduling UI
- Team / others' tasks
- Outlook/Google list picker
- Additional task sources (Jira, Todoist, etc.)

If any of these surface as "easy additions" during implementation, stop and write a new spec first.
