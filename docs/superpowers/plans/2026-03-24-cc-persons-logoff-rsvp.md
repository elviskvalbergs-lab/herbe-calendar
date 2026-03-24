# CC Persons, Logoff, Teams Button, RSVP & Read-only Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CC persons to Herbe activities, RSVP support for Outlook events, an "Open in Teams" button, read-only locking when the user cannot edit, and a logoff button replacing the unused desktop refresh button.

**Architecture:** New fields (`ccPersons`, `rsvpStatus`) are added to the `Activity` type and mapped in API routes. CC rows are emitted server-side so the existing `CalendarGrid` filter works unchanged. All new UI is in `ActivityForm` and `ActivityBlock`; `canEdit` checks are extended at both server and client call sites.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Jest + ts-jest (node env), Microsoft Graph API via existing `graphFetch` helper.

---

## File Map

| File | Change |
|------|--------|
| `types/index.ts` | Add `ccPersons`, `rsvpStatus` fields to `Activity` |
| `lib/recentItems.ts` | Add `getRecentCCPersons` / `saveRecentCCPersons` |
| `app/api/activities/route.ts` | `mapActivity` emits CC rows; `toHerbeForm` gets `allowEmptyFields`; POST includes `CCPersons` |
| `app/api/activities/[id]/route.ts` | `canEdit` includes `CCPersons`; PUT passes `allowEmptyFields` |
| `app/api/outlook/route.ts` | Map `rsvpStatus` from Graph `responseStatus` |
| `app/api/outlook/[id]/rsvp/route.ts` | **New** — POST handler for Accept/Decline/Tentative |
| `components/ActivityBlock.tsx` | CC visual style; persons row (main + CC pips); "Open in Teams" button in hover card |
| `components/PersonColumn.tsx` | `canEdit` includes `ccPersons`; derive `isCC` per activity; pass to `ActivityBlock` |
| `components/CalendarShell.tsx` | `canEditActivity` includes `ccPersons` (second client-side call site) |
| `components/ActivityForm.tsx` | CC persons section; RSVP buttons; "Open in Teams" button; read-only lock |
| `components/CalendarHeader.tsx` | Logoff button replaces refresh; mobile hamburger gets Sign out |
| `__tests__/api/activities.test.ts` | Tests for CC row emission, `toHerbeForm` empty-field passthrough |
| `__tests__/api/outlook-rsvp.test.ts` | **New** — Tests for RSVP route (action validation, session email) |
| `__tests__/lib/recentItems.test.ts` | **New** — Tests for `saveRecentCCPersons` |

---

## Task 1: Data model — add `ccPersons` and `rsvpStatus` to Activity

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add fields to Activity interface**

In `types/index.ts`, after the `joinUrl` field, add:

```ts
ccPersons?: string[]   // Herbe CCPersons field — comma-split
rsvpStatus?: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'organizer'
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (new optional fields break nothing).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add ccPersons and rsvpStatus fields to Activity type"
```

---

## Task 2: `lib/recentItems.ts` — CC persons recent tracking

**Files:**
- Modify: `lib/recentItems.ts`
- Create: `__tests__/lib/recentItems.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/recentItems.test.ts`:

```ts
import { getRecentCCPersons, saveRecentCCPersons } from '@/lib/recentItems'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

beforeEach(() => localStorageMock.clear())

describe('recentCCPersons', () => {
  it('returns empty array when nothing saved', () => {
    expect(getRecentCCPersons()).toEqual([])
  })

  it('saves and retrieves CC persons', () => {
    saveRecentCCPersons(['ARA', 'EKS'])
    expect(getRecentCCPersons()).toEqual(['ARA', 'EKS'])
  })

  it('prepends new codes and deduplicates', () => {
    saveRecentCCPersons(['ARA'])
    saveRecentCCPersons(['EKS', 'ARA'])
    expect(getRecentCCPersons()).toEqual(['EKS', 'ARA'])
  })

  it('limits to 6 entries', () => {
    saveRecentCCPersons(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
    expect(getRecentCCPersons()).toHaveLength(6)
  })

  it('does nothing when passed empty array', () => {
    saveRecentCCPersons(['ARA'])
    saveRecentCCPersons([])
    expect(getRecentCCPersons()).toEqual(['ARA'])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/lib/recentItems.test.ts --no-coverage
```
Expected: FAIL — `getRecentCCPersons is not a function`

- [ ] **Step 3: Implement in `lib/recentItems.ts`**

Add below the existing `saveRecentPersons` function. Note: `MAX_RECENT` is already defined in `lib/recentItems.ts` (used by the existing main-persons functions) — do not redefine it.

