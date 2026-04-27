# Timezone Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `Europe/Riga` with multi-tier timezone resolution so each account, member, and source connection can be in a different timezone, while viewers see all times in their own timezone (auto-detected with explicit override).

**Architecture:**
- **Account default TZ** (`tenant_accounts.default_timezone`, NOT NULL DEFAULT `Europe/Riga`) is the floor.
- **Member TZ** (`account_members.timezone`, NULL) overrides for that user; auto-filled from browser on first Settings open.
- **Source TZ** (per-connection columns on `account_erp_connections`, `account_azure_config`, `user_google_calendars`, `user_calendly_tokens`) controls how raw times are interpreted/sent on read & write paths.
- **Viewer TZ** is the member TZ for logged-in users; for booking pages the browser TZ (auto-detected, overridable).
- All times are **stored** as UTC instants (or as offset-bearing ISO strings); TZ conversion happens at I/O boundaries via a single `lib/timezone.ts` module.

**Tech Stack:** Next.js 16 App Router, Postgres (Neon), Microsoft Graph (Outlook), Google Calendar/Tasks API, Calendly webhooks, ICS via `ical.js`. Tests via Jest + ts-jest in `__tests__/`.

---

## File Structure

**Created:**
- `db/migrations/27_add_timezone_columns.sql` — schema + cache wipe.
- `lib/timezone.ts` — resolution + formatting utilities.
- `__tests__/lib/timezone.test.ts` — unit tests for resolver + formatters.
- `app/api/me/timezone/route.ts` — PATCH endpoint to save member TZ.
- `__tests__/api/me-timezone.test.ts` — endpoint test.

**Modified:**
- `lib/icsParser.ts` — accept TZ param.
- `lib/outlookUtils.ts` — read paths take connection TZ.
- `lib/googleUtils.ts` — read paths take calendar TZ.
- `lib/sharedCalendars.ts` — Google shared calendars TZ.
- `lib/outlook/tasks.ts` — read & write task TZ.
- `lib/google/tasks.ts` — read & write task TZ.
- `lib/bookingExecutor.ts` — host TZ on event create.
- `lib/sync/erp.ts` — connection TZ on parse.
- `lib/cache/events.ts` — widen read range ±1 day.
- `lib/auth.ts` — expose member TZ on session.
- `app/api/outlook/[id]/route.ts` — refetch uses connection TZ.
- `app/api/share/[token]/feed.ics/route.ts` — parameterized VTIMEZONE.
- `app/api/share/[token]/availability/route.ts` — viewer TZ param.
- `app/api/share/[token]/book/route.ts` — viewer TZ in body.
- `app/api/calendly/webhook/route.ts` — preserve incoming offset.
- `components/SettingsModal.tsx` — TZ picker.
- `components/BookingPage.tsx` — viewer TZ flow.
- `components/ActivityForm.tsx` — member TZ on create/update.
- `components/PersonColumn.tsx` — member TZ on drag-resize.
- `components/FavoriteDetailModal.tsx` — viewer TZ on rendered dates.
- `app/admin/cache/CacheClient.tsx`, `app/admin/dashboard/page.tsx`, `app/admin/members/MembersClient.tsx`, `app/admin/tokens/TokensClient.tsx`, `app/admin/analytics/AnalyticsClient.tsx` — viewer TZ on rendered dates.

**Tests:**
- `__tests__/lib/timezone.test.ts`
- `__tests__/api/me-timezone.test.ts`
- Extend `__tests__/icsParser.test.ts`
- Extend `__tests__/outlook/*` and `__tests__/google/*` and `__tests__/tasks/*`

---

## Task 1: Migration 27 — TZ columns + cache wipe

**Files:**
- Create: `db/migrations/27_add_timezone_columns.sql`

- [ ] **Step 1: Write the migration SQL**

Create `db/migrations/27_add_timezone_columns.sql`:

```sql
-- Multi-tier timezone support.
-- tenant_accounts.default_timezone: account-level fallback (always set).
-- account_members.timezone: per-user override (NULL = use account default).
-- account_erp_connections.timezone: TZ ERP TransDate/StartTime/EndTime are stored in.
-- account_azure_config.source_timezone: TZ to send in Outlook Prefer header (NULL = account default).
-- user_google_calendars.source_timezone: TZ from Google calendar metadata (NULL = account default).
-- user_calendly_tokens.source_timezone: TZ Calendly invite times resolve to (NULL = host member TZ).

ALTER TABLE tenant_accounts
  ADD COLUMN IF NOT EXISTS default_timezone TEXT NOT NULL DEFAULT 'Europe/Riga';

ALTER TABLE account_members
  ADD COLUMN IF NOT EXISTS timezone TEXT NULL;

ALTER TABLE account_erp_connections
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Riga';

ALTER TABLE account_azure_config
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

ALTER TABLE user_google_calendars
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

ALTER TABLE user_calendly_tokens
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

-- Cached events/tasks were bucketed under the implicit Riga assumption.
-- Wipe so that subsequent reads re-bucket using the resolved viewer TZ.
DELETE FROM cached_events;
DELETE FROM cached_tasks;
```

- [ ] **Step 2: Apply locally and verify**

Run:
```bash
npm run migrate # or whatever the project uses; check scripts/ if unsure
```
Expected: migration succeeds, all six ALTER TABLE statements run with no errors, cache tables empty.

If no migrate script exists, run `psql $DATABASE_URL -f db/migrations/27_add_timezone_columns.sql`.

- [ ] **Step 3: Verify columns exist**

