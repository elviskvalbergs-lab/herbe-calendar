# Unified Destination Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ActivityForm` source-tab row + Google calendar sub-picker with one unified destination dropdown (`DestinationPicker`) for both task and event creation, with localStorage-backed per-mode defaults and safe ERP-field retention when switching destinations.

**Architecture:** Pure additive backend work (optional `listId` on Outlook/Google task creation) + one new read-only endpoint (`GET /api/destinations`) + a small presentational component + surgical rework of `ActivityForm` to own a `destination` state instead of a `source` string. Most downstream derivations (`isGoogleSource`, `isExternalCalSource`, `activeErpConnection`) keep their names and semantics — only their backing changes.

**Tech Stack:** TypeScript, React (client components), Jest + ts-jest. Run tests via `npx jest` or `npm test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-24-unified-destination-picker-design.md`

---

## File Structure

**New:**
- `lib/destinations/types.ts` — `Destination`, `DestinationMode`, `DestinationSource` types.
- `lib/destinations/keys.ts` — `makeKey()`, `parseDestinationKey()`, `UNTITLED`-style constants.
- `app/api/destinations/route.ts` — `GET` handler returning `Destination[]` per `?mode=`.
- `components/DestinationPicker.tsx` — presentational `<select>` component.
- `__tests__/lib/destinations/keys.test.ts` — key round-trip + malformed-input rejection.
- `__tests__/app/api/destinations.test.ts` — handler unit test.
- `__tests__/components/DestinationPicker.test.tsx` — component interaction tests.
- `__tests__/components/ActivityForm.destination.test.tsx` — parked-ERP-fields + submission-body + localStorage behaviors.

**Modified:**
- `lib/outlook/tasks.ts` — `createOutlookTask` accepts optional `listId`.
- `lib/google/tasks.ts` — `createGoogleTask` accepts optional `listId`.
- `app/api/tasks/[source]/route.ts` — `CreateBody` gains `listId?`, `googleTokenId?`, `googleListId?` and plumbs them through.
- `components/ActivityForm.tsx` — replaces `source` state with `destination` state, removes source-tab row, removes Google calendar sub-picker, adds `DestinationPicker`, adds parked-ERP-fields effect, reads/writes localStorage default, rewires submission body off `destination.meta`.
- `components/CalendarShell.tsx` — drops `availableSources` + `userGoogleAccounts` props on the `<ActivityForm>` render.
- `app/design.css` — adds `.destination-picker` + `.destination-color-dot` rules.

---

### Task 1: Destination types + key helpers

**Files:**
- Create: `lib/destinations/types.ts`
- Create: `lib/destinations/keys.ts`
- Test:   `__tests__/lib/destinations/keys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/destinations/keys.test.ts`:

```typescript
import { makeKey, parseDestinationKey } from '@/lib/destinations/keys'
import type { Destination } from '@/lib/destinations/types'

function d(partial: Partial<Destination>): Destination {
  return {
    key: '',
    source: 'herbe',
    label: 'Burti',
    sourceLabel: 'ERP',
    color: '#00AEE7',
    meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
    ...partial,
  } as Destination
}

describe('makeKey', () => {
  it('encodes an ERP destination as herbe:<connectionId>', () => {
    const dest = d({ meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' } })
    expect(makeKey(dest)).toBe('herbe:conn-1')
  })

  it('encodes an Outlook task destination as outlook:<listId>', () => {
    const dest = d({ source: 'outlook', meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' } })
    expect(makeKey(dest)).toBe('outlook:LIST-A')
  })

  it('encodes an Outlook event destination as plain "outlook"', () => {
    const dest = d({ source: 'outlook', meta: { kind: 'outlook-event' } })
    expect(makeKey(dest)).toBe('outlook')
  })

  it('encodes a Google task destination as google:<tokenId>:<listId>', () => {
    const dest = d({
      source: 'google',
      meta: { kind: 'google-task', tokenId: 'TOK-1', listId: 'LIST-9', listName: 'Work', email: 'x@y.z' },
    })
    expect(makeKey(dest)).toBe('google:TOK-1:LIST-9')
  })

  it('encodes a Google event destination as google:<tokenId>:<calendarId>', () => {
    const dest = d({
      source: 'google',
      meta: { kind: 'google-event', tokenId: 'TOK-1', calendarId: 'primary', calendarName: 'Primary', email: 'x@y.z' },
    })
    expect(makeKey(dest)).toBe('google:TOK-1:primary')
  })
})

describe('parseDestinationKey', () => {
  it('parses an ERP key', () => {
    expect(parseDestinationKey('herbe:conn-1')).toEqual({ source: 'herbe', parts: ['conn-1'] })
  })

  it('parses an Outlook task key', () => {
    expect(parseDestinationKey('outlook:LIST-A')).toEqual({ source: 'outlook', parts: ['LIST-A'] })
  })

  it('parses a bare "outlook" key as event destination', () => {
    expect(parseDestinationKey('outlook')).toEqual({ source: 'outlook', parts: [] })
  })

  it('parses a Google key into two parts', () => {
    expect(parseDestinationKey('google:TOK-1:LIST-9')).toEqual({ source: 'google', parts: ['TOK-1', 'LIST-9'] })
  })

  it('returns null for a malformed key', () => {
    expect(parseDestinationKey('')).toBeNull()
    expect(parseDestinationKey('bogus:x')).toBeNull()
    expect(parseDestinationKey('herbe')).toBeNull()      // ERP needs connection id
    expect(parseDestinationKey('google:only-one-part')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/destinations/keys.test.ts`