```ts
const RECENT_CC_PERSONS_KEY = 'recentCCPersons'

export function getRecentCCPersons(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENT_CC_PERSONS_KEY) ?? '[]') } catch { return [] }
}

export function saveRecentCCPersons(codes: string[]): void {
  if (typeof window === 'undefined' || codes.length === 0) return
  const existing = getRecentCCPersons()
  const merged = [...codes, ...existing.filter(c => !codes.includes(c))].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_CC_PERSONS_KEY, JSON.stringify(merged))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/lib/recentItems.test.ts --no-coverage
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/recentItems.ts __tests__/lib/recentItems.test.ts
git commit -m "feat: add recent CC persons tracking to recentItems"
```

---

## Task 3: `toHerbeForm` — support empty-string passthrough for specific fields

**Files:**
- Modify: `app/api/activities/route.ts` (lines ~102–110)
- Modify: `app/api/activities/[id]/route.ts` (lines ~22–30)
- Modify: `__tests__/api/activities.test.ts`

- [ ] **Step 1: Add failing test for empty-string passthrough**

Add to `__tests__/api/activities.test.ts`:

```ts
// Import toHerbeForm — it is not exported yet; we'll export it in the next step
import { toHerbeForm } from '@/app/api/activities/route'

describe('toHerbeForm', () => {
  it('omits empty strings by default', () => {
    const result = toHerbeForm({ Comment: '', ActType: 'DESK' })
    expect(result).not.toContain('Comment')
    expect(result).toContain('ActType')
  })

  it('passes through empty string when field is in allowEmptyFields', () => {
    const result = toHerbeForm({ CCPersons: '' }, new Set(['CCPersons']))
    expect(result).toContain('CCPersons')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/activities.test.ts --no-coverage
```
Expected: FAIL — `toHerbeForm is not exported`

- [ ] **Step 3: Update `toHerbeForm` in `app/api/activities/route.ts`**

Change the function signature and filter line:

```ts
export function toHerbeForm(
  data: Record<string, unknown>,
  allowEmptyFields: Set<string> = new Set()
): string {
  return Object.entries(data)
    .filter(([k, v]) => v !== undefined && v !== null && (v !== '' || allowEmptyFields.has(k)))
    .map(([k, v]) => {
      if (k === 'Text') return `set_row_field.0.Text=${encodeURIComponent(String(v))}`
      return `set_field.${k}=${encodeURIComponent(String(v))}`
    })
    .join('&')
}
```

`export` is added so the test can import it. Behaviour is identical to before for callers that don't pass `allowEmptyFields`.

- [ ] **Step 4: Update `toHerbeForm` in `app/api/activities/[id]/route.ts`**

This file has its own copy of `toHerbeForm`. Replace it with an import:

```ts
import { toHerbeForm } from '../route'
```

Remove the local `toHerbeForm` definition entirely. (It is identical except for the missing export.)

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest __tests__/api/activities.test.ts --no-coverage
```
Expected: PASS

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/api/activities/route.ts app/api/activities/[id]/route.ts __tests__/api/activities.test.ts
git commit -m "feat: allow empty-string passthrough in toHerbeForm for specific fields"
```

---

## Task 4: `mapActivity` — emit CC rows + include `CCPersons` in POST/PATCH payload

**Files:**
- Modify: `app/api/activities/route.ts`
- Modify: `__tests__/api/activities.test.ts`

- [ ] **Step 1: Write failing tests for CC row emission**

Add to `__tests__/api/activities.test.ts`:

```ts
import { herbeFetchAll } from '@/lib/herbe/client'

describe('GET /api/activities — CC persons', () => {
  it('emits a CC row for a person listed only in CCPersons', async () => {
    (herbeFetchAll as jest.Mock).mockResolvedValueOnce([
      {
        SerNr: '42',
        MainPersons: 'EKS',
        CCPersons: 'ARA',
        Comment: 'Test activity',
        TransDate: '2026-03-24',
        StartTime: '090000',
        EndTime: '103000',
        CalTimeFlag: '1',
      },
    ])
    const req = new Request('http://localhost/api/activities?persons=EKS,ARA&date=2026-03-24')
    const res = await GET(req)
    const body = await res.json()
    // Should have two rows: one for EKS (main), one for ARA (CC)
    expect(body).toHaveLength(2)
    const ccRow = body.find((a: { personCode: string }) => a.personCode === 'ARA')
    expect(ccRow).toBeDefined()
    expect(ccRow.ccPersons).toContain('ARA')
    expect(ccRow.mainPersons).toContain('EKS')
  })

  it('does not emit a CC row if person is already a main person', async () => {
    (herbeFetchAll as jest.Mock).mockResolvedValueOnce([
      {
        SerNr: '43',
        MainPersons: 'EKS,ARA',
        CCPersons: 'ARA',
        Comment: 'Both',
        TransDate: '2026-03-24',
        StartTime: '090000',
        EndTime: '100000',
        CalTimeFlag: '1',
      },
    ])
    const req = new Request('http://localhost/api/activities?persons=EKS,ARA&date=2026-03-24')
    const res = await GET(req)
    const body = await res.json()
    const araRows = body.filter((a: { personCode: string }) => a.personCode === 'ARA')
    expect(araRows).toHaveLength(1)  // only the main row, not an additional CC row
    expect(araRows[0].mainPersons).toContain('ARA')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/activities.test.ts --no-coverage -t "CC persons"
```
Expected: FAIL

