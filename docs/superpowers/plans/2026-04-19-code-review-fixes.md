# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 32 findings from the in-depth code review across security, performance, accessibility, error handling, architecture, and testing.

**Architecture:** Surgical fixes grouped by concern. Each task is independent and produces a working, testable change. No new abstractions — fix in place. Commit after each task group.

**Tech Stack:** Next.js 16, React 19, Neon Postgres, TypeScript

---

## Task Groups Overview

| Group | Tasks | Focus |
|-------|-------|-------|
| A | 1-5 | Critical security & data integrity |
| B | 6-9 | API timeouts & pagination |
| C | 10-13 | Sync parallelization & guards |
| D | 14-17 | Error handling & resilience |
| E | 18-22 | Accessibility (critical) |
| F | 23-26 | Accessibility (important) |
| G | 27-29 | Architecture cleanup |
| H | 30-32 | Database & observability |

---

### Task 1: Wrap sync delete-then-insert in transactions (C4)

**Files:**
- Modify: `lib/sync/erp.ts:153-196` (fullReconciliation)
- Modify: `lib/sync/erp.ts:251-284` (forceSyncRange)
- Modify: `lib/sync/graph.ts:53-106` (syncAccountOutlook)
- Modify: `lib/sync/google.ts:82-134` (syncAccountGoogleDomainWide)
- Modify: `lib/sync/google.ts:139-201` (syncAccountGoogleUser)

- [ ] **Step 1: Fix `fullReconciliation` in `lib/sync/erp.ts`**

Wrap the delete + fetch + insert in a transaction. The fetch is external (ERP API) so we can't include it in the transaction, but we can: fetch first, then delete+insert atomically.

In `lib/sync/erp.ts`, replace the `fullReconciliation` function (lines 153-196):

```ts
async function fullReconciliation(
  accountId: string,
  conn: ErpConnection,
): Promise<{ events: number; error?: string }> {
  try {
    // Fetch FIRST, before deleting anything
    const { dateFrom, dateTo } = fullSyncRange()
    const { records, sequence } = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn,
    )

    const rows: CachedEventRow[] = []
    for (const raw of records) {
      const r = raw as Record<string, unknown>
      rows.push(...buildCacheRows(r, accountId, conn.id, conn.name))
    }

    // Atomic delete + insert inside a transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
        [accountId, SOURCE, conn.id],
      )
      // Batch insert within the same transaction
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE)
        await upsertCachedEvents(chunk, client)
      }
      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {})
      throw txErr
    } finally {
      client.release()
    }

    await updateSyncState(accountId, SOURCE, conn.id, {
      syncCursor: sequence,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })

    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, SOURCE, conn.id, {
      syncStatus: 'error',
      errorMessage: msg,
    }).catch(() => {})
    return { events: 0, error: msg }
  }
}
```

- [ ] **Step 2: Fix `forceSyncRange` in `lib/sync/erp.ts`**

Same pattern — fetch all connections first, then atomic delete+insert:

Replace `forceSyncRange` (lines 251-284):