Expected: FAIL — `Cannot find module '@/lib/destinations/keys'` (and types).

- [ ] **Step 3: Implement the types**

Create `lib/destinations/types.ts`:

```typescript
export type DestinationMode = 'task' | 'event'
export type DestinationSource = 'herbe' | 'outlook' | 'google'

export type DestinationMeta =
  | { kind: 'herbe';         connectionId: string; connectionName: string }
  | { kind: 'outlook-task';  listId: string; listName: string }
  | { kind: 'outlook-event' }
  | { kind: 'google-task';   tokenId: string; listId: string;   listName: string;   email: string }
  | { kind: 'google-event';  tokenId: string; calendarId: string; calendarName: string; email: string }

export interface Destination {
  /** Parseable stable identity — see makeKey / parseDestinationKey. */
  key: string
  source: DestinationSource
  /** Short human label (list/calendar/connection name). */
  label: string
  /** "ERP" | "Outlook" | "Google" — for the source prefix in the dropdown. */
  sourceLabel: string
  /** Hex color for the leading dot. Brand color or per-calendar override. */
  color: string
  meta: DestinationMeta
}
```

- [ ] **Step 4: Implement the key helpers**

Create `lib/destinations/keys.ts`:

```typescript
import type { Destination, DestinationSource } from './types'

export function makeKey(dest: Destination): string {
  switch (dest.meta.kind) {
    case 'herbe':         return `herbe:${dest.meta.connectionId}`
    case 'outlook-task':  return `outlook:${dest.meta.listId}`
    case 'outlook-event': return `outlook`
    case 'google-task':   return `google:${dest.meta.tokenId}:${dest.meta.listId}`
    case 'google-event':  return `google:${dest.meta.tokenId}:${dest.meta.calendarId}`
  }
}

/** Parse a key back into its source + raw parts. Returns null if malformed.
 * The caller still needs to look up the full Destination from a fetched list
 * — parsing alone cannot recover label / color / email / etc. */
export function parseDestinationKey(
  key: string,
): { source: DestinationSource; parts: string[] } | null {
  if (!key) return null
  if (key === 'outlook') return { source: 'outlook', parts: [] }
  const idx = key.indexOf(':')
  if (idx <= 0) return null
  const source = key.slice(0, idx)
  const rest = key.slice(idx + 1)
  if (source !== 'herbe' && source !== 'outlook' && source !== 'google') return null
  const parts = rest.split(':')
  if (parts.length === 0 || parts[0] === '') return null
  if (source === 'google' && parts.length !== 2) return null
  if (source === 'herbe'  && parts.length !== 1) return null
  if (source === 'outlook' && parts.length !== 1) return null
  return { source, parts }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/lib/destinations/keys.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/destinations/types.ts lib/destinations/keys.ts __tests__/lib/destinations/keys.test.ts
git commit -m "feat(destinations): types + key helpers for unified destination picker"
```

---

### Task 2: `/api/destinations` endpoint

**Files:**
- Create: `app/api/destinations/route.ts`
- Test:   `__tests__/app/api/destinations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/app/api/destinations.test.ts`:

```typescript
import { GET } from '@/app/api/destinations/route'
import type { Destination } from '@/lib/destinations/types'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized:   jest.fn(() => new Response(JSON.stringify({ error: 'unauth' }), { status: 401 })),
}))
jest.mock('@/lib/accountConfig', () => ({
  getErpConnections: jest.fn(),
  getAzureConfig:    jest.fn(),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts:   jest.fn(),
  getValidAccessTokenForUser: jest.fn(),
}))

import { requireSession } from '@/lib/herbe/auth-guard'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
import { getUserGoogleAccounts, getValidAccessTokenForUser } from '@/lib/google/userOAuth'

const mockSession = requireSession as jest.Mock
const mockErp = getErpConnections as jest.Mock
const mockAzure = getAzureConfig as jest.Mock
const mockGraph = graphFetch as jest.Mock
const mockAccounts = getUserGoogleAccounts as jest.Mock
const mockToken = getValidAccessTokenForUser as jest.Mock

beforeEach(() => {
  jest.resetAllMocks()
  mockSession.mockResolvedValue({ email: 'x@y.z', accountId: 'acc-1' })
  mockErp.mockResolvedValue([{ id: 'conn-1', name: 'Burti' }])
  mockAzure.mockResolvedValue(null)
  mockAccounts.mockResolvedValue([])
})

function makeReq(mode: 'task' | 'event'): Request {
  return new Request(`http://localhost/api/destinations?mode=${mode}`)
}