- [ ] **Step 3: Update `mapActivity` in `app/api/activities/route.ts`**

Add `ccPersons` parsing to `mapActivity`:

```ts
function mapActivity(r: Record<string, unknown>, personCode: string): Activity {
  const mainPersonsRaw = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ccPersonsRaw = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return {
    // ... all existing fields unchanged ...
    mainPersons: mainPersonsRaw.length ? mainPersonsRaw : undefined,
    ccPersons: ccPersonsRaw.length ? ccPersonsRaw : undefined,
    // ... rest of existing fields ...
  }
}
```

Then in the GET handler, after building the per-main-person rows, add CC rows. The current GET handler (lines 35–69) iterates `personList` and filters `raw.filter(r => mainPersonsArr.includes(p))`. After collecting `results`, add:

```ts
// Emit CC rows for persons in CCPersons but NOT already in MainPersons
for (const record of raw) {
  const r = record as Record<string, unknown>
  const mainPersonsArr = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ccPersonsArr = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  for (const ccCode of ccPersonsArr) {
    if (personList.includes(ccCode) && !mainPersonsArr.includes(ccCode)) {
      results.push(mapActivity(r, ccCode))
    }
  }
}
```

- [ ] **Step 4: Update POST payload in `app/api/activities/route.ts`**

In the POST handler's `body` construction (around line 120), the body comes from `req.json()`. Pass `allowEmptyFields` when calling `toHerbeForm`:

```ts
const encodedBody = toHerbeForm(body, new Set(['CCPersons']))
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest __tests__/api/activities.test.ts --no-coverage
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/activities/route.ts __tests__/api/activities.test.ts
git commit -m "feat: emit CC person rows from activities API and include CCPersons in payload"
```

---

## Task 5: `[id]/route.ts` — extend server-side `canEdit` to include CC persons

**Files:**
- Modify: `app/api/activities/[id]/route.ts`

- [ ] **Step 1: Update `canEdit` function**

The current `canEdit` (lines 43–49) checks `MainPersons` and `AccessGroup`. Add `CCPersons`:

```ts
function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const mainPersons = String(activity['MainPersons'] ?? '').split(',').map(s => s.trim())
  if (mainPersons.includes(userCode)) return true
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
  if (accessGroup?.split(',').map(s => s.trim()).includes(userCode)) return true
  const ccPersons = String(activity['CCPersons'] ?? '').split(',').map(s => s.trim())
  if (ccPersons.includes(userCode)) return true
  return false
}
```

- [ ] **Step 2: Add tests for `canEdit` extension**

Add to `__tests__/api/activities.test.ts`:

```ts
describe('PUT /api/activities/[id] — canEdit with CC persons', () => {
  it('allows edit when user is a CC person', async () => {
    // Mock Herbe API to return an activity where CCPersons includes the session user
    // and MainPersons does not — verify the PUT returns 200 not 403
    // (Use the existing auth mock to set session user code)
    // This test structure mirrors existing canEdit tests in the file
  })

  it('denies edit when user is neither main, access, nor CC', async () => {
    // Mock Herbe API to return activity where user is absent from all lists
    // Verify PUT returns 403
  })
})
```

Adapt to match the existing mock/helper patterns already in the test file. The key assertions are: `canEdit(activityWithUserInCC, userCode)` returns `true`, and `canEdit(activityWithUserAbsent, userCode)` returns `false`.

- [ ] **Step 3: Update PUT handler to pass `allowEmptyFields`**

In the PUT handler, find the `toHerbeForm(body)` call and change to:

```ts
const encodedBody = toHerbeForm(body, new Set(['CCPersons']))
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/activities/[id]/route.ts __tests__/api/activities.test.ts
git commit -m "feat: include CC persons in server-side canEdit check"
```

---

## Task 6: Outlook API — map `rsvpStatus` + new RSVP route

**Files:**
- Modify: `app/api/outlook/route.ts`
- Create: `app/api/outlook/[id]/rsvp/route.ts`
- Create: `__tests__/api/outlook-rsvp.test.ts`