```ts
export async function forceSyncRange(
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ eventsUpserted: number }> {
  const connections = await getErpConnections(accountId)
  const allRows: CachedEventRow[] = []

  // Fetch from all connections first
  for (const conn of connections) {
    const { records } = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn,
    )
    for (const raw of records) {
      const r = raw as Record<string, unknown>
      allRows.push(...buildCacheRows(r, accountId, conn.id, conn.name))
    }
  }

  // Atomic delete + insert
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND date BETWEEN $3 AND $4`,
      [accountId, SOURCE, dateFrom, dateTo],
    )
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      await upsertCachedEvents(allRows.slice(i, i + BATCH_SIZE), client)
    }
    await client.query('COMMIT')
  } catch (txErr) {
    await client.query('ROLLBACK').catch(() => {})
    throw txErr
  } finally {
    client.release()
  }

  return { eventsUpserted: allRows.length }
}
```

- [ ] **Step 3: Update `upsertCachedEvents` to accept an optional client**

In `lib/cache/events.ts`, the `upsertCachedEvents` function needs to accept an optional `client` parameter so it can participate in a caller's transaction. Add a second parameter:

```ts
// Change signature from:
export async function upsertCachedEvents(rows: CachedEventRow[]): Promise<void> {
// To:
export async function upsertCachedEvents(rows: CachedEventRow[], queryable: { query: (...args: any[]) => Promise<any> } = pool): Promise<void> {
```

Then replace all `pool.query(` calls inside the function with `queryable.query(`.

- [ ] **Step 4: Fix `syncAccountOutlook` in `lib/sync/graph.ts`**

Same fetch-first-then-atomic pattern. Replace the full mode section (lines 66-71 + 92):

```ts
// In syncAccountOutlook, change the full mode block:
// Move the DELETE to after fetching, wrap in transaction with the upsert
if (mode === 'full') {
  // Fetch first, delete+insert atomically after
}

// After collecting all rows, replace the plain batchUpsert with:
const client = await pool.connect()
try {
  await client.query('BEGIN')
  if (mode === 'full') {
    await client.query(
      `DELETE FROM cached_events WHERE account_id = $1 AND source = $2`,
      [accountId, SOURCE],
    )
  }
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertCachedEvents(rows.slice(i, i + BATCH_SIZE), client)
  }
  await client.query('COMMIT')
} catch (txErr) {
  await client.query('ROLLBACK').catch(() => {})
  throw txErr
} finally {
  client.release()
}
```

- [ ] **Step 5: Fix Google sync modules similarly**

Apply the same fetch-first-then-atomic pattern to:
- `syncAccountGoogleDomainWide` in `lib/sync/google.ts` (lines 92-97 + 122)
- `syncAccountGoogleUser` in `lib/sync/google.ts` (lines 162-167 + 186)

- [ ] **Step 6: Verify all sync modes work**

Run: `npx jest --forceExit 2>&1 | tail -5`
Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/erp.ts lib/sync/graph.ts lib/sync/google.ts lib/cache/events.ts
git commit -m "fix: wrap sync delete-then-insert in transactions to prevent data loss"
```

---

### Task 2: Strip sensitive fields from cancel token GET response (I4)

**Files:**
- Modify: `app/api/bookings/[cancelToken]/route.ts:30-32`

- [ ] **Step 1: Strip sensitive fields**

In `app/api/bookings/[cancelToken]/route.ts`, replace lines 30-32:

```ts
  // Strip internal and sensitive fields from public response
  const { account_id, cancel_token, share_token, share_link_id, ...booking } = rows[0]
  return NextResponse.json(booking)
```

- [ ] **Step 2: Commit**

```bash
git add app/api/bookings/[cancelToken]/route.ts
git commit -m "fix: strip share_token and cancel_token from booking GET response"
```

---

### Task 3: Add `secure` flag to `activeAccountId` cookie (I5)

**Files:**
- Modify: `app/api/settings/accounts/route.ts:64-68`

- [ ] **Step 1: Add secure flag**

In `app/api/settings/accounts/route.ts`, replace the cookie set (lines 64-68):

```ts
  res.cookies.set('activeAccountId', signed, {
    path: '/',
    maxAge: 30 * 24 * 3600,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
```

- [ ] **Step 2: Commit**

```bash
git add app/api/settings/accounts/route.ts
git commit -m "fix: add secure flag to activeAccountId cookie"
```

---

### Task 4: Validate dateFrom/dateTo on share/activities endpoint (I14)

**Files:**
- Modify: `app/api/share/[token]/activities/route.ts:58-63`

- [ ] **Step 1: Add date validation**

After the `if (!dateFrom || !dateTo)` check (line 61-63), add:

```ts
  // Validate date format and range
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return NextResponse.json({ error: 'Invalid date format, use YYYY-MM-DD' }, { status: 400 })
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'dateFrom must be before dateTo' }, { status: 400 })
  }
  // Cap range to 6 months to prevent expensive queries
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  const sixMonths = 183 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > sixMonths) {
    return NextResponse.json({ error: 'Date range must not exceed 6 months' }, { status: 400 })
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/share/[token]/activities/route.ts
git commit -m "fix: validate date format and cap range on share/activities endpoint"
```

---

### Task 5: Remove `userScalable: false` from viewport (C3)

**Files:**
- Modify: `app/layout.tsx:16-21`

- [ ] **Step 1: Fix viewport config**

In `app/layout.tsx`, replace lines 16-21:

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "fix: remove userScalable:false to allow zoom for accessibility (WCAG 1.4.4)"
```

---

### Task 6: Add timeouts to Microsoft Graph API calls (I1)

**Files:**
- Modify: `lib/graph/client.ts:29-41` (getGraphToken)
- Modify: `lib/graph/client.ts:54-65` (graphFetch)

- [ ] **Step 1: Add timeout constant and apply to token fetch**

In `lib/graph/client.ts`, add at the top (after imports):

```ts
const API_TIMEOUT_MS = 30_000
```

In `getGraphToken`, add signal to the fetch (line 29):

```ts
  const res = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    }
  )
```

- [ ] **Step 2: Add timeout to graphFetch**

In `graphFetch` (line 57), add signal:

```ts
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    signal: options?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
  })