Run:
```bash
psql $DATABASE_URL -c "\d tenant_accounts" | grep default_timezone
psql $DATABASE_URL -c "\d account_members" | grep -E "^ timezone"
psql $DATABASE_URL -c "\d account_erp_connections" | grep timezone
psql $DATABASE_URL -c "\d account_azure_config" | grep source_timezone
psql $DATABASE_URL -c "\d user_google_calendars" | grep source_timezone
psql $DATABASE_URL -c "\d user_calendly_tokens" | grep source_timezone
```
Expected: each grep returns a column row.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/27_add_timezone_columns.sql
git commit -m "feat(tz): migration 27 — add timezone columns and wipe cache"
```

---

## Task 2: lib/timezone.ts — resolution + formatting utilities

**Files:**
- Create: `lib/timezone.ts`
- Test: `__tests__/lib/timezone.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/timezone.test.ts`:

```ts
import {
  isValidTimezone,
  formatInTz,
  toIsoInTz,
  bucketDateInTz,
  resolveMemberTimezone,
} from '@/lib/timezone'

describe('isValidTimezone', () => {
  it('accepts IANA names', () => {
    expect(isValidTimezone('Europe/Riga')).toBe(true)
    expect(isValidTimezone('Asia/Tokyo')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })
  it('rejects garbage', () => {
    expect(isValidTimezone('Not/A/Real/Zone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone('+03:00')).toBe(false)
  })
})

describe('formatInTz', () => {
  it('renders a UTC instant in target TZ', () => {
    // 2026-04-27T10:00:00Z is 2026-04-27 13:00 in Riga (DST), 19:00 in Tokyo
    const d = new Date('2026-04-27T10:00:00Z')
    expect(formatInTz(d, 'Europe/Riga', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('13:00')
    expect(formatInTz(d, 'Asia/Tokyo', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('19:00')
  })
})

describe('toIsoInTz', () => {
  it('produces an ISO string with the TZ offset preserved', () => {
    // Local wall-clock 2026-04-27 09:00 in Riga (UTC+3 in DST) is 06:00Z
    expect(toIsoInTz('2026-04-27', '09:00', 'Europe/Riga')).toBe('2026-04-27T09:00:00+03:00')
    expect(toIsoInTz('2026-04-27', '09:00', 'Asia/Tokyo')).toBe('2026-04-27T09:00:00+09:00')
    expect(toIsoInTz('2026-04-27', '09:00', 'UTC')).toBe('2026-04-27T09:00:00+00:00')
  })
})

describe('bucketDateInTz', () => {
  it('returns YYYY-MM-DD for the given TZ', () => {
    // 2026-04-27T22:30:00Z is still 27th in Riga (00:30 next day actually -> 28th)
    const d = new Date('2026-04-27T22:30:00Z')
    expect(bucketDateInTz(d, 'Europe/Riga')).toBe('2026-04-28') // 01:30 local
    expect(bucketDateInTz(d, 'America/New_York')).toBe('2026-04-27') // 18:30 local
  })
})

describe('resolveMemberTimezone', () => {
  it('prefers member.timezone over account.default_timezone', () => {
    expect(resolveMemberTimezone({ memberTz: 'Asia/Tokyo', accountTz: 'Europe/Riga' })).toBe('Asia/Tokyo')
  })
  it('falls back to account default when member is null', () => {
    expect(resolveMemberTimezone({ memberTz: null, accountTz: 'Europe/Riga' })).toBe('Europe/Riga')
  })
  it('falls back to Europe/Riga when both are null/garbage', () => {
    expect(resolveMemberTimezone({ memberTz: null, accountTz: null as unknown as string })).toBe('Europe/Riga')
    expect(resolveMemberTimezone({ memberTz: 'Bogus/Zone', accountTz: 'Europe/Riga' })).toBe('Europe/Riga')
  })
})
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npx jest __tests__/lib/timezone.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement lib/timezone.ts**

Create `lib/timezone.ts`:

```ts
const FALLBACK_TZ = 'Europe/Riga'

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function formatInTz(date: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: safeTz }).format(date)
}

/**
 * Build an ISO 8601 string from wall-clock parts in a target TZ.
 * Returns YYYY-MM-DDTHH:mm:ss±HH:MM.
 */
export function toIsoInTz(dateYmd: string, timeHm: string, tz: string): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  const [y, m, d] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  // Compute offset by formatting the same UTC moment in the target zone.
  const utc = Date.UTC(y, m - 1, d, hh, mm, 0)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utc)).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  const offsetMinutes = Math.round((asUtc - utc) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMinutes)
  const oh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const om = String(absMin % 60).padStart(2, '0')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateYmd}T${pad(hh)}:${pad(mm)}:00${sign}${oh}:${om}`
}

export function bucketDateInTz(date: Date, tz: string): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  return new Intl.DateTimeFormat('sv-SE', { timeZone: safeTz }).format(date) // YYYY-MM-DD
}

export function resolveMemberTimezone(input: { memberTz: string | null; accountTz: string | null }): string {
  if (isValidTimezone(input.memberTz)) return input.memberTz
  if (isValidTimezone(input.accountTz)) return input.accountTz
  return FALLBACK_TZ
}

export function resolveSourceTimezone(input: { sourceTz: string | null; accountTz: string | null }): string {
  if (isValidTimezone(input.sourceTz)) return input.sourceTz
  if (isValidTimezone(input.accountTz)) return input.accountTz
  return FALLBACK_TZ
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx jest __tests__/lib/timezone.test.ts`
Expected: PASS — all 5 describe blocks pass.

- [ ] **Step 5: Commit**

```bash
git add lib/timezone.ts __tests__/lib/timezone.test.ts
git commit -m "feat(tz): add lib/timezone.ts with resolution + format utilities"
```

---

## Task 3: Account TZ resolver — getAccountTimezone, getMemberTimezone

**Files:**
- Modify: `lib/auth.ts` (add timezone read on session)
- Create: `lib/accountTimezone.ts` (DB-backed resolver)
- Test: `__tests__/lib/accountTimezone.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/lib/accountTimezone.test.ts`:

```ts
import { resolveTimezoneFromRows } from '@/lib/accountTimezone'

describe('resolveTimezoneFromRows', () => {
  it('uses member.timezone when present', () => {
    expect(resolveTimezoneFromRows({
      member: { timezone: 'Asia/Tokyo' },
      account: { default_timezone: 'Europe/Riga' },
    })).toBe('Asia/Tokyo')
  })
  it('falls back to account default', () => {
    expect(resolveTimezoneFromRows({
      member: { timezone: null },
      account: { default_timezone: 'Europe/London' },
    })).toBe('Europe/London')
  })
  it('falls back to Europe/Riga when both missing', () => {
    expect(resolveTimezoneFromRows({
      member: null,
      account: null,
    })).toBe('Europe/Riga')
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx jest __tests__/lib/accountTimezone.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement lib/accountTimezone.ts**

Create `lib/accountTimezone.ts`:

```ts
import { sql } from '@/lib/db'
import { resolveMemberTimezone } from '@/lib/timezone'

type MemberRow = { timezone: string | null } | null
type AccountRow = { default_timezone: string | null } | null

export function resolveTimezoneFromRows(input: { member: MemberRow; account: AccountRow }): string {
  return resolveMemberTimezone({
    memberTz: input.member?.timezone ?? null,
    accountTz: input.account?.default_timezone ?? null,
  })
}

export async function getAccountTimezone(accountId: string): Promise<string> {
  const rows = await sql<{ default_timezone: string }>`
    SELECT default_timezone FROM tenant_accounts WHERE id = ${accountId} LIMIT 1
  `
  return resolveTimezoneFromRows({ member: null, account: rows[0] ?? null })
}

export async function getMemberTimezone(accountId: string, email: string): Promise<string> {
  const rows = await sql<{ member_tz: string | null; account_tz: string | null }>`
    SELECT m.timezone AS member_tz, a.default_timezone AS account_tz
    FROM account_members m
    JOIN tenant_accounts a ON a.id = m.account_id
    WHERE m.account_id = ${accountId} AND m.email = ${email}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return 'Europe/Riga'
  return resolveTimezoneFromRows({
    member: { timezone: row.member_tz },
    account: { default_timezone: row.account_tz },
  })
}
```

(Adjust `sql` import to match the project's actual db helper — verify with `grep -n "from '@/lib/db'" lib/*.ts | head -3`.)

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest __tests__/lib/accountTimezone.test.ts`
Expected: PASS.

- [ ] **Step 5: Expose memberTz on session**

Modify `lib/auth.ts`. Find the function that builds the session payload (around line 17-49 per surface map) and add `timezone` to the returned shape. Concretely, after the existing person_codes lookup, add:

```ts
const tzRows = await sql<{ tz: string | null; default_tz: string | null }>`
  SELECT m.timezone AS tz, a.default_timezone AS default_tz
  FROM account_members m
  JOIN tenant_accounts a ON a.id = m.account_id
  WHERE m.account_id = ${accountId} AND m.email = ${email}
  LIMIT 1
`
const timezone = resolveMemberTimezone({
  memberTz: tzRows[0]?.tz ?? null,
  accountTz: tzRows[0]?.default_tz ?? null,
})
```

…and include `timezone` in the returned session object. Update the session TypeScript type to add `timezone: string`.

- [ ] **Step 6: Commit**

```bash
git add lib/accountTimezone.ts lib/auth.ts __tests__/lib/accountTimezone.test.ts
git commit -m "feat(tz): account/member timezone resolvers + session integration"
```

---

## Task 4: PATCH /api/me/timezone — save member TZ

**Files:**
- Create: `app/api/me/timezone/route.ts`
- Test: `__tests__/api/me-timezone.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/me-timezone.test.ts`:

```ts
import { PATCH } from '@/app/api/me/timezone/route'

jest.mock('@/lib/auth', () => ({
  getSessionUser: jest.fn(async () => ({ accountId: 'acc-1', email: 'e@x.com' })),
}))
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
}))

import { sql } from '@/lib/db'

describe('PATCH /api/me/timezone', () => {
  beforeEach(() => { (sql as jest.Mock).mockReset() })

  it('rejects invalid TZ with 400', async () => {
    const req = new Request('http://x/api/me/timezone', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'Bogus/Zone' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('writes valid TZ and returns 200', async () => {
    ;(sql as jest.Mock).mockResolvedValue([])
    const req = new Request('http://x/api/me/timezone', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'Asia/Tokyo' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(sql).toHaveBeenCalled()
  })

  it('clears TZ when null is sent', async () => {
    ;(sql as jest.Mock).mockResolvedValue([])
    const req = new Request('http://x/api/me/timezone', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: null }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx jest __tests__/api/me-timezone.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `app/api/me/timezone/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { sql } from '@/lib/db'
import { isValidTimezone } from '@/lib/timezone'

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const tz = body.timezone

  if (tz !== null && !isValidTimezone(tz)) {
    return NextResponse.json({ error: 'invalid timezone' }, { status: 400 })
  }

  await sql`
    UPDATE account_members
    SET timezone = ${tz}
    WHERE account_id = ${user.accountId} AND email = ${user.email}
  `
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx jest __tests__/api/me-timezone.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/me/timezone/route.ts __tests__/api/me-timezone.test.ts
git commit -m "feat(tz): PATCH /api/me/timezone endpoint"
```

---

## Task 5: ICS parser — parameterize TIMEZONE

**Files:**
- Modify: `lib/icsParser.ts`
- Test: extend `__tests__/icsParser.test.ts`

- [ ] **Step 1: Add failing test for TZ parameter**

Append to `__tests__/icsParser.test.ts`:

```ts
import { fetchIcsEvents } from '@/lib/icsParser'

describe('fetchIcsEvents — TZ parameter', () => {
  it('formats event dates in the supplied TZ', async () => {
    // Existing fixture used Riga; same fixture parsed with Asia/Tokyo
    // should yield dates that differ when the UTC time crosses midnight in JST.
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test1
DTSTART:20260427T220000Z
DTEND:20260427T230000Z
SUMMARY:Late event
END:VEVENT
END:VCALENDAR`
    const fetchMock = jest.fn(async () => ({ ok: true, text: async () => ics } as Response))
    global.fetch = fetchMock as typeof fetch
    const eventsRiga = await fetchIcsEvents('http://x/cal.ics', { timezone: 'Europe/Riga' })
    const eventsTokyo = await fetchIcsEvents('http://x/cal.ics', { timezone: 'Asia/Tokyo' })
    expect(eventsRiga[0].date).toBe('2026-04-28') // 01:00 next day in Riga (DST UTC+3)
    expect(eventsTokyo[0].date).toBe('2026-04-28') // 07:00 next day in Tokyo
    expect(eventsRiga[0].startTime).toBe('01:00')
    expect(eventsTokyo[0].startTime).toBe('07:00')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest __tests__/icsParser.test.ts -t "TZ parameter"`
Expected: FAIL — function signature doesn't accept options.

- [ ] **Step 3: Update lib/icsParser.ts**

In `lib/icsParser.ts`:
- Remove line 4: `const TIMEZONE = 'Europe/Riga'`.
- Change `rigaDate(d: Date)` and `rigaTime(d: Date)` to accept a `tz` argument and use it instead of `TIMEZONE`. Rename to `formatDateInTz`/`formatTimeInTz`.
- Update `fetchIcsEvents(url: string, opts?: { timezone?: string })` to accept an optional TZ; default to `'Europe/Riga'` for safety. Pass `opts.timezone ?? 'Europe/Riga'` to the formatters.

```ts
import { isValidTimezone } from '@/lib/timezone'

const FALLBACK_TZ = 'Europe/Riga'

function formatDateInTz(d: Date, tz: string): string {
  return d.toLocaleDateString('sv-SE', { timeZone: tz })
}

function formatTimeInTz(d: Date, tz: string): string {
  return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
}

export async function fetchIcsEvents(
  url: string,
  opts: { timezone?: string } = {},
): Promise<IcsEvent[]> {
  const tz = isValidTimezone(opts.timezone) ? opts.timezone : FALLBACK_TZ
  // ...existing fetch + parse logic, but every call to rigaDate/rigaTime
  // becomes formatDateInTz(d, tz) / formatTimeInTz(d, tz).
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx jest __tests__/icsParser.test.ts`
Expected: PASS — both new and pre-existing tests pass (existing tests use default Riga).

- [ ] **Step 5: Commit**

```bash
git add lib/icsParser.ts __tests__/icsParser.test.ts
git commit -m "feat(tz): parameterize ICS parser timezone"
```

---

## Task 6: Outlook event read paths — use Azure source TZ

**Files:**
- Modify: `lib/outlookUtils.ts`
- Modify: `app/api/outlook/[id]/route.ts`
- Test: extend `__tests__/outlook/`

- [ ] **Step 1: Write failing test**

Create `__tests__/outlook/timezone.test.ts`:

```ts
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'

describe('fetchOutlookEventsForPerson — Prefer header', () => {
  it('uses provided timezone in Prefer header', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true, json: async () => ({ value: [] }),
    } as Response))
    global.fetch = fetchMock as typeof fetch

    await fetchOutlookEventsForPerson({
      accessToken: 'tok', userPrincipalName: 'a@b.com',
      dateFrom: '2026-04-01', dateTo: '2026-04-30',
      timezone: 'Asia/Tokyo',
    } as Parameters<typeof fetchOutlookEventsForPerson>[0])

    const calls = fetchMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const init = calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Prefer']).toContain('outlook.timezone="Asia/Tokyo"')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest __tests__/outlook/timezone.test.ts`
Expected: FAIL — function signature doesn't accept `timezone`.

- [ ] **Step 3: Modify lib/outlookUtils.ts**

In every fetch helper (`fetchOutlookEventsForPerson`, `fetchOutlookEventsMinimal`, and any other Outlook reader in this file — surface map shows lines 52, 75, 101, 129, 141), replace the literal `'Europe/Riga'` in the Prefer header with a `timezone` parameter passed through the function options. Default to `'Europe/Riga'` when undefined for safety.

Example for `fetchOutlookEventsForPerson`:

```ts
export async function fetchOutlookEventsForPerson(opts: {
  accessToken: string
  userPrincipalName: string
  dateFrom: string
  dateTo: string
  timezone?: string
}): Promise<OutlookEvent[]> {
  const tz = opts.timezone ?? 'Europe/Riga'
  // ...inside fetch call:
  headers: {
    Authorization: `Bearer ${opts.accessToken}`,
    Prefer: `outlook.timezone="${tz}"`,
  }
}
```

Update every callsite of these functions (search: `grep -rn "fetchOutlookEventsForPerson\|fetchOutlookEventsMinimal" --include='*.ts' --include='*.tsx'`) to pass the resolved Azure source TZ via:

```ts
import { resolveSourceTimezone } from '@/lib/timezone'
import { getAccountTimezone } from '@/lib/accountTimezone'

const accountTz = await getAccountTimezone(accountId)
const azureTz = resolveSourceTimezone({ sourceTz: azureConfig.source_timezone, accountTz })
```

- [ ] **Step 4: Modify app/api/outlook/[id]/route.ts**

At line 57, replace:
```ts
Prefer: 'outlook.timezone="Europe/Riga"'
```
with the resolved `azureTz` derived the same way.

- [ ] **Step 5: Run all outlook tests**

Run: `npx jest __tests__/outlook/`
Expected: PASS for new test + all existing.

- [ ] **Step 6: Commit**

```bash
git add lib/outlookUtils.ts app/api/outlook/[id]/route.ts __tests__/outlook/timezone.test.ts
git commit -m "feat(tz): Outlook read paths honor account_azure_config.source_timezone"
```

---

## Task 7: Outlook task read & write paths — use member TZ

**Files:**
- Modify: `lib/outlook/tasks.ts`
- Test: extend `__tests__/tasks/`

- [ ] **Step 1: Write failing test**

Create `__tests__/tasks/outlook-tz.test.ts`:

```ts
import { createOutlookTask, mapOutlookTask } from '@/lib/outlook/tasks'

describe('createOutlookTask — timeZone', () => {
  it('writes dueDateTime.timeZone from caller TZ, not hardcoded UTC', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ id: 't1' }) } as Response))
    global.fetch = fetchMock as typeof fetch

    await createOutlookTask({
      accessToken: 'tok', listId: 'l1',
      title: 'X', dueDate: '2026-04-27',
      timezone: 'Asia/Tokyo',
    } as Parameters<typeof createOutlookTask>[0])

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.dueDateTime.timeZone).toBe('Asia/Tokyo')
    expect(body.dueDateTime.dateTime).toBe('2026-04-27T00:00:00')
  })
})

describe('mapOutlookTask — interprets dueDateTime in source TZ', () => {
  it('preserves the date as written by Graph', () => {
    const task = mapOutlookTask({
      id: 't1',
      title: 'X',
      status: 'notStarted',
      dueDateTime: { dateTime: '2026-04-27T00:00:00.0000000', timeZone: 'Asia/Tokyo' },
    } as Parameters<typeof mapOutlookTask>[0])
    expect(task.dueDate).toBe('2026-04-27')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest __tests__/tasks/outlook-tz.test.ts`
Expected: FAIL — current `createOutlookTask` hardcodes `timeZone: 'UTC'` and signature doesn't accept `timezone`.

- [ ] **Step 3: Modify lib/outlook/tasks.ts**

- `createOutlookTask`: add `timezone: string` to options; replace `timeZone: 'UTC'` (line ~146) with `timeZone: opts.timezone`.
- `updateOutlookTask`: same change.
- `mapOutlookTask`: when reading `dueDateTime.dateTime`, slice the date portion (`.slice(0, 10)`) directly — the value is already in the timezone declared in `dueDateTime.timeZone`, so the date string is correct as-is. (Verify the existing slice already handles this; the bug only matters if Graph gave back UTC and we mis-bucketed.)

Update every callsite of `createOutlookTask`/`updateOutlookTask` (`grep -rn "createOutlookTask\|updateOutlookTask"`) to pass the resolved member TZ:

```ts
import { getMemberTimezone } from '@/lib/accountTimezone'
const memberTz = await getMemberTimezone(accountId, userEmail)
await createOutlookTask({ ...opts, timezone: memberTz })
```

- [ ] **Step 4: Run, verify pass**

Run: `npx jest __tests__/tasks/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/outlook/tasks.ts __tests__/tasks/outlook-tz.test.ts
git commit -m "feat(tz): Outlook task read/write use member timezone (was hardcoded UTC)"
```

---

## Task 8: Google event read paths — use calendar source TZ

**Files:**
- Modify: `lib/googleUtils.ts`
- Modify: `lib/sharedCalendars.ts`
- Test: extend `__tests__/google/`

- [ ] **Step 1: Write failing test**

Create `__tests__/google/timezone.test.ts`:

```ts
import { fetchGoogleEventsForPerson } from '@/lib/googleUtils'

describe('fetchGoogleEventsForPerson — query TZ', () => {
  it('uses UTC ISO with Z suffix for timeMin/timeMax and supplies timezone param', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true, json: async () => ({ items: [] }),
    } as Response))
    global.fetch = fetchMock as typeof fetch

    await fetchGoogleEventsForPerson({
      accessToken: 'tok', calendarId: 'primary',
      dateFrom: '2026-04-01', dateTo: '2026-04-30',
      timezone: 'Asia/Tokyo',
    } as Parameters<typeof fetchGoogleEventsForPerson>[0])

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('timeZone=Asia%2FTokyo')
    expect(url).toMatch(/timeMin=2026-04-01T00%3A00%3A00.*Asia%2FTokyo|timeMin=2026-03-31|timeMin=2026-04-01T00%3A00%3A00Z/)
    // The exact form depends on impl; the key invariant is no '+03:00'.
    expect(url).not.toContain('%2B03%3A00')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest __tests__/google/timezone.test.ts`
Expected: FAIL — current code hardcodes `+03:00`.

- [ ] **Step 3: Modify lib/googleUtils.ts**

At lines 115-117, replace:
```ts
timeMin: `${dateFrom}T00:00:00+03:00`,
timeMax: `${dateTo}T23:59:59+03:00`,
timeZone: 'Europe/Riga',
```
with:
```ts
import { toIsoInTz } from '@/lib/timezone'
const tz = opts.timezone ?? 'Europe/Riga'
// ...
timeMin: toIsoInTz(dateFrom, '00:00', tz),
timeMax: toIsoInTz(dateTo, '23:59', tz),
timeZone: tz,
```

Add `timezone?: string` to the function options. Update every callsite (`grep -rn "fetchGoogleEventsForPerson\|fetchPerUserGoogleEvents"`) to pass:

```ts
import { resolveSourceTimezone } from '@/lib/timezone'
import { getAccountTimezone } from '@/lib/accountTimezone'

const accountTz = await getAccountTimezone(accountId)
const calRow = await sql`SELECT source_timezone FROM user_google_calendars WHERE id = ${calId}`
const calTz = resolveSourceTimezone({ sourceTz: calRow[0]?.source_timezone ?? null, accountTz })
```

- [ ] **Step 4: Modify lib/sharedCalendars.ts**

At line 114, replace `timeZone: 'Europe/Riga'` with the resolved calendar TZ.

- [ ] **Step 5: Run, verify pass**

Run: `npx jest __tests__/google/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/googleUtils.ts lib/sharedCalendars.ts __tests__/google/timezone.test.ts
git commit -m "feat(tz): Google read paths use user_google_calendars.source_timezone"
```

---

## Task 9: Calendly webhook — preserve incoming offset

**Files:**
- Modify: `app/api/calendly/webhook/route.ts`
- Test: create `__tests__/api/calendly-tz.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/calendly-tz.test.ts`:

```ts
import { POST } from '@/app/api/calendly/webhook/route'

describe('Calendly webhook — TZ handling', () => {
  it('parses scheduled_event.start_time preserving offset and stores in host TZ buckets', async () => {
    const payload = {
      event: 'invitee.created',
      payload: {
        scheduled_event: {
          start_time: '2026-04-27T15:00:00+09:00', // Tokyo wall clock
          end_time: '2026-04-27T16:00:00+09:00',
        },
        invitee_timezone: 'Asia/Tokyo',
        // ...minimal fields
      },
    }
    // Mock all DB and bookingExecutor side effects, capture inputs.
    // Assert that the date bucketed for the host (e.g. Europe/Riga) is 2026-04-27 (09:00 local)
    // and not corrupted by naive slice(0,10) of the ISO string.
  })
})
```

(This test is intentionally a stub — the surface map shows the webhook does `slice` on ISO strings. Once you read the actual handler, complete the test against its mocks.)

- [ ] **Step 2: Modify the webhook**

Open `app/api/calendly/webhook/route.ts` lines 96-98. Replace string-slicing with `new Date(start_time)` (which respects the offset in the ISO string), then bucket using the host's TZ via `bucketDateInTz(date, hostTz)`.

```ts
import { bucketDateInTz, formatInTz } from '@/lib/timezone'
import { getMemberTimezone } from '@/lib/accountTimezone'

const startUtc = new Date(payload.scheduled_event.start_time)
const endUtc = new Date(payload.scheduled_event.end_time)
const hostTz = await getMemberTimezone(accountId, hostEmail)
const date = bucketDateInTz(startUtc, hostTz)
const startTime = formatInTz(startUtc, hostTz, { hour: '2-digit', minute: '2-digit', hour12: false })
const endTime = formatInTz(endUtc, hostTz, { hour: '2-digit', minute: '2-digit', hour12: false })
```

- [ ] **Step 3: Run, verify pass**

Run: `npx jest __tests__/api/calendly-tz.test.ts`
Expected: PASS once the test stub is filled in to match the actual handler.

- [ ] **Step 4: Commit**

```bash
git add app/api/calendly/webhook/route.ts __tests__/api/calendly-tz.test.ts
git commit -m "feat(tz): Calendly webhook preserves invitee offset, buckets in host TZ"
```

---

## Task 10: Booking executor — use host TZ for event creates

**Files:**
- Modify: `lib/bookingExecutor.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/lib/bookingExecutor-tz.test.ts`:

```ts
import { executeBooking } from '@/lib/bookingExecutor'

describe('executeBooking — host TZ', () => {
  it('writes Outlook event with host member TZ, not hardcoded Riga', async () => {
    // Mock graph fetch, capture body.
    // Assert body.start.timeZone === host's resolved TZ (e.g. 'Asia/Tokyo' for a Tokyo host)
    // and body.start.dateTime is the wall-clock string in that TZ.
  })

  it('writes Google event with host calendar TZ', async () => {
    // Mock fetch, capture body.
    // Assert body.start.timeZone === host's resolved Google calendar TZ.
  })
})
```

- [ ] **Step 2: Modify lib/bookingExecutor.ts**

Lines 216-217 (Outlook create), 260-261 (Google create) — replace `timeZone: 'Europe/Riga'` with the host's resolved TZ.

For Outlook: use `account_azure_config.source_timezone` falling back to host member TZ.
For Google: use `user_google_calendars.source_timezone` for the host's primary calendar, falling back to host member TZ.

```ts
import { getMemberTimezone } from '@/lib/accountTimezone'
import { resolveSourceTimezone } from '@/lib/timezone'

const hostMemberTz = await getMemberTimezone(accountId, hostEmail)
const azureTz = resolveSourceTimezone({ sourceTz: azureConfig.source_timezone, accountTz: hostMemberTz })
// For Outlook event create:
body: { start: { dateTime, timeZone: azureTz }, end: { dateTime, timeZone: azureTz }, ... }
```

- [ ] **Step 3: Run, verify pass**

Run: `npx jest __tests__/lib/bookingExecutor-tz.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/bookingExecutor.ts __tests__/lib/bookingExecutor-tz.test.ts
git commit -m "feat(tz): booking executor writes events in host source timezone"
```

---

## Task 11: ActivityForm + PersonColumn — write paths use member TZ

**Files:**
- Modify: `components/ActivityForm.tsx`
- Modify: `components/PersonColumn.tsx`

- [ ] **Step 1: Add session.timezone to client**

The session already exposes `timezone` after Task 3 Step 5. Confirm via:
```bash
grep -n "session\.timezone\|timezone:" lib/auth.ts
```

- [ ] **Step 2: Modify ActivityForm.tsx**

At lines 667-668, replace:
```ts
timeZone: 'Europe/Riga'
```
with:
```ts
timeZone: session.timezone
```
(or whatever the session-context hook is — check the existing imports in the file).

- [ ] **Step 3: Modify PersonColumn.tsx**

At lines 246-247, same swap.

- [ ] **Step 4: Manual verify**

Start dev server: `npm run dev`. With a test member set to `Asia/Tokyo`:
- Drag-resize an Outlook event; check the API call payload contains `timeZone: "Asia/Tokyo"`.
- Create an event via ActivityForm; same check.

- [ ] **Step 5: Commit**

```bash
git add components/ActivityForm.tsx components/PersonColumn.tsx
git commit -m "feat(tz): activity write paths use member timezone"
```

---

## Task 12: ERP read path — interpret times in connection TZ

**Files:**
- Modify: `lib/sync/erp.ts` (and `lib/herbe/recordUtils.ts` if needed)
- Test: extend `__tests__/sync/` and `__tests__/herbe/`

- [ ] **Step 1: Write failing test**

Create `__tests__/sync/erp-tz.test.ts`:

```ts
// Reproduce: ERP returns "TransDate=2026-04-27, StartTime=23:30:00".
// With connection TZ = Europe/Riga, this should bucket as 2026-04-27 (still 27th locally).
// With connection TZ = Asia/Tokyo, the same UTC moment buckets differently when re-rendered for a Riga viewer.
// Assert the synced row's stored UTC instant matches the connection TZ interpretation.
```

- [ ] **Step 2: Modify lib/sync/erp.ts**

Read the ERP connection's `timezone` column and pass it down to `recordUtils.toTime`/`recordUtils.toDate` parsing. Use `toIsoInTz(date, time, connectionTz)` to construct the canonical UTC instant before storing.

```ts
import { toIsoInTz } from '@/lib/timezone'
import { sql } from '@/lib/db'

const connRow = await sql<{ timezone: string }>`
  SELECT timezone FROM account_erp_connections WHERE id = ${connId}
`
const connTz = connRow[0]?.timezone ?? 'Europe/Riga'

// Per record:
const startIso = toIsoInTz(record.TransDate, toTime(record.StartTime), connTz)
```

- [ ] **Step 3: Run, verify pass**

Run: `npx jest __tests__/sync/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/sync/erp.ts __tests__/sync/erp-tz.test.ts
git commit -m "feat(tz): ERP sync interprets times in connection timezone"
```

---

## Task 13: Render layer — toLocaleString callsites use viewer TZ

**Files:**
- Modify: `components/FavoriteDetailModal.tsx`
- Modify: `app/admin/cache/CacheClient.tsx`
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/admin/members/MembersClient.tsx`
- Modify: `app/admin/tokens/TokensClient.tsx`
- Modify: `app/admin/analytics/AnalyticsClient.tsx`

- [ ] **Step 1: Define a viewerTz hook**

If one doesn't exist, add `lib/useViewerTimezone.ts`:

```ts
'use client'
import { useSession } from 'next-auth/react'

export function useViewerTimezone(): string {
  const { data } = useSession()
  return (data as unknown as { user?: { timezone?: string } } | null)?.user?.timezone
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    ?? 'Europe/Riga'
}
```

- [ ] **Step 2: Update each callsite**

For each of the 7 occurrences (per surface map):
- Pass `{ timeZone: tz }` to the `toLocaleDateString` / `toLocaleString` call.
- For client components, get `tz` via `useViewerTimezone()`.
- For server components (`app/admin/dashboard/page.tsx`), accept `viewerTz` as a prop or read it from the server session helper.

Concrete example for `components/FavoriteDetailModal.tsx:427`:
```ts
const tz = useViewerTimezone()
// ...
{new Date(link.expiresAt).toLocaleDateString('en-GB', { timeZone: tz })}
```

- [ ] **Step 3: Verify**

Run: `npm run build` and `npx jest`
Expected: build succeeds, no test regressions.

- [ ] **Step 4: Commit**

```bash
git add components/FavoriteDetailModal.tsx app/admin/ lib/useViewerTimezone.ts
git commit -m "feat(tz): rendered dates honor viewer timezone"
```

---

## Task 14: Settings modal — TZ picker with browser auto-detect

**Files:**
- Modify: `components/SettingsModal.tsx`
- Test: `__tests__/components/SettingsModal-tz.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SettingsModal from '@/components/SettingsModal'

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response)) as typeof fetch

describe('SettingsModal — TZ picker', () => {
  it('auto-fills with browser TZ when member has none', () => {
    render(<SettingsModal open onClose={() => {}} member={{ timezone: null } as any} />)
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect((screen.getByLabelText(/timezone/i) as HTMLSelectElement).value).toBe(browserTz)
  })
  it('PATCHes /api/me/timezone on change', async () => {
    render(<SettingsModal open onClose={() => {}} member={{ timezone: 'Europe/Riga' } as any} />)
    fireEvent.change(screen.getByLabelText(/timezone/i), { target: { value: 'Asia/Tokyo' } })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/me/timezone', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('Asia/Tokyo'),
    })))
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx jest __tests__/components/SettingsModal-tz.test.tsx`
Expected: FAIL — picker not present.

- [ ] **Step 3: Add picker UI**

In `components/SettingsModal.tsx`, add a `<select aria-label="Timezone">` populated from `Intl.supportedValuesOf('timeZone')`. Initial value: `member.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`. On change: PATCH `/api/me/timezone` with `{ timezone: newValue }`.

- [ ] **Step 4: Run, verify pass**

Run: `npx jest __tests__/components/SettingsModal-tz.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SettingsModal.tsx __tests__/components/SettingsModal-tz.test.tsx
git commit -m "feat(tz): timezone picker in Settings with browser auto-detect"
```

---

## Task 15: Booking page — viewer TZ flow

**Files:**
- Modify: `components/BookingPage.tsx`
- Modify: `app/api/share/[token]/availability/route.ts`
- Modify: `app/api/share/[token]/book/route.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/share-availability-tz.test.ts`:

```ts
import { GET } from '@/app/api/share/[token]/availability/route'

describe('availability — viewer TZ', () => {
  it('returns slots formatted in the requested viewerTz', async () => {
    // Set up: host TZ Europe/Riga, slot 09:00-10:00 local Riga (06:00-07:00 UTC).
    // Caller passes ?tz=Asia/Tokyo. Expect slot start = "15:00" (Tokyo equivalent).
  })
})
```

- [ ] **Step 2: Update availability route**

Accept `tz` query param (`searchParams.get('tz')`). Validate via `isValidTimezone`. Convert each slot's UTC instant to the viewer TZ before returning.

- [ ] **Step 3: Update book route**

Accept `viewerTz` in body. When constructing the event for the host calendar, the wall-clock time is the booker's selection in their TZ — convert to UTC, then to the host's source TZ.

- [ ] **Step 4: Update BookingPage.tsx**

The component already reads `browserTz` at line 42. Pass it as `?tz=` to the availability fetch and as `viewerTz` in the book POST body. Optionally add a TZ override `<select>` near the existing display.

- [ ] **Step 5: Manual verify**

```bash
npm run dev
```
Open the booking page in a browser whose TZ is `Asia/Tokyo` (use Chrome DevTools sensors to override). Confirm:
- Slots render in JST.
- After booking, the host's calendar event is stored in the host's TZ correctly.

- [ ] **Step 6: Commit**

```bash
git add components/BookingPage.tsx app/api/share/[token]/availability/route.ts app/api/share/[token]/book/route.ts __tests__/api/share-availability-tz.test.ts
git commit -m "feat(tz): booking page uses viewer browser TZ + override"
```

---

## Task 16: Share ICS feed — parameterized VTIMEZONE

**Files:**
- Modify: `app/api/share/[token]/feed.ics/route.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/share-feed-tz.test.ts`:

```ts
import { GET } from '@/app/api/share/[token]/feed.ics/route'

describe('feed.ics — VTIMEZONE', () => {
  it('emits VTIMEZONE matching share owner TZ', async () => {
    // Mock share link → owner with timezone 'Asia/Tokyo'.
    // Call GET, read body text, expect 'TZID:Asia/Tokyo' and no 'Europe/Riga'.
  })
})
```

- [ ] **Step 2: Modify route**

At lines 157, 196, 200, replace literal `'Europe/Riga'` with the resolved share-owner TZ:

```ts
import { getMemberTimezone } from '@/lib/accountTimezone'
const ownerTz = await getMemberTimezone(shareLink.account_id, shareLink.owner_email)
// ...
'Prefer': `outlook.timezone="${ownerTz}"`,
// VTIMEZONE block:
'x-wr-timezone': ownerTz,
'tzid': ownerTz,
```

Also pass `ownerTz` as the `timezone` option to `fetchIcsEvents()` (Task 5 made this parameterizable).

- [ ] **Step 3: Run, verify pass**

Run: `npx jest __tests__/api/share-feed-tz.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/share/[token]/feed.ics/route.ts __tests__/api/share-feed-tz.test.ts
git commit -m "feat(tz): share ICS feed emits owner timezone in VTIMEZONE"
```

---

## Task 17: Cache layer — widen read range by ±1 day

**Files:**
- Modify: `lib/cache/events.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/cache/events-tz.test.ts`:

```ts
import { getCachedEvents } from '@/lib/cache/events'

describe('cached events — TZ-aware read', () => {
  it('returns an event near midnight that buckets to a different date in viewer TZ', async () => {
    // Seed cached_events with date='2026-04-27', start='23:30' UTC bucket.
    // Query with viewerTz='Asia/Tokyo' (08:30 next day) and dateRange=2026-04-28..2026-04-28.
    // Expect the event to come back (because read widens by ±1 day and re-buckets).
  })
})
```

- [ ] **Step 2: Modify lib/cache/events.ts**

In the read query (lines 30-34, 40-46 per surface map), widen the BETWEEN range:

```ts
// Before: WHERE date BETWEEN $start AND $end
// After:
const widenedStart = subtractDays($start, 1)
const widenedEnd = addDays($end, 1)
// Query rows with widenedStart..widenedEnd, then re-bucket each row's payload start time
// using bucketDateInTz(payload.startUtc, viewerTz) and filter to [$start, $end].
```

Pass `viewerTz` into `getCachedEvents` from the route handlers that consume it.

- [ ] **Step 3: Run, verify pass**

Run: `npx jest __tests__/cache/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/cache/events.ts __tests__/cache/events-tz.test.ts
git commit -m "feat(tz): cache reads widen ±1 day and re-bucket per viewer TZ"
```

---

## Task 18: End-to-end smoke test

**Files:**
- (No new files — manual verification + scripted check.)

- [ ] **Step 1: Set up two test members in different TZs**

```bash
psql $DATABASE_URL -c "UPDATE account_members SET timezone='Asia/Tokyo' WHERE email='tester-tokyo@x.com'"
psql $DATABASE_URL -c "UPDATE account_members SET timezone='Europe/Riga' WHERE email='tester-riga@x.com'"
```

- [ ] **Step 2: Verify Outlook read paths**

Log in as tokyo user. Open browser devtools network tab. Trigger an Outlook events fetch. Confirm the request includes `Prefer: outlook.timezone="Asia/Tokyo"`.

Log in as riga user. Same check, expect `Europe/Riga`.

- [ ] **Step 3: Verify activity create**

As tokyo user, create an Outlook event for 14:00 on a future date. Confirm in Outlook web (in a Tokyo-locale browser) that the event lands at 14:00 JST.

- [ ] **Step 4: Verify booking flow**

Create a share link as a Riga host. Open the booking page in a Tokyo-locale browser (use Chrome DevTools location override). Confirm slots appear in JST. Book a slot. In Outlook web (Riga locale), verify the event is at the correct local time.

- [ ] **Step 5: Verify task write**

As tokyo user, create an Outlook task with due date today. Inspect the Graph payload (devtools): expect `dueDateTime: { dateTime: 'YYYY-MM-DDT00:00:00', timeZone: 'Asia/Tokyo' }`.

- [ ] **Step 6: Final commit (if any leftovers)**

```bash
git status
# If clean, no commit needed.
```

---

## Self-Review Notes

- All 22 hardcoded `Europe/Riga` callsites are addressed in Tasks 5-13, 15-16. Verify with `grep -rn "Europe/Riga" --include='*.ts' --include='*.tsx' .` after Task 16 — only `lib/timezone.ts` (the `FALLBACK_TZ` constant) and migration 27 should remain.
- All 8 `toLocale*` callsites are addressed in Tasks 5 (icsParser) and 13 (FavoriteDetailModal + 5 admin pages).
- Outlook task write path inconsistency (was `UTC`) is fixed in Task 7.
- Cache wipe is bundled into migration 27 (Task 1) — read widening in Task 17 covers ongoing TZ-mismatched reads.
- Booking flow (Task 15) handles non-logged-in viewers; Settings (Task 14) handles logged-in viewers; both auto-detect with explicit override per the spec.