- [ ] **Step 1: Map `rsvpStatus` in `app/api/outlook/route.ts`**

In the `.map()` callback (lines 62–84), after `joinUrl`, add:

```ts
const responseStatus = ev['responseStatus'] as Record<string, string> | undefined
const rsvpStatus = responseStatus?.['response'] as Activity['rsvpStatus'] | undefined
```

And include in the returned object:

```ts
rsvpStatus,
```

- [ ] **Step 2: Write failing RSVP route tests**

Create `__tests__/api/outlook-rsvp.test.ts`:

```ts
import { POST } from '@/app/api/outlook/[id]/rsvp/route'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ email: 'eks@example.com' }),
  unauthorized: jest.fn().mockReturnValue(new Response('', { status: 401 })),
}))

describe('POST /api/outlook/[id]/rsvp', () => {
  const params = Promise.resolve({ id: 'event-abc-123' })

  it('returns 400 for invalid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'hack/../../other' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for id with path traversal', async () => {
    const badParams = Promise.resolve({ id: '../../other/resource' })
    const req = new Request('http://localhost/api/outlook/bad/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req, { params: badParams })
    expect(res.status).toBe(400)
  })

  it('accepts valid action and uses session email', async () => {
    const { graphFetch } = require('@/lib/graph/client')
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
    expect(graphFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/eks@example.com/events/event-abc-123/accept'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('accepts decline as a valid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'decline' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
  })

  it('accepts tentativelyAccept as a valid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'tentativelyAccept' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(200)
  })

  it('returns 401 when session is missing', async () => {
    const { requireSession } = require('@/lib/herbe/auth-guard')
    requireSession.mockImplementationOnce(() => Promise.reject(new Error('unauthorized')))
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(401)
  })

  it('maps rsvpStatus: accepted response maps to accepted', () => {
    // Verifies the mapping pattern used in app/api/outlook/route.ts Step 1
    const ev = { responseStatus: { response: 'accepted', time: '2026-03-24T10:00:00Z' } }
    const responseStatus = ev.responseStatus as Record<string, string> | undefined
    const rsvpStatus = responseStatus?.['response']
    expect(rsvpStatus).toBe('accepted')
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx jest __tests__/api/outlook-rsvp.test.ts --no-coverage
```
Expected: FAIL — module not found

- [ ] **Step 4: Create `app/api/outlook/[id]/rsvp/route.ts`**


```ts
import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

const VALID_ACTIONS = new Set(['accept', 'decline', 'tentativelyAccept'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { id } = await params
  const { action } = await req.json()

  // Validate id: must not contain path traversal characters
  if (!id || id.includes('/') || id.includes('..') || id.includes('\\')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  // email MUST come from session — never from request body
  const email = session.email
  const res = await graphFetch(`/users/${email}/events/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ sendResponse: true }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest __tests__/api/outlook-rsvp.test.ts --no-coverage
```
Expected: PASS (7 tests — 4 action tests + 401 test + id traversal test + rsvpStatus mapping test)

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app/api/outlook/route.ts app/api/outlook/[id]/rsvp/route.ts __tests__/api/outlook-rsvp.test.ts
git commit -m "feat: map rsvpStatus from Outlook events and add RSVP API route"
```

---

## Task 7: `PersonColumn.tsx` + `CalendarShell.tsx` — extend client-side `canEdit` to include CC persons

**Files:**
- Modify: `components/PersonColumn.tsx` (lines 42–47)
- Modify: `components/CalendarShell.tsx` (lines 58–63)

Both files have their own `canEdit`/`canEditActivity` function. Both must be updated — the spec explicitly calls out both call sites.

- [ ] **Step 1: Update `canEdit` in `PersonColumn.tsx`**

The existing `canEdit` already has a guard `if (activity.source === 'outlook') return !!activity.isOrganizer` — retain it unchanged. Only add the `inCCPersons` line to the Herbe branch:

```ts
function canEdit(activity: Activity): boolean {
  if (activity.source === 'outlook') return !!activity.isOrganizer  // ← existing, unchanged
  const inMainPersons = activity.mainPersons?.includes(sessionUserCode) ?? false
  const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(sessionUserCode) ?? false
  const inCCPersons = activity.ccPersons?.includes(sessionUserCode) ?? false  // ← new
  return activity.personCode === sessionUserCode || inMainPersons || inAccessGroup || inCCPersons
}
```

- [ ] **Step 2: Update `canEditActivity` in `CalendarShell.tsx`**

`CalendarShell.tsx` has a parallel function `canEditActivity` (line 58) that drives `canEdit` passed to `ActivityForm`. Apply the same change:

```ts
function canEditActivity(activity: Activity): boolean {
  if (activity.source === 'outlook') return !!activity.isOrganizer  // ← existing
  const inMainPersons = activity.mainPersons?.includes(userCode) ?? false
  const inAccessGroup = activity.accessGroup?.split(',').map(s => s.trim()).includes(userCode) ?? false
  const inCCPersons = activity.ccPersons?.includes(userCode) ?? false  // ← new
  return activity.personCode === userCode || inMainPersons || inAccessGroup || inCCPersons
}
```

Note: `CalendarShell` uses `userCode` (not `sessionUserCode`) — use the variable already in scope.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/PersonColumn.tsx components/CalendarShell.tsx
git commit -m "feat: include CC persons in client-side canEdit checks (PersonColumn + CalendarShell)"
```

---

## Task 8: `ActivityBlock.tsx` — CC visual style + persons row + Teams button

**Files:**
- Modify: `components/ActivityBlock.tsx`

Props change: add `isCC?: boolean` to the props interface.

- [ ] **Step 1: Add `isCC` prop and CC visual style**

In the props interface (around line 6), add:
```ts
isCC?: boolean
```

**Note on prefix symbol:** The spec says CC blocks have no prefix symbol (actual uses `●`, planned uses `○`, CC has none). Check the existing block rendering — if the prefix symbol is rendered conditionally based on existing flags, add `&& !isCC` to suppress it when `isCC` is true.

In the style object (around lines 24–31), add CC branch:
```ts
background: isCC
  ? `repeating-linear-gradient(135deg, ${color}0a, ${color}0a 4px, transparent 4px, transparent 8px)`
  : isPlanned ? color + '1a' : color + '33',
borderLeft: isOutlook
  ? `2px dashed ${color}`
  : isCC
    ? `2px solid ${color}8c`   // thinner + ~55% opacity
    : `3px solid ${color}`,