```

- [ ] **Step 3: Commit**

```bash
git add lib/graph/client.ts
git commit -m "fix: add 30s timeout to all Microsoft Graph API calls"
```

---

### Task 7: Add timeouts to Zoom API calls (I1)

**Files:**
- Modify: `lib/zoom/client.ts:54,93,120`

- [ ] **Step 1: Add timeout constant and apply to all fetches**

In `lib/zoom/client.ts`, add after the constant declarations (line 16):

```ts
const API_TIMEOUT_MS = 30_000
```

Add `signal: AbortSignal.timeout(API_TIMEOUT_MS)` to all three fetch calls:
- `getAccessToken` (line 54): add to the token fetch options
- `createZoomMeeting` (line 93): add to the meeting creation fetch
- `testZoomConnection` (line 120): add to the test fetch

- [ ] **Step 2: Commit**

```bash
git add lib/zoom/client.ts
git commit -m "fix: add 30s timeout to all Zoom API calls"
```

---

### Task 8: Add timeouts to Calendly API calls (I1)

**Files:**
- Modify: `lib/calendly/client.ts:24,41,62,88`

- [ ] **Step 1: Add timeout constant and apply**

In `lib/calendly/client.ts`, add after the `CALENDLY_API` constant (line 5):

```ts
const API_TIMEOUT_MS = 30_000
```

Add `signal: AbortSignal.timeout(API_TIMEOUT_MS)` to all four fetch calls:
- `verifyPat` (line 24)
- `fetchEventTypes` (line 41)
- `createWebhook` (line 62)
- `deleteWebhook` (line 88)

- [ ] **Step 2: Commit**

```bash
git add lib/calendly/client.ts
git commit -m "fix: add 30s timeout to all Calendly API calls"
```

---

### Task 9: Add Outlook Graph pagination (I2)

**Files:**
- Modify: `lib/outlookUtils.ts:36-94` (fetchOutlookEventsForPerson)
- Modify: `lib/outlookUtils.ts:100-119` (fetchOutlookEventsMinimal)

- [ ] **Step 1: Add pagination to `fetchOutlookEventsForPerson`**

After getting the initial response (line 92-93), add `@odata.nextLink` following:

Replace the return section (lines 91-93):

```ts
  if (!res.ok) return res.status === 404 ? [] : null
  const allEvents: OutlookEvent[] = []
  let data = await res.json()
  allEvents.push(...((data.value ?? []) as OutlookEvent[]))

  // Follow pagination
  let nextLink: string | undefined = data['@odata.nextLink']
  while (nextLink) {
    const pageRes = await graphFetch(
      nextLink.replace('https://graph.microsoft.com/v1.0', ''),
      { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
      azureConfig,
    )
    if (!pageRes.ok) break
    data = await pageRes.json()
    allEvents.push(...((data.value ?? []) as OutlookEvent[]))
    nextLink = data['@odata.nextLink']
  }
  return allEvents
```

- [ ] **Step 2: Add pagination to `fetchOutlookEventsMinimal`**

Apply the same pattern to `fetchOutlookEventsMinimal` (lines 116-118).

- [ ] **Step 3: Commit**

```bash
git add lib/outlookUtils.ts
git commit -m "fix: follow @odata.nextLink pagination in Outlook event fetches"
```

---

### Task 10: Parallelize sync across accounts (I3)

**Files:**
- Modify: `lib/sync/erp.ts:214-243` (syncAllErp)
- Modify: `lib/sync/graph.ts:113-127` (syncAllOutlook)
- Modify: `lib/sync/google.ts:208-230` (syncAllGoogle)

- [ ] **Step 1: Parallelize `syncAllErp`**

Replace the sequential `for...of` loops in `syncAllErp` (lines 222-240):

```ts
  const accountResults = await Promise.allSettled(
    accounts.map(async (account) => {
      let connections: ErpConnection[]
      try {
        connections = await getErpConnections(account.id)
      } catch (e) {
        return { events: 0, errors: [`Account ${account.id}: ${String(e)}`], connections: 0 }
      }

      let events = 0
      let connCount = 0
      const errors: string[] = []

      for (const conn of connections) {
        connCount++
        const syncFn = mode === 'full' ? fullReconciliation : syncConnection
        const r = await syncFn(account.id, conn)
        events += r.events
        if (r.error) errors.push(`${account.id}/${conn.name}: ${r.error}`)
      }

      return { events, errors, connections: connCount }
    })
  )

  for (const r of accountResults) {
    if (r.status === 'fulfilled') {
      result.connections += r.value.connections
      result.events += r.value.events
      result.errors.push(...r.value.errors)
    }
  }
```

- [ ] **Step 2: Parallelize `syncAllOutlook`**

Replace the sequential loop in `syncAllOutlook` (lines 120-126):

```ts
  const accountResults = await Promise.allSettled(
    accounts.map(account => syncAccountOutlook(account.id, mode))
  )
  for (const r of accountResults) {
    if (r.status === 'fulfilled') {
      if (r.value.events > 0) result.connections++
      result.events += r.value.events
      if (r.value.error) result.errors.push(`outlook: ${r.value.error}`)
    }
  }
```

- [ ] **Step 3: Parallelize `syncAllGoogle`**

Replace the sequential loop in `syncAllGoogle` (lines 215-228):

```ts
  const accountResults = await Promise.allSettled(
    accounts.map(async (account) => {
      const people = await listAccountPersons(account.id)
      const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
      const dw = await syncAccountGoogleDomainWide(account.id, mode, people)
      const pu = await syncAccountGoogleUser(account.id, mode, emailToCode)
      return { dw, pu }
    })
  )
  for (const r of accountResults) {
    if (r.status === 'fulfilled') {
      const { dw, pu } = r.value
      if (dw.events > 0) result.connections++
      result.events += dw.events
      if (dw.error) result.errors.push(`google: ${dw.error}`)
      result.connections += pu.connections
      result.events += pu.events
      result.errors.push(...pu.errors)
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add lib/sync/erp.ts lib/sync/graph.ts lib/sync/google.ts
git commit -m "perf: parallelize sync across accounts with Promise.allSettled"
```

---

### Task 11: Add max-page guard to ERP fetch loops (I6)

**Files:**
- Modify: `lib/herbe/client.ts:272-293` (herbeFetchAll)
- Modify: `lib/herbe/client.ts:320-345` (herbeFetchWithSequence)

- [ ] **Step 1: Add MAX_PAGES guard**

Add constant near the top of `lib/herbe/client.ts`:

```ts
const MAX_PAGES = 100
```

In `herbeFetchAll`, change `while (true)` to include a page counter:

```ts
  let offset = 0
  let pageCount = 0
  while (true) {
    if (++pageCount > MAX_PAGES) {
      console.warn(`[herbe] herbeFetchAll hit MAX_PAGES (${MAX_PAGES}) for ${register}`)
      break
    }
```

Apply the same pattern to `herbeFetchWithSequence`.

- [ ] **Step 2: Commit**

```bash
git add lib/herbe/client.ts
git commit -m "fix: add max-page guard to ERP fetch loops to prevent infinite pagination"
```

---

### Task 12: Parallelize Google per-user sync (I3)

**Files:**
- Modify: `lib/sync/google.ts:139-201` (syncAccountGoogleUser)

- [ ] **Step 1: Parallelize token processing**

Replace the sequential `for (const token of tokens)` loop with `Promise.allSettled`:

```ts
  const tokenResults = await Promise.allSettled(
    tokens.map(async (token) => {
      const personCode = emailToCode.get(token.user_email.toLowerCase())
      if (!personCode) {
        return { connections: 0, events: 0, errors: [`${accountId}/${token.user_email}: no person_code — skipped`] }
      }
      // ... existing try/catch body for a single token ...
    })
  )
  for (const r of tokenResults) {
    if (r.status === 'fulfilled') {
      connections += r.value.connections
      events += r.value.events
      errors.push(...r.value.errors)
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add lib/sync/google.ts
git commit -m "perf: parallelize Google per-user sync across tokens"
```

---

### Task 13: Log decryption failures instead of silently swallowing (I8)

**Files:**
- Modify: `lib/google/client.ts:44-45`
- Modify: `lib/smtp.ts:30`
- Modify: `app/api/share/[token]/feed.ics/route.ts:143,178,180`

- [ ] **Step 1: Fix google/client.ts**

Replace line 44-45:

```ts
        try { key = decrypt(rows[0].service_account_key) } catch (e) {
          console.error('[google] Failed to decrypt service account key for account', accountId, String(e))
        }
```

- [ ] **Step 2: Fix smtp.ts**

Replace line 30:

```ts
        try { pwd = decrypt(rows[0].password) } catch (e) {
          console.error('[smtp] Failed to decrypt password for account', accountId, String(e))
        }
```

- [ ] **Step 3: Fix feed.ics/route.ts**

Replace the three empty `catch {}` blocks at lines ~143, 178, 180 with:

```ts
} catch (e) {
  console.warn('[feed.ics] Failed to build ICS event:', String(e))
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/google/client.ts lib/smtp.ts app/api/share/[token]/feed.ics/route.ts
git commit -m "fix: log decryption and ICS build failures instead of silent swallow"
```

---

### Task 14: Sanitize error messages in API responses (I9)

**Files:**
- Modify: Multiple API routes that return `String(e)` in 500 responses

- [ ] **Step 1: Find and fix all instances**

Search for `String(e)` in error responses across API routes. Replace pattern:

```ts
// FROM:
return NextResponse.json({ error: String(e) }, { status: 500 })
// TO:
console.error('[route-name] operation failed:', e)
return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
```

Apply to:
- `app/api/admin/members/route.ts`
- `app/api/admin/config/route.ts`
- `app/api/projects/route.ts`
- `app/api/settings/share-links/route.ts`
- `app/api/sync/cron/route.ts`
- Any other routes found returning `String(e)` to clients

- [ ] **Step 2: Commit**

```bash
git add app/api/
git commit -m "fix: sanitize error responses — log details server-side, return generic message"
```

---

### Task 15: Add error.tsx boundaries (I10)

**Files:**
- Create: `app/error.tsx`
- Create: `app/admin/error.tsx`
- Create: `app/share/error.tsx`

- [ ] **Step 1: Create root error boundary**

Create `app/error.tsx`:

```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg text-text p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-text-muted text-sm mb-4">An unexpected error occurred.</p>
        <button
          onClick={reset}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create admin and share error boundaries**

Create `app/admin/error.tsx` and `app/share/error.tsx` with the same content (they inherit the layout from their segment).

- [ ] **Step 3: Commit**

```bash
git add app/error.tsx app/admin/error.tsx app/share/error.tsx
git commit -m "fix: add error.tsx boundaries for root, admin, and share routes"
```

---

### Task 16: Add `role="alert"` to ErrorBanner (I12)

**Files:**
- Modify: `components/ErrorBanner.tsx:6`

- [ ] **Step 1: Add role**

Replace line 6:

```tsx
    <div role="alert" className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-700">
```

- [ ] **Step 2: Commit**

```bash
git add components/ErrorBanner.tsx
git commit -m "fix: add role=alert to ErrorBanner for screen reader announcement"
```

---

### Task 17: Add missing `try/catch` to API routes (I8 related)

**Files:**
- Modify: `app/api/settings/colors/route.ts` — wrap GET, PUT, DELETE in try/catch

- [ ] **Step 1: Read and fix the file**

Read `app/api/settings/colors/route.ts`. Wrap each handler's DB operations in try/catch, returning `{ error: 'Internal server error' }` on failure with console.error logging.

- [ ] **Step 2: Commit**

```bash
git add app/api/settings/colors/route.ts
git commit -m "fix: add error handling to settings/colors API route"
```

---

### Task 18: Add ARIA dialog roles to all modals (C1)

**Files:**
- Modify: `components/SettingsModal.tsx`
- Modify: `components/KeyboardShortcutsModal.tsx`
- Modify: `components/ConfirmDialog.tsx`
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Fix SettingsModal**

Find the outer modal `<div>` (the one with the backdrop) and add to the inner dialog container:

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" ...>
```

Add `id="settings-modal-title"` to the heading element.

- [ ] **Step 2: Fix KeyboardShortcutsModal**

Same pattern — add `role="dialog"` `aria-modal="true"` `aria-labelledby="keyboard-shortcuts-title"` to the dialog container.

- [ ] **Step 3: Fix ConfirmDialog**

Same pattern with `aria-labelledby="confirm-dialog-title"`.

- [ ] **Step 4: Fix ActivityForm modal**

Same pattern with `aria-labelledby="activity-form-title"`.

- [ ] **Step 5: Add `aria-label="Close"` to all close buttons**

Find all `✕` close buttons in these modals and add `aria-label="Close"`.

- [ ] **Step 6: Commit**

```bash
git add components/SettingsModal.tsx components/KeyboardShortcutsModal.tsx components/ConfirmDialog.tsx components/ActivityForm.tsx
git commit -m "fix: add ARIA dialog roles and close button labels to all modals"
```

---

### Task 19: Add focus trapping to modals (C1)

**Files:**
- Modify: `components/SettingsModal.tsx`
- Modify: `components/KeyboardShortcutsModal.tsx`
- Modify: `components/ConfirmDialog.tsx`
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Create a `useFocusTrap` hook**

Create `lib/useFocusTrap.ts`:

```ts
import { useEffect, useRef } from 'react'

/**
 * Trap focus within a container element when active.
 * Returns a ref to attach to the container.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active || !ref.current) return

    const container = ref.current
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Focus the first element
    first?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [active])

  return ref
}
```

- [ ] **Step 2: Apply to each modal**

In each modal component, add:

```tsx
import { useFocusTrap } from '@/lib/useFocusTrap'

// Inside the component:
const dialogRef = useFocusTrap<HTMLDivElement>(isOpen)

// On the dialog container:
<div ref={dialogRef} role="dialog" aria-modal="true" ...>
```

- [ ] **Step 3: Commit**

```bash
git add lib/useFocusTrap.ts components/SettingsModal.tsx components/KeyboardShortcutsModal.tsx components/ConfirmDialog.tsx components/ActivityForm.tsx
git commit -m "fix: add focus trapping to all modal dialogs"
```

---

### Task 20: Add missing form labels (I11)

**Files:**
- Modify: `app/login/page.tsx:44`
- Modify: `components/PersonSelector.tsx:58`

- [ ] **Step 1: Fix login page**

Add a visually hidden label before the email input:

```tsx
<label htmlFor="email-input" className="sr-only">Email address</label>
<input id="email-input" ...existing props... />
```

- [ ] **Step 2: Fix PersonSelector search**

Add a visually hidden label before the search input:

```tsx
<label htmlFor="person-search" className="sr-only">Search people</label>
<input id="person-search" ...existing props... />
```

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx components/PersonSelector.tsx
git commit -m "fix: add accessible labels to login email and person search inputs"
```

---

### Task 21: Add ARIA live region for loading states (F - I8 related)

**Files:**
- Modify: `components/CalendarGrid.tsx` (loading bar)
- Modify: `components/MonthView.tsx` (loading bar)

- [ ] **Step 1: Add `aria-live` to loading indicators**

In `CalendarGrid.tsx`, find the loading bar element and wrap or annotate it:

```tsx
<div aria-live="polite" aria-busy={isLoading}>
  {isLoading && <div className="...loading bar styles..." />}
</div>
```

Same for `MonthView.tsx`.

- [ ] **Step 2: Commit**

```bash
git add components/CalendarGrid.tsx components/MonthView.tsx
git commit -m "fix: add aria-live regions for calendar loading states"
```

---

### Task 22: Fix SettingsModal tabs ARIA pattern (F)

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: Add tablist ARIA roles**

Find the tab bar container and add `role="tablist"`. For each tab button add `role="tab"` and `aria-selected={isActive}`. For each tab panel add `role="tabpanel"`.

```tsx
<div role="tablist" className="...">
  <button role="tab" aria-selected={tab === 'general'} ...>General</button>
  <button role="tab" aria-selected={tab === 'calendars'} ...>Calendars</button>
  ...
</div>
<div role="tabpanel">
  {/* current tab content */}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add components/SettingsModal.tsx
git commit -m "fix: add ARIA tablist pattern to SettingsModal tabs"
```

---

### Task 23: Add PersonSelector and AccountSwitcher ARIA roles (F)

**Files:**
- Modify: `components/PersonSelector.tsx`
- Modify: `components/AccountSwitcher.tsx`

- [ ] **Step 1: Fix PersonSelector**

Add `role="dialog"` and `aria-modal="true"` to the PersonSelector overlay. Add `aria-labelledby`.

- [ ] **Step 2: Fix AccountSwitcher**

Add `role="listbox"` to the account list. Add `role="option"` and `aria-selected` to each account item.

- [ ] **Step 3: Commit**

```bash
git add components/PersonSelector.tsx components/AccountSwitcher.tsx
git commit -m "fix: add ARIA listbox/dialog roles to PersonSelector and AccountSwitcher"
```

---

### Task 24: Make MonthView portrait cells keyboard-accessible (F)

**Files:**
- Modify: `components/MonthView.tsx`

- [ ] **Step 1: Fix portrait day cells**

Find `<div>` elements with `onClick` in portrait mode (around line 288) and change to `<button>` or add `tabIndex={0}` + `role="button"` + `onKeyDown` handler for Enter/Space.

Event pills with `onClick` (around line 313) need the same treatment.

- [ ] **Step 2: Commit**

```bash
git add components/MonthView.tsx
git commit -m "fix: make MonthView portrait day cells keyboard-accessible"
```

---

### Task 25: Add `aria-label` to hamburger menu and items (F)

**Files:**
- Modify: `components/CalendarHeader.tsx`

- [ ] **Step 1: Add menu ARIA**

Find the hamburger dropdown and add `role="menu"` to the dropdown container, `role="menuitem"` to each item.

- [ ] **Step 2: Commit**

```bash
git add components/CalendarHeader.tsx
git commit -m "fix: add ARIA menu roles to hamburger dropdown"
```

---

### Task 26: Fix BookingPage step indicator accessibility (F)

**Files:**
- Modify: `components/BookingPage.tsx`

- [ ] **Step 1: Add text labels to progress indicator**

Find the step indicator (around line 170-177) and add `aria-label` describing the current step:

```tsx
<div aria-label={`Step ${currentStep} of ${totalSteps}`} role="progressbar" aria-valuenow={currentStep} aria-valuemax={totalSteps}>
```

- [ ] **Step 2: Commit**

```bash
git add components/BookingPage.tsx
git commit -m "fix: add accessible labels to BookingPage step indicator"
```

---

### Task 27: Delete dead code `lib/sourceConfig.ts` (S10)

**Files:**
- Delete: `lib/sourceConfig.ts`
- Modify: any files that import from it
- Delete: `__tests__/lib/sourceConfig.test.ts` (if exists)

- [ ] **Step 1: Find all imports**

Search for `sourceConfig` imports across the codebase. Remove the imports and any usage. Delete the file and its test.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove dead sourceConfig.ts — source availability is DB-driven"
```

---

### Task 28: Move ensureTable migrations to proper migration files (S5)

**Files:**
- Modify: `app/api/settings/calendars/route.ts` — remove ensureTable
- Modify: `app/api/settings/favorites/route.ts` — remove ensureTable
- Modify: `app/api/settings/share-links/route.ts` — remove ensureTable

- [ ] **Step 1: Verify tables exist in migrations**

Check if the tables created by `ensureTable` already exist in the proper migration files under `db/migrations/`. If they do, simply remove the `ensureTable` code. If not, create a new migration first.

- [ ] **Step 2: Remove ensureTable code from each route**

Remove the `ensureTable` function definitions and `await ensureTable()` calls from each of the three route files.

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/calendars/route.ts app/api/settings/favorites/route.ts app/api/settings/share-links/route.ts
git commit -m "chore: remove in-route ensureTable DDL — tables exist in proper migrations"
```

---

### Task 29: Standardize error/success response shapes (S2/S3 partial)

**Files:**
- Modify: Admin API routes that return plain text errors

- [ ] **Step 1: Find and fix plain-text auth responses**

Search admin routes for `new NextResponse('Unauthorized'` and `new NextResponse('Forbidden'`. Replace with:

```ts
NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/
git commit -m "fix: standardize admin API error responses to JSON format"
```

---

### Task 30: Add missing database index (I7)

**Files:**
- Create: `db/migrations/22_add_source_date_index.sql` (or next available number)

- [ ] **Step 1: Create migration**

```sql
-- Index for DELETE ... WHERE account_id AND source AND date BETWEEN queries
-- Used by forceSyncRange and deleteCachedEvents
CREATE INDEX IF NOT EXISTS idx_cached_events_source_date
ON cached_events (account_id, source, date);
```

- [ ] **Step 2: Run migration**

```bash
psql "$DATABASE_URL" -f db/migrations/22_add_source_date_index.sql
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/22_add_source_date_index.sql
git commit -m "perf: add index on cached_events(account_id, source, date) for range deletes"
```

---

### Task 31: Call analytics purge from cron (S8)

**Files:**
- Modify: `app/api/sync/cron/route.ts`

- [ ] **Step 1: Add purge call**

In `app/api/sync/cron/route.ts`, import purge and call it after sync:

```ts
import { purgeOldEvents } from '@/lib/analytics'

// Inside the try block, after the Promise.all:
const purged = await purgeOldEvents().catch(() => 0)

// Add to summary:
const summary = { erp, outlook, google, purgedAnalyticsEvents: purged }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sync/cron/route.ts
git commit -m "fix: call analytics purge from sync cron to prevent unbounded table growth"
```

---

### Task 32: Add ICS recurring event cap warning (S9)

**Files:**
- Modify: `lib/icsParser.ts:83`

- [ ] **Step 1: Add warning log when cap is hit**

After the while loop (around line 83), check if count hit 200:

```ts
          if (count >= 200) {
            console.warn(`[icsParser] Recurring event expansion capped at 200 for "${event.summary}" — some occurrences may be missing`)
          }
```

- [ ] **Step 2: Commit**

```bash
git add lib/icsParser.ts
git commit -m "fix: log warning when ICS recurring event expansion hits 200 cap"
```

---

## Verification

After all tasks, run:

```bash
npx jest --forceExit
npm run build
npm run lint
```

All must pass. Then do a final manual check of the calendar UI in the browser to ensure no regressions.