describe('GET /api/destinations', () => {
  it('returns 400 if mode is missing or invalid', async () => {
    const res = await GET(new Request('http://localhost/api/destinations'))
    expect(res.status).toBe(400)
  })

  it('task mode: includes ERP destinations', async () => {
    const res = await GET(makeReq('task'))
    const body = await res.json() as Destination[]
    expect(body.some(d => d.source === 'herbe' && d.meta.kind === 'herbe')).toBe(true)
  })

  it('event mode: returns an Outlook event destination when azureConfig exists', async () => {
    mockAzure.mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's' })
    const res = await GET(makeReq('event'))
    const body = await res.json() as Destination[]
    expect(body.some(d => d.meta.kind === 'outlook-event')).toBe(true)
  })

  it('task mode: fetches Outlook To Do lists via Graph', async () => {
    mockAzure.mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's' })
    mockGraph.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [{ id: 'LIST-A', displayName: 'Tasks' }] }),
    } as unknown as Response)
    const res = await GET(makeReq('task'))
    const body = await res.json() as Destination[]
    const outlook = body.find(d => d.meta.kind === 'outlook-task')
    expect(outlook).toBeDefined()
    expect(outlook?.key).toBe('outlook:LIST-A')
  })

  it('task mode: enumerates Google Tasks lists across per-user accounts', async () => {
    mockAccounts.mockResolvedValueOnce([{ id: 'TOK-1', googleEmail: 'x@y.z', calendars: [] }])
    mockToken.mockResolvedValue('ya29.abc')
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () =>
      ({ ok: true, status: 200, text: async () => '',
         json: async () => ({ items: [{ id: 'GL-1', title: 'My Tasks' }] }) }) as unknown as Response
    ) as typeof fetch
    try {
      const res = await GET(makeReq('task'))
      const body = await res.json() as Destination[]
      const g = body.find(d => d.meta.kind === 'google-task')
      expect(g).toBeDefined()
      expect(g?.key).toBe('google:TOK-1:GL-1')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('omits a source that errors instead of failing the whole request', async () => {
    mockErp.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(makeReq('task'))
    expect(res.status).toBe(200)
    const body = await res.json() as Destination[]
    expect(body.every(d => d.source !== 'herbe')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/app/api/destinations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route handler**

Create `app/api/destinations/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
import { getUserGoogleAccounts, getValidAccessTokenForUser } from '@/lib/google/userOAuth'
import type { Destination, DestinationMode } from '@/lib/destinations/types'
import { makeKey } from '@/lib/destinations/keys'

const HERBE_COLOR   = '#00AEE7'
const OUTLOOK_COLOR = '#6264a7'
const GOOGLE_COLOR  = '#4285f4'

export async function GET(req: Request): Promise<Response> {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') as DestinationMode | null
  if (mode !== 'task' && mode !== 'event') {
    return NextResponse.json({ error: 'mode required (task|event)' }, { status: 400 })
  }

  const results: Destination[] = []

  // ERP — same for both modes
  try {
    const conns = await getErpConnections(session.accountId)
    for (const c of conns) {
      const d: Destination = {
        key: '',
        source: 'herbe',
        label: c.name,
        sourceLabel: 'ERP',
        color: HERBE_COLOR,
        meta: { kind: 'herbe', connectionId: c.id, connectionName: c.name },
      }
      d.key = makeKey(d)
      results.push(d)
    }
  } catch (e) { console.warn('[destinations] ERP failed:', e) }

  // Outlook
  try {
    const azure = await getAzureConfig(session.accountId)
    if (azure) {
      if (mode === 'event') {
        const d: Destination = {
          key: '',
          source: 'outlook',
          label: 'Outlook',
          sourceLabel: 'Outlook',
          color: OUTLOOK_COLOR,
          meta: { kind: 'outlook-event' },
        }
        d.key = makeKey(d)
        results.push(d)
      } else {
        const listsRes = await graphFetch(
          `/users/${encodeURIComponent(session.email)}/todo/lists`,
          undefined,
          azure,
        )
        if (listsRes.ok) {
          const body = await listsRes.json() as { value: Array<{ id: string; displayName: string }> }
          for (const l of body.value) {
            const d: Destination = {
              key: '',
              source: 'outlook',
              label: l.displayName,
              sourceLabel: 'Outlook',
              color: OUTLOOK_COLOR,
              meta: { kind: 'outlook-task', listId: l.id, listName: l.displayName },
            }
            d.key = makeKey(d)
            results.push(d)
          }
        }
      }
    }
  } catch (e) { console.warn('[destinations] Outlook failed:', e) }

  // Google (per-user OAuth)
  try {
    const accounts = await getUserGoogleAccounts(session.email, session.accountId)
    for (const acct of accounts) {
      if (mode === 'event') {
        for (const cal of (acct.calendars ?? []).filter((c: { enabled: boolean }) => c.enabled)) {
          const d: Destination = {
            key: '',
            source: 'google',
            label: cal.name,
            sourceLabel: 'Google',
            color: cal.color || GOOGLE_COLOR,
            meta: {
              kind: 'google-event',
              tokenId: acct.id,
              calendarId: cal.calendarId,
              calendarName: cal.name,
              email: acct.googleEmail,
            },
          }
          d.key = makeKey(d)
          results.push(d)
        }
      } else {
        const accessToken = await getValidAccessTokenForUser(acct.id, session.email, session.accountId)
        if (!accessToken) continue
        const r = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        })
        if (!r.ok) continue
        const body = await r.json() as { items?: Array<{ id: string; title: string }> }
        for (const l of body.items ?? []) {
          const d: Destination = {
            key: '',
            source: 'google',
            label: l.title,
            sourceLabel: 'Google',
            color: GOOGLE_COLOR,
            meta: {
              kind: 'google-task',
              tokenId: acct.id,
              listId: l.id,
              listName: l.title,
              email: acct.googleEmail,
            },
          }
          d.key = makeKey(d)
          results.push(d)
        }
      }
    }
  } catch (e) { console.warn('[destinations] Google failed:', e) }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/app/api/destinations.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/destinations/route.ts __tests__/app/api/destinations.test.ts
git commit -m "feat(destinations): GET /api/destinations endpoint for unified picker"
```

---

### Task 3: Backend — Outlook + Google task creation accept `listId`

**Files:**
- Modify: `lib/outlook/tasks.ts`
- Modify: `lib/google/tasks.ts`
- Modify: `app/api/tasks/[source]/route.ts`
- Test:   `__tests__/lib/outlook/tasks.test.ts` (extend)
- Test:   `__tests__/lib/google/tasks.test.ts` (extend)

- [ ] **Step 1: Write failing tests for Outlook**

Append to `__tests__/lib/outlook/tasks.test.ts`:

```typescript
describe('createOutlookTask with explicit listId', () => {
  it('POSTs to the provided listId without resolving the default', async () => {
    mockGraph.mockImplementation(async (path: string) => {
      if (path.endsWith('/todo/lists')) {
        // Should not be called when listId is supplied.
        return { ok: true, json: async () => ({ value: [{ id: 'DEFAULT', displayName: 'Default', wellknownListName: 'defaultList' }] }) } as unknown as Response
      }
      if (path.includes('/todo/lists/EXPLICIT/tasks')) {
        return {
          ok: true,
          json: async () => ({ id: 'new-task', title: 'T', status: 'notStarted' }),
        } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    const task = await createOutlookTask(
      'x@y.z',
      { title: 'T', listId: 'EXPLICIT' },
      { tenantId: 't', clientId: 'c', clientSecret: 's' } as any,
    )
    expect(task.id).toBe('outlook:new-task')
    // Verify the call targeted EXPLICIT, not DEFAULT.
    const paths = mockGraph.mock.calls.map((c: any[]) => c[0] as string)
    expect(paths.some(p => p.includes('/todo/lists/EXPLICIT/tasks') && !p.endsWith('/todo/lists'))).toBe(true)
  })
})
```

- [ ] **Step 2: Write failing tests for Google**

Append to `__tests__/lib/google/tasks.test.ts`:

```typescript
describe('createGoogleTask with explicit listId', () => {
  it('POSTs to the provided listId without resolving the default', async () => {
    const originalFetch = global.fetch
    const calls: string[] = []
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('/lists/EXPLICIT/tasks')) {
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ id: 'new-task', title: 'T', status: 'needsAction' }) } as unknown as Response
      }
      if (u.endsWith('/users/@me/lists')) {
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ items: [{ id: 'DEFAULT', title: 'Default' }] }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch
    // Minimal stub for getValidAccessTokenForUser
    jest.spyOn(require('@/lib/google/userOAuth'), 'getValidAccessTokenForUser').mockResolvedValue('ya29.abc')

    try {
      const task = await createGoogleTask('TOK', 'x@y.z', 'acc', {
        title: 'T', listId: 'EXPLICIT',
      })
      expect(task.id).toBe('google:new-task')
      expect(calls.some(c => c.includes('/lists/EXPLICIT/tasks'))).toBe(true)
    } finally {
      global.fetch = originalFetch
    }
  })
})
```

- [ ] **Step 3: Run both tests to verify failure**

Run: `npx jest __tests__/lib/outlook/tasks.test.ts __tests__/lib/google/tasks.test.ts`
Expected: FAIL — the new tests fail (most likely "listId does not exist on CreateXyzTaskInput"). Pre-existing tests in these files still pass.

- [ ] **Step 4: Update `lib/outlook/tasks.ts`**

Modify `lib/outlook/tasks.ts`. Change the `CreateOutlookTaskInput` interface and the `createOutlookTask` body:

```typescript
export interface CreateOutlookTaskInput {
  title: string
  description?: string
  dueDate?: string
  /** Microsoft Graph To Do list id. If omitted, writes to the user's default list. */
  listId?: string
}

export async function createOutlookTask(
  userEmail: string,
  input: CreateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = input.listId ?? await resolveDefaultListId(userEmail, azureConfig)
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
```

- [ ] **Step 5: Update `lib/google/tasks.ts`**

Modify `lib/google/tasks.ts`. Change the input type + body:

```typescript
export interface CreateGoogleTaskInput {
  title: string
  description?: string
  dueDate?: string
  /** Google Tasks list id. If omitted, writes to the first list returned. */
  listId?: string
}

export async function createGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  input: CreateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  let listId: string
  let listTitle: string
  if (input.listId) {
    listId = input.listId
    // Title is cosmetic for the returned Task; fetch it if we need it, else fall back.
    listTitle = ''
  } else {
    const list = await resolveDefaultGoogleListId(accessToken)
    listId = list.id
    listTitle = list.title
  }
  const payload: Record<string, unknown> = { title: input.title }
  if (input.description) payload.notes = input.description
  if (input.dueDate) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${listId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
  const created = await res.json() as GoogleTaskApi
  return mapGoogleTask(created, listTitle)
}
```

- [ ] **Step 6: Update `app/api/tasks/[source]/route.ts`**

Add the new fields to `CreateBody` and plumb them through the Outlook + Google branches:

```typescript
interface CreateBody {
  title: string
  description?: string
  dueDate?: string
  connectionId?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
  ccPersons?: string[]
  /** Outlook task list id (unified destination picker). */
  listId?: string
  /** Google per-user OAuth token row id (unified destination picker). */
  googleTokenId?: string
  /** Google Tasks list id (unified destination picker). */
  googleListId?: string
}
```

Replace the Outlook branch body:

```typescript
    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await createOutlookTask(session.email, {
        title: body.title, description: body.description, dueDate: body.dueDate,
        listId: body.listId,
      }, azure)
      await writeThroughTask(session.accountId, session.email, 'outlook', task)
      return NextResponse.json({ ok: true, task })
    }
```

Replace the Google branch body:

```typescript
    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = body.googleTokenId ?? accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await createGoogleTask(tokenId, session.email, session.accountId, {
        title: body.title, description: body.description, dueDate: body.dueDate,
        listId: body.googleListId,
      })
      await writeThroughTask(session.accountId, session.email, 'google', task)
      return NextResponse.json({ ok: true, task })
    }
```

- [ ] **Step 7: Run the updated suites to verify pass**

Run: `npx jest __tests__/lib/outlook/tasks.test.ts __tests__/lib/google/tasks.test.ts`
Expected: PASS — all prior tests + the 2 new "with explicit listId" tests.

- [ ] **Step 8: Commit**

```bash
git add lib/outlook/tasks.ts lib/google/tasks.ts app/api/tasks/[source]/route.ts __tests__/lib/outlook/tasks.test.ts __tests__/lib/google/tasks.test.ts
git commit -m "feat(tasks): createOutlookTask + createGoogleTask accept explicit listId"
```

---

### Task 4: `DestinationPicker` component

**Files:**
- Create: `components/DestinationPicker.tsx`
- Test:   `__tests__/components/DestinationPicker.test.tsx`
- Modify: `app/design.css` (add rules)

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/DestinationPicker.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DestinationPicker } from '@/components/DestinationPicker'
import type { Destination } from '@/lib/destinations/types'

function mockFetchOnce(data: Destination[]) {
  global.fetch = jest.fn(async () =>
    ({ ok: true, status: 200, json: async () => data }) as unknown as Response,
  ) as typeof fetch
}

const ERP_BURTI: Destination = {
  key: 'herbe:conn-1', source: 'herbe', label: 'Burti', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
}
const OUTLOOK_TASKS: Destination = {
  key: 'outlook:LIST-A', source: 'outlook', label: 'Tasks', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' },
}

afterEach(() => { jest.restoreAllMocks() })

it('renders optgroups per source with prefixed option labels', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
  expect(screen.getByRole('group', { name: 'ERP' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Outlook' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /ERP · Burti/ })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Outlook · Tasks/ })).toBeInTheDocument()
})

it('calls onChange with the full Destination when the user picks one', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const select = await screen.findByRole('combobox')
  fireEvent.change(select, { target: { value: 'outlook:LIST-A' } })
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_TASKS)
})

it('renders a disabled empty-state when no destinations come back', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  const select = await screen.findByRole('combobox')
  expect(select).toBeDisabled()
  expect(screen.getByText(/no destinations/i)).toBeInTheDocument()
})

it('uses the correct endpoint for event mode', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="event" value={null} onChange={() => {}} />)
  await screen.findByRole('combobox')
  const fetchMock = global.fetch as jest.Mock
  expect(fetchMock).toHaveBeenCalledWith('/api/destinations?mode=event')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/DestinationPicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/DestinationPicker.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Destination, DestinationMode } from '@/lib/destinations/types'

interface Props {
  mode: DestinationMode
  value: string | null
  onChange: (dest: Destination) => void
}

const SOURCE_ORDER: Record<string, number> = { ERP: 0, Outlook: 1, Google: 2 }

export function DestinationPicker({ mode, value, onChange }: Props) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/destinations?mode=${mode}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Destination[]) => { if (!cancelled) setDestinations(list) })
      .catch(() => { if (!cancelled) setDestinations([]) })
    return () => { cancelled = true }
  }, [mode])

  const grouped = useMemo(() => {
    const by = new Map<string, Destination[]>()
    for (const d of destinations ?? []) {
      const bucket = by.get(d.sourceLabel) ?? []
      bucket.push(d)
      by.set(d.sourceLabel, bucket)
    }
    return [...by.entries()]
      .sort((a, b) => (SOURCE_ORDER[a[0]] ?? 99) - (SOURCE_ORDER[b[0]] ?? 99))
      .map(([label, items]) => [label, items.slice().sort((x, y) => x.label.localeCompare(y.label))] as const)
  }, [destinations])

  if (destinations === null) {
    return (
      <div className="destination-picker">
        <label className="aed-label">Destination</label>
        <select className="select-field aed-input" disabled value="">
          <option value="">Loading destinations…</option>
        </select>
      </div>
    )
  }

  if (destinations.length === 0) {
    return (
      <div className="destination-picker">
        <label className="aed-label">Destination</label>
        <select className="select-field aed-input" disabled value="">
          <option value="">No destinations configured</option>
        </select>
      </div>
    )
  }

  const currentColor = destinations.find(d => d.key === value)?.color

  return (
    <div className="destination-picker">
      <label className="aed-label">Destination</label>
      <div className="destination-picker-row">
        {currentColor && (
          <span className="destination-color-dot" style={{ background: currentColor }} aria-hidden="true" />
        )}
        <select
          className="select-field aed-input"
          value={value ?? ''}
          onChange={e => {
            const dest = (destinations ?? []).find(d => d.key === e.target.value)
            if (dest) onChange(dest)
          }}
        >
          {grouped.map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map(d => (
                <option key={d.key} value={d.key}>
                  {d.sourceLabel} · {d.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS rules**

Append to `app/design.css`:

```css
.destination-picker { margin-top: 6px; }
.destination-picker-row {
  display: flex; align-items: center; gap: 6px;
}
.destination-color-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/components/DestinationPicker.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add components/DestinationPicker.tsx __tests__/components/DestinationPicker.test.tsx app/design.css
git commit -m "feat(destinations): DestinationPicker component + CSS"
```

---

### Task 5: `ActivityForm` refactor — destination state, parked ERP fields, localStorage default

**Files:**
- Modify: `components/ActivityForm.tsx`
- Test:   `__tests__/components/ActivityForm.destination.test.tsx`

This task is large and touches many sites. Do it atomically — the intermediate state where `source` state has been removed but sites that read it haven't been migrated does not compile. The file must be left compilable at each commit.

- [ ] **Step 1: Write failing behavioral tests first**

Create `__tests__/components/ActivityForm.destination.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ActivityForm } from '@/components/ActivityForm'
import type { Destination } from '@/lib/destinations/types'

const ERP_BURTI: Destination = {
  key: 'herbe:conn-1', source: 'herbe', label: 'Burti', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
}
const OUTLOOK_TASKS: Destination = {
  key: 'outlook:LIST-A', source: 'outlook', label: 'Tasks', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' },
}

function mockDestinations(list: Destination[]) {
  global.fetch = jest.fn(async (url: unknown) => {
    if (String(url).startsWith('/api/destinations')) {
      return { ok: true, status: 200, json: async () => list } as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response
  }) as typeof fetch
}

function commonProps(overrides: Record<string, unknown> = {}) {
  return {
    people: [],
    allActivities: [],
    onClose: () => {},
    onSaved: () => {},
    onDuplicate: () => {},
    erpConnections: [{ id: 'conn-1', name: 'Burti' }],
    mode: 'task' as const,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

it('falls back to the first destination when localStorage default is invalid', async () => {
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS])
  localStorage.setItem('defaultDestination:task', 'google:DELETED:ALSODELETED')
  render(<ActivityForm {...commonProps()} />)
  const select = await screen.findByRole('combobox', { name: /destination/i })
  // ERP_BURTI is the first in the sort order
  expect((select as HTMLSelectElement).value).toBe('herbe:conn-1')
})

it('pre-selects the localStorage default when it is still valid', async () => {
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS])
  localStorage.setItem('defaultDestination:task', 'outlook:LIST-A')
  render(<ActivityForm {...commonProps()} />)
  const select = await screen.findByRole('combobox', { name: /destination/i })
  expect((select as HTMLSelectElement).value).toBe('outlook:LIST-A')
})
```

(More behavioral tests — parked ERP fields, submission-body stripping, successful-save localStorage write — belong in follow-up iterations since they require deep form-interaction mocks. The two above pin the mount-time contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/ActivityForm.destination.test.tsx`
Expected: FAIL — "destination" label not found / wrong value.

- [ ] **Step 3: Refactor `components/ActivityForm.tsx`**

Apply the following changes. The approach is: **keep the `isGoogleSource` / `isExternalCalSource` / `isErpSource` / `activeErpConnection` derived booleans by NAME**, but change their backing from `source` state to `destination` state. This way the ~50 downstream reads of those booleans are unaffected.

**3a — Update the props interface (delete `availableSources` + `userGoogleAccounts`):**

At the top of the interface (around line 75–80), find:

```typescript
  availableSources?: { herbe: boolean; azure: boolean; google?: boolean }
  userGoogleAccounts?: UserGoogleAccount[]
```

Remove both lines. Also remove the import of `UserGoogleAccount` if it becomes unused (grep to confirm).

**3b — Update the destructuring (around line 95):**

Find:

```typescript
  initial, editId, people, defaultPersonCode, defaultPersonCodes, allActivities, onClose, onSaved, onDuplicate, onRsvp, canEdit = true, getTypeColor, getTypeGroup, companyCode = '1', allCustomers, allProjects, allItems, erpConnections = [], availableSources, userGoogleAccounts, zoomConfigured, mode = 'event'
```

Remove `availableSources, userGoogleAccounts,` from that list.

**3c — Replace the `source` state + derived booleans (around lines 102–119) with a `destination` state:**

Replace:

```typescript
  const [source, setSource] = useState<string>(() => {
    if (initial?.source === 'outlook') return 'outlook'
    if (initial?.source === 'google') return 'google'
    ...
  })
  ...
  const isOutlookSource = source === 'outlook'
  const isGoogleSource = source === 'google'
  const isExternalCalSource = isOutlookSource || isGoogleSource
  const isErpSource = !isExternalCalSource
  const activeErpConnection = erpConnections.find(c => c.id === source)
```

With:

```typescript
  const [destination, setDestination] = useState<Destination | null>(null)

  const isOutlookSource    = destination?.source === 'outlook'
  const isGoogleSource     = destination?.source === 'google'
  const isExternalCalSource = isOutlookSource || isGoogleSource
  const isErpSource        = destination?.source === 'herbe'
  const activeErpConnection = destination?.meta.kind === 'herbe'
    ? erpConnections.find(c => c.id === destination.meta.connectionId)
    : undefined
```

Add the `Destination` import at the top of the file:

```typescript
import type { Destination } from '@/lib/destinations/types'
```

**3d — Remove the `selectedGoogleCalendar` state (around line 175):**

Find and delete:

```typescript
  const [selectedGoogleCalendar, setSelectedGoogleCalendar] = useState<string>(() => {
    try { return localStorage.getItem('lastGoogleCalendar') ?? '' } catch { return '' }
  })
```

**3e — Add parked-ERP-fields ref + sync effect** (insert after the existing `attendeeRecalcDone` block, around line 243):

```typescript
  const parkedErpFields = useRef({
    activityTypeCode: '',
    projectCode: '',
    customerCode: '',
    ccPersons: [] as string[],
  })

  useEffect(() => {
    if (!destination) return
    if (destination.source === 'herbe') {
      setActivityTypeCode(parkedErpFields.current.activityTypeCode)
      setProjectCode(parkedErpFields.current.projectCode)
      setCustomerCode(parkedErpFields.current.customerCode)
      setSelectedCcCodes(parkedErpFields.current.ccPersons)
    } else {
      parkedErpFields.current = {
        activityTypeCode,
        projectCode,
        customerCode,
        ccPersons: selectedCcCodes,
      }
    }
  }, [destination?.key])  // eslint-disable-line react-hooks/exhaustive-deps
```

(If `setActivityTypeCode` / `setProjectCode` / `setCustomerCode` / `setSelectedCcCodes` aren't the exact setter names — grep to confirm, and adjust. They're defined alongside `[activityTypeCode, setActivityTypeCode] = useState(...)` patterns elsewhere in the file.)

**3f — Replace the `[source]` dependency in the activity-type loader effect (line 353):**

Find:

```typescript
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:

```typescript
  }, [destination?.key]) // eslint-disable-line react-hooks/exhaustive-deps
```

**3g — Fix the Google-edit param block** (around lines 712–725). This block currently uses `selectedGoogleCalendar` to build POST params on create. Replace it:

Find:

```typescript
      if (isGoogleSource && !isEdit && selectedGoogleCalendar) {
        const [tokenId, calendarId] = selectedGoogleCalendar.split(':')
```

Replace with:

```typescript
      if (isGoogleSource && !isEdit && destination?.meta.kind === 'google-event') {
        const tokenId = destination.meta.tokenId
        const calendarId = destination.meta.calendarId
```

**3h — Update the task POST body for Outlook + Google task mode.** Find the `onSaveTask` (or similar) path that builds the POST body to `/api/tasks/<source>`. The exact lines depend on the form's submission code; search for `/api/tasks/` in ActivityForm.tsx. Wherever Google task creation is built, add:

```typescript
      if (destination?.meta.kind === 'google-task') {
        body.googleTokenId = destination.meta.tokenId
        body.googleListId = destination.meta.listId
      }
      if (destination?.meta.kind === 'outlook-task') {
        body.listId = destination.meta.listId
      }
      if (destination?.meta.kind === 'herbe') {
        body.connectionId = destination.meta.connectionId
      }
```

(If the submission code already passes `connectionId` for ERP by a different path, don't duplicate — check before adding.)

**3i — Remove the source-tab row** (lines 1211–1242):

Delete the entire block:

```tsx
          {/* Source toggle (create only) */}
          {!isEdit && (
            <div className="aed-tabs">
              ...
              {(availableSources?.google || (mode === 'task' && (userGoogleAccounts?.length ?? 0) > 0)) && (
                ...Google...
              )}
            </div>
          )}
```

**3j — Remove the Google calendar sub-picker** (lines 1232–1255 as reported by grep after 3i's delete — count your lines):

Delete the entire block:

```tsx
          {/* Google calendar sub-picker (event mode only — task mode has no concept of calendars) */}
          {!isEdit && isGoogleSource && mode !== 'task' && userGoogleAccounts && userGoogleAccounts.length > 0 && (
            <div className="mt-2">
              <label className="aed-label">Calendar</label>
              <select ... >
                ...
              </select>
            </div>
          )}
```

**3k — Insert the `DestinationPicker` + destination label** in place of what you just removed:

```tsx
          {!isEdit && (
            <DestinationPicker
              mode={mode}
              value={destination?.key ?? null}
              onChange={(next) => {
                setDestination(next)
              }}
            />
          )}
          {isEdit && initial && (
            <div className="destination-picker">
              <label className="aed-label">Destination</label>
              <div className="destination-picker-row">
                <span className="destination-sourcelabel-readonly">
                  {initial.source === 'herbe' ? 'ERP' : initial.source === 'outlook' ? 'Outlook' : initial.source === 'google' ? 'Google' : '—'}
                  {initial.listName ? ` · ${initial.listName}` : ''}
                </span>
              </div>
            </div>
          )}
```

And import `DestinationPicker` at the top of the file:

```typescript
import { DestinationPicker } from './DestinationPicker'
```

**3l — localStorage default: mount + write-on-success.**

Add a mount effect that reads the localStorage default and waits for `DestinationPicker` to resolve. Since `DestinationPicker` owns the fetch, the form observes destination through its `onChange`. On the picker's first non-null onChange we have destinations-loaded. Easiest pattern: expose the resolved default lookup inside `DestinationPicker`.

Change `DestinationPicker` signature to accept an `initialKey?: string | null` and internally resolve it + auto-fire `onChange` once:

Modify `components/DestinationPicker.tsx`. Replace the component body with:

```tsx
export function DestinationPicker({ mode, value, initialKey, onChange }: Props & { initialKey?: string | null }) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/destinations?mode=${mode}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Destination[]) => {
        if (cancelled) return
        setDestinations(list)
        if (!fired.current && list.length > 0 && value === null) {
          fired.current = true
          const preferred = initialKey ? list.find(d => d.key === initialKey) : undefined
          onChange(preferred ?? list[0])
        }
      })
      .catch(() => { if (!cancelled) setDestinations([]) })
    return () => { cancelled = true }
  }, [mode])
  // ...rest unchanged
}
```

Also add `useRef` to imports.

In `ActivityForm.tsx`, read the localStorage default at mount and pass through:

```tsx
  const initialDestinationKey = useMemo(() => {
    try { return localStorage.getItem(`defaultDestination:${mode}`) } catch { return null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
```

Add `useMemo` to imports if missing.

Pass it to the picker render:

```tsx
          {!isEdit && (
            <DestinationPicker
              mode={mode}
              value={destination?.key ?? null}
              initialKey={initialDestinationKey}
              onChange={(next) => setDestination(next)}
            />
          )}
```

**3m — Write localStorage on successful save.** Find the success branch after save (usually where `onSaved(...)` is called). Add, near the call:

```typescript
      try {
        if (destination && !isEdit) {
          localStorage.setItem(`defaultDestination:${mode}`, destination.key)
        }
      } catch {}
```

(If there are multiple success branches — one per source — apply to each, or refactor to a single `onSaveSuccess` helper. Don't write on delete / on close.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean for `components/ActivityForm.tsx`, `components/DestinationPicker.tsx`, and the new tests. Unrelated pre-existing errors in `smtp.test.ts` / `emailForCode.test.ts` / `google/client.test.ts` may still be present; ignore those.

If `ActivityForm.tsx` has remaining errors, they will be `Cannot find name 'availableSources'`, `Cannot find name 'userGoogleAccounts'`, or `Cannot find name 'selectedGoogleCalendar'`. Remove the remaining sites one by one until clean.

- [ ] **Step 5: Run ActivityForm tests**

Run: `npx jest __tests__/components/ActivityForm.destination.test.tsx __tests__/components/ActivityForm.test.tsx 2>/dev/null || true`

Expected: the two new destination tests PASS; any pre-existing ActivityForm tests either still pass or have been broken by prop-removal. If a pre-existing test explicitly passes `availableSources` or `userGoogleAccounts`, remove those props from the test's render call (they no longer exist on the component).

- [ ] **Step 6: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: PASS. The 4 pre-existing failures from `activityColors` / `herbe/taskRecordUtils` / `herbe/errors` may still be present — those are independent of this change (verified earlier at commit `4a690d9`).

- [ ] **Step 7: Commit**

```bash
git add components/ActivityForm.tsx components/DestinationPicker.tsx __tests__/components/ActivityForm.destination.test.tsx
git commit -m "feat(form): replace source-tab row with unified DestinationPicker"
```

---

### Task 6: `CalendarShell` prop cleanup

**Files:**
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Find the `<ActivityForm>` render site**

Run: `grep -n "ActivityForm\|availableSources\|userGoogleAccounts" /Users/elviskvalbergs/AI/herbe-calendar/components/CalendarShell.tsx | head -10`

Expected: you see the single render of `<ActivityForm>` around line 1175 passing `availableSources={sources}` and `userGoogleAccounts={userGoogleAccounts}`.

- [ ] **Step 2: Remove those two props from the `<ActivityForm>` render**

Edit `components/CalendarShell.tsx`: delete the `availableSources={sources}` line and the `userGoogleAccounts={userGoogleAccounts}` line from the `<ActivityForm ... />` invocation. Everything else stays.

Leave the `sources` state and the `userGoogleAccounts` state in `CalendarShell` alone — both are used by other code paths (visibility toggles, per-user OAuth for event creation elsewhere, etc.). We're only decoupling the form from them.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/CalendarShell|components/ActivityForm" || echo clean`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add components/CalendarShell.tsx
git commit -m "refactor(form): drop availableSources + userGoogleAccounts props from ActivityForm"
```

---

### Task 7: Final suite + manual smoke

- [ ] **Step 1: Full suite**

Run: `npm test 2>&1 | tail -8`
Expected: PASS. Task-related (destinations + DestinationPicker + ActivityForm) tests all green.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -vE "__tests__/lib/smtp|__tests__/lib/emailForCode|__tests__/lib/google/client" | head -20`
Expected: no output (or only unrelated pre-existing errors).

- [ ] **Step 3: Start dev server and exercise the form**

Run: `npm run dev` in one terminal.

In a browser, open the calendar, click the tasks-sidebar "+" (task creation) and confirm:
1. The source-tab row is gone.
2. A "Destination" dropdown appears with entries from all configured sources, grouped by source.
3. Picking a non-ERP destination hides ERP-only fields (activity type / project / customer).
4. Picking an ERP destination restores whatever ERP values you had typed before switching away.
5. Creating a task succeeds and writes to the chosen list (check the sidebar after refresh).
6. Close the form without saving, reopen → the previous destination is pre-selected.
7. Save a task with a new destination → close → reopen → the new destination is pre-selected (localStorage default updated).

Also exercise event creation (click an empty calendar slot) and confirm the same dropdown appears with calendar destinations (not task lists). Google calendar sub-picker is gone; the dropdown covers it.

If any step fails, stop and report BLOCKED with specifics.

- [ ] **Step 4: No extra commit — feature is complete.**

---

## Notes for the implementer

- **Why not a combobox library?** Native `<select>` has free accessibility, free mobile UX, and the destination count is small enough that searching isn't needed. If destinations ever get into the hundreds, revisit.
- **Why read-on-mount but write-on-save?** Writing every `onChange` would let a cancelled experiment overwrite a known-good default. The "last successful save" heuristic is what users expect from sticky fields.
- **Why keep `isGoogleSource` / `isExternalCalSource` naming?** ~50 sites use these booleans. Changing the naming would bloat the diff with mechanical renames and make review harder. The backing changes; the interface doesn't.
- **Why no `connectionId` state for ERP?** Previously `source` held the ERP connection id directly (e.g. `source = 'conn-1'`). Now `destination.meta.connectionId` holds it. All submission paths read it the same way.
- **Pre-existing test failures** in `activityColors` / `herbe/taskRecordUtils` / `herbe/errors` / `smtp` / `emailForCode` / `google/client` predate this branch (last touched at `0a8cc3a` and earlier). Not this plan's concern; don't try to fix.

## Out of scope (explicitly deferred)

- Server-side user preferences for defaults.
- Move/reparent existing tasks or events between destinations (including Outlook delete+recreate).
- Multi-Google-account UX beyond "list all, prefix with email when >1 account".
- Search/filter inside the dropdown.
- Color overrides on Outlook / ERP destinations.
- Telemetry.