borderRight: isPlanned && !isCC ? `3px solid ${color}` : undefined,
opacity: (isOutlook || isCC) ? (isCC ? 1 : 0.85) : 1,
```

For text opacity when CC, wrap the main content div:
```tsx
<div style={{ opacity: isCC ? 0.6 : 1 }}>
```

- [ ] **Step 2: Add persons row**

Below the time display, add a persons row that shows `mainPersons` and `ccPersons` pips. Add after the `<p>` with the time range (around line 43):

```tsx
{/* Persons row */}
{(activity.mainPersons?.length || activity.ccPersons?.length) && (
  <div className="flex gap-0.5 flex-wrap mt-0.5">
    {(() => {
      const mainPips = (activity.mainPersons ?? []).slice(0, 3)
      const ccPips = (activity.ccPersons ?? []).slice(0, Math.max(0, 3 - mainPips.length))
      const totalShown = mainPips.length + ccPips.length
      const totalAll = (activity.mainPersons?.length ?? 0) + (activity.ccPersons?.length ?? 0)
      return (
        <>
          {mainPips.map(code => (
            <span key={code} className="text-[9px] rounded px-0.5 leading-4"
              style={{ background: color + '33', color: '#fff' }}>{code}</span>
          ))}
          {ccPips.map(code => (
            <span key={code} className="text-[9px] rounded px-0.5 leading-[14px]"
              style={{ border: `1px dashed ${color}99`, color: color + 'cc', fontStyle: 'italic' }}>{code}</span>
          ))}
          {totalAll > totalShown && (
            <span className="text-[9px]" style={{ color: color + '99' }}>+{totalAll - totalShown}</span>
          )}
        </>
      )
    })()}
  </div>
)}
```

- [ ] **Step 3: Add "Open in Teams" button in hover card**

In the hover card section (around line 74, inside `{hovered && ...}`), replace the raw joinUrl display with a styled button. Find where `joinUrl` is currently displayed (if it is — check the hover card for any joinUrl reference) and add/replace:

```tsx
{activity.joinUrl && (
  <a
    href={activity.joinUrl}
    target="_blank"
    rel="noopener noreferrer"
    onClick={e => e.stopPropagation()}
    className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded text-[10px] font-bold text-white"
    style={{ background: '#464EB8' }}
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5H3v14h18V5zm-2 12H5V7h14v10zm-5-5v-2h-4v2h4zm0 3v-2h-4v2h4z"/></svg>
    Open in Teams
  </a>
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/ActivityBlock.tsx
git commit -m "feat: CC visual style, persons row, and Teams button in ActivityBlock"
```

---

## Task 9: `PersonColumn.tsx` — derive `isCC` per activity and pass to `ActivityBlock`

**Files:**
- Modify: `components/PersonColumn.tsx`

Note: `CalendarGrid.tsx` requires no code change — it already passes props down correctly. All the work is in `PersonColumn.tsx`.

**Important:** `isCC` must be derived using `person.code` (the column's person), NOT `sessionUserCode`. Example: when viewing ARA's column, ARA's CC activities should render with the CC stripe style because ARA is the CC recipient — regardless of who the session user is.

- [ ] **Step 1: Derive and pass `isCC` in `PersonColumn.tsx`**

In `PersonColumn.tsx`, when rendering `ActivityBlock` (line ~189), compute `isCC` using `person.code` (the column person):

```tsx
const isCC = (act.ccPersons?.includes(person.code) ?? false) &&
             !(act.mainPersons?.includes(person.code) ?? false)
// Pass to ActivityBlock:
<ActivityBlock ... isCC={isCC} />
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/PersonColumn.tsx
git commit -m "feat: derive isCC per activity in PersonColumn, pass to ActivityBlock"
```

---

## Task 10: `ActivityForm.tsx` — CC persons section

**Files:**
- Modify: `components/ActivityForm.tsx`

This is the largest UI task. Follow the existing `selectedPersonCodes` pattern exactly.

- [ ] **Step 1: Add imports and state**

Add to imports at top:
```ts
import { getRecentCCPersons, saveRecentCCPersons } from '@/lib/recentItems'
```

Add state variables (after the `personsExpanded` state, around line 80):
```ts
const [selectedCCPersonCodes, setSelectedCCPersonCodes] = useState<string[]>(
  initial?.ccPersons ?? []
)
const [ccPersonsExpanded, setCCPersonsExpanded] = useState(false)
const [recentCCPersonCodes, setRecentCCPersonCodes] = useState<string[]>([])
```

Load recent CC persons in the `useEffect` that loads recent persons (around line 115):
```ts
setRecentCCPersonCodes(getRecentCCPersons())
```

- [ ] **Step 2: Add `selectedCCPersonCodes` to `initialValuesRef`**

In `initialValuesRef` (around line 94), add:
```ts
selectedCCPersonCodes: [...(initial?.ccPersons ?? [])],
```

In the dirty check function (around line 383), add:
```ts
const sortedCC = [...selectedCCPersonCodes].sort()
const sortedInitCC = [...(initialValuesRef.current.selectedCCPersonCodes ?? [])].sort()
if (JSON.stringify(sortedCC) !== JSON.stringify(sortedInitCC)) return true
```

- [ ] **Step 3: Add `CCPersons` to `buildHerbePayload`**

In `buildHerbePayload()` (around line 291), add:
```ts
CCPersons: selectedCCPersonCodes.join(','),  // empty string clears — toHerbeForm handles it
```

The empty-string clearing works because: (a) Task 3 added `allowEmptyFields` to `toHerbeForm`, and (b) Tasks 4 and 5 pass `new Set(['CCPersons'])` at the POST/PUT call sites in the API routes. `ActivityForm` just needs to include `CCPersons` in the payload — the API layer ensures it survives the filter.

**Note on `smartDefaultStart()`:** No change is needed here. The function already filters `mainPersons?.includes(defaultPersonCode) || personCode === defaultPersonCode`. CC-only activities are naturally excluded because `defaultPersonCode` is not in `mainPersons` for them.

- [ ] **Step 4: Save recent CC persons on success**

In the save success handler (around line 363, after `saveRecentPersons`):
```ts
saveRecentCCPersons(selectedCCPersonCodes)
```

- [ ] **Step 5: Reset CC persons in `resetToCreate`**

In `resetToCreate` (around line 419), set:
```ts
setSelectedCCPersonCodes(copy?.ccPersons ?? [])
setCCPersonsExpanded(false)
```

Update `initialValuesRef.current` in `resetToCreate`:
```ts
selectedCCPersonCodes: [...(copy?.ccPersons ?? [])],
```

- [ ] **Step 6: Add CC Person(s) section to the form JSX**

Directly after the closing `</div>` of the `Person(s)` section (after line ~669), add:

```tsx
{/* CC Person(s) */}
{source === 'herbe' && (() => {
  const unselected = people
    .filter(p => !selectedCCPersonCodes.includes(p.code))
    .sort((a, b) => {
      const ai = recentCCPersonCodes.indexOf(a.code)
      const bi = recentCCPersonCodes.indexOf(b.code)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return 0
    })
  const visibleUnselected = ccPersonsExpanded ? unselected : unselected.slice(0, 3)
  const hiddenCount = ccPersonsExpanded ? 0 : Math.max(0, unselected.length - 3)
  return (
    <div>
      <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">
        CC Person(s)
      </label>
      <div className="flex flex-wrap gap-1">
        {people.filter(p => selectedCCPersonCodes.includes(p.code)).map(p => (
          <button key={p.code} tabIndex={-1}
            onClick={() => setSelectedCCPersonCodes(prev => prev.filter(c => c !== p.code))}
            className="px-2 py-0.5 rounded-full text-xs font-bold border transition-colors"
            style={{ borderStyle: 'dashed', borderColor: 'var(--color-primary)', background: 'rgba(var(--color-primary-rgb, 205 76 56) / 0.1)', color: 'var(--color-primary)', opacity: 0.8 }}
          >
            {p.code}
          </button>
        ))}
        {visibleUnselected.map(p => (
          <button key={p.code} tabIndex={-1}
            onClick={() => setSelectedCCPersonCodes(prev => [...prev, p.code])}
            className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
          >
            {p.code}
          </button>
        ))}
        {hiddenCount > 0 && (
          <button type="button" tabIndex={-1}
            onClick={() => setCCPersonsExpanded(true)}
            className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
          >
            +{hiddenCount} more
          </button>
        )}
        {ccPersonsExpanded && unselected.length > 3 && (
          <button type="button" tabIndex={-1}
            onClick={() => setCCPersonsExpanded(false)}
            className="px-2 py-0.5 rounded-full text-xs font-bold border border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
          >
            Collapse
          </button>
        )}
      </div>
    </div>
  )
})()}
```

Note: only show CC section for `source === 'herbe'` — Outlook events use their own attendee model.

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add components/ActivityForm.tsx
git commit -m "feat: add CC Person(s) section to ActivityForm"
```

---

## Task 11: `ActivityForm.tsx` — "Open in Teams" button + RSVP

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Replace raw joinUrl with "Open in Teams" button**

Find the existing Teams join button block (around line 579–588):
```tsx
{initial?.joinUrl && (
  <a href={initial.joinUrl} target="_blank" rel="noopener noreferrer"
    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#464EB8] text-white font-bold text-sm">
    Join Teams meeting
  </a>
)}
```

Replace with:
```tsx
{initial?.joinUrl && (
  <a href={initial.joinUrl} target="_blank" rel="noopener noreferrer"
    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#464EB8] text-white font-bold text-sm">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12v-2h-2v2h2zm-4 0v-2H7v2h6zm4 3v-2h-2v2h2zm-4 0v-2H7v2h6zM3 5v14h18V5H3zm16 12H5V7h14v10z"/></svg>
    Open in Teams
  </a>
)}
```

- [ ] **Step 2: Add RSVP state and handler**

Add state after `erpLinkCopied` state (around line 81):
```ts
const [rsvpStatus, setRsvpStatus] = useState<Activity['rsvpStatus']>(initial?.rsvpStatus)
const [rsvpLoading, setRsvpLoading] = useState(false)
```

Add RSVP handler function (after the existing handler functions):
```ts
async function handleRsvp(action: 'accept' | 'decline' | 'tentativelyAccept') {
  if (!editId || rsvpLoading) return
  setRsvpLoading(true)
  try {
    const res = await fetch(`/api/outlook/${editId}/rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) setRsvpStatus(action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'tentativelyAccepted')
  } finally {
    setRsvpLoading(false)
  }
}
```

- [ ] **Step 3: Add RSVP buttons to form JSX**

After the `Open in Teams` button block, add (Outlook only, not organizer):
```tsx
{source === 'outlook' && rsvpStatus !== 'organizer' && (
  <div>
    <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">RSVP</label>
    <div className="flex gap-2">
      {([
        { action: 'accept', label: '✓ Accept', activeStatus: 'accepted', activeClass: 'border-green-600 bg-green-900/20 text-green-400' },
        { action: 'decline', label: '✗ Decline', activeStatus: 'declined', activeClass: 'border-red-600 bg-red-900/20 text-red-400' },
        { action: 'tentativelyAccept', label: '? Tentative', activeStatus: 'tentativelyAccepted', activeClass: 'border-purple-500 bg-purple-900/20 text-purple-400' },
      ] as const).map(({ action, label, activeStatus, activeClass }) => (
        <button
          key={action}
          type="button"
          tabIndex={-1}
          disabled={rsvpLoading}
          onClick={() => handleRsvp(action)}
          className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-colors ${
            rsvpStatus === activeStatus
              ? activeClass
              : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/ActivityForm.tsx
git commit -m "feat: Open in Teams button and RSVP controls in ActivityForm"
```

---

## Task 12: `ActivityForm.tsx` — read-only lock when `canEdit === false`

**Files:**
- Modify: `components/ActivityForm.tsx`

`canEdit` is already a prop on `ActivityForm`. Check the existing props interface (around line 9) — it should already accept `canEdit?: boolean`. If not, add it.

- [ ] **Step 1: Add read-only banner**

At the top of the form body (after the tab selector, before the Person(s) section), add:
```tsx
{canEdit === false && (
  <div className="text-xs text-text-muted bg-surface border border-border rounded-lg px-3 py-2">
    View only — you are not a participant in this activity
  </div>
)}
```

- [ ] **Step 2: Disable all inputs when `canEdit === false`**

The form has many inputs. The cleanest approach is to wrap all editable fields in a `fieldset` with `disabled={canEdit === false}`. Find the opening of the form body scroll area (around line 600) and add a wrapping fieldset:

```tsx
<fieldset disabled={canEdit === false} className="contents">
  {/* ... all field sections ... */}
</fieldset>
```

`disabled` on `fieldset` disables all descendant form controls (inputs, buttons, selects). Use `className="contents"` so it doesn't affect layout.

- [ ] **Step 3: Hide save button when read-only**

Find the save/submit button at the bottom (around line 1010–1040). Wrap it:
```tsx
{canEdit !== false && (
  <button type="submit" ...>
    {isEdit ? 'Save changes' : 'Create activity'}
  </button>
)}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/ActivityForm.tsx
git commit -m "feat: read-only lock in ActivityForm when canEdit is false"
```

---

## Task 13: `CalendarHeader.tsx` — logoff button + mobile Sign out

**Files:**
- Modify: `components/CalendarHeader.tsx`

**Current state:** The standalone `↻` refresh button (lines 92–97) is visible on all screen sizes. On desktop, the inline buttons area (`hidden lg:block/flex`) has: keyboard shortcuts `?`, color palette, `+ New`. The hamburger (`lg:hidden`) has Color settings and Keyboard shortcuts.

**Plan:** (a) Add Refresh to the hamburger dropdown so mobile users retain refresh access. (b) Add a `hidden lg:block` refresh icon to the desktop inline area before `?`. (c) Replace the always-visible `↻` button with the logoff button. This satisfies the spec's requirement to verify refresh is accessible before removing the standalone button.

- [ ] **Step 1: Add `signOut` import**

```ts
import { signOut } from 'next-auth/react'
```

- [ ] **Step 2: Add Refresh to hamburger dropdown**

In the hamburger dropdown (after the "Keyboard shortcuts" item, around line 117), add:
```tsx
<button
  onClick={() => { setHamburgerOpen(false); onRefresh() }}
  className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
>
  ↻ Refresh
</button>
```

- [ ] **Step 3: Add Sign out to hamburger dropdown**

After the Refresh item:
```tsx
<button
  onClick={() => { setHamburgerOpen(false); signOut() }}
  className="w-full text-left px-4 py-2.5 text-sm hover:bg-border"
>
  Sign out
</button>
```

- [ ] **Step 4: Add desktop refresh icon to inline area**

Before the `hidden lg:block` keyboard shortcuts button (around line 124), add:
```tsx
<button
  onClick={onRefresh}
  className="hidden lg:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
  title="Refresh"
>↻</button>
```

- [ ] **Step 5: Replace standalone `↻` button with logoff**

Find the always-visible refresh button (lines 92–97):
```tsx
<button
  onClick={onRefresh}
  className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
  title="Refresh"
>↻</button>
```

Replace with:
```tsx
<button
  onClick={() => signOut()}
  className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
  title="Sign out"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
</button>
```

- [ ] **Step 6: Verify TypeScript (`onRefresh` still in use)**

`onRefresh` is still used in the hamburger dropdown and the desktop icon, so keep it in the props interface.

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add components/CalendarHeader.tsx
git commit -m "feat: logoff button in header, refresh moved to hamburger and desktop icon"
```

---

## Task 14: Full test run + build verification

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage
```
Expected: all tests pass.

- [ ] **Step 2: Run linter**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Run production build**

```bash
npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual smoke test checklist**

Deploy to preview (`vercel`) and verify:
- [ ] Open an activity where you are CC-only → block shows with stripe style + outlined pills
- [ ] Open an activity where you are main person → block shows normal style, CC persons shown as dashed pips
- [ ] Create a new activity, add CC persons → saved, CC persons appear on block
- [ ] Edit that activity, clear CC persons → CC persons removed (empty string sent correctly)
- [ ] Open an Outlook Teams meeting → "Open in Teams" button shows, RSVP buttons show, clicking Accept highlights the Accept button
- [ ] Open an activity you cannot edit → form shows "View only" banner, inputs are disabled, no save button
- [ ] Click Sign out on desktop → signs out
- [ ] Click hamburger on mobile → Sign out option present

- [ ] **Step 5: Deploy to preview**

```bash
vercel && vercel alias <preview-url> herbe-calendar-test.vercel.app
```
