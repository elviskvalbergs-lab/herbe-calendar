# Public Holidays Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show public holidays per person's country in all calendar views and block booking availability on holidays by default, using openholidaysapi.org.

**Architecture:** New `lib/holidays.ts` client fetches and caches holidays in `cached_holidays` DB table. Admin sets default country per account, optional per-person override in members page. CalendarGrid shows holiday background on date headers. MonthNavigator shows reddish background squares for holidays. Booking availability skips holiday dates unless template allows it.

**Tech Stack:** Next.js App Router, openholidaysapi.org REST API, PostgreSQL, date-fns

**Spec:** `docs/superpowers/specs/2026-04-11-holidays-integration-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `db/migrations/17_add_holidays.sql` | Schema for cached_holidays + account/person country columns |
| `lib/holidays.ts` | Holiday API client, DB caching, country resolution |
| `app/api/holidays/route.ts` | GET holidays for persons in a date range |
| `app/api/holidays/countries/route.ts` | GET available countries list |

### Modified files
| File | Change |
|------|--------|
| `types/index.ts` | Add Holiday type |
| `app/api/admin/config/route.ts` | Handle holiday config save |
| `app/admin/config/ConfigClient.tsx` | Holiday config section |
| `app/admin/config/page.tsx` | Load and pass holiday config |
| `app/api/admin/members/route.ts` | Handle holidayCountry field |
| `app/admin/members/MembersClient.tsx` | Per-person country dropdown |
| `components/CalendarGrid.tsx` | Holiday background on date headers |
| `components/CalendarShell.tsx` | Fetch holidays, pass to grid |
| `components/MonthNavigator.tsx` | Reddish background for holiday dates |
| `app/api/activities/summary/route.ts` | Include holidays in summary response |
| `app/api/share/[token]/availability/route.ts` | Skip holiday dates in availability |
| `app/api/share/[token]/book/route.ts` | Check holidays before booking |
| `components/BookingTemplateEditor.tsx` | "Allow booking on holidays" toggle |

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/17_add_holidays.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Cached holidays per country per year
CREATE TABLE IF NOT EXISTS cached_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  year        INT NOT NULL,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  name_en     TEXT,
  type        TEXT NOT NULL DEFAULT 'Public',
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_code, date)
);

CREATE INDEX IF NOT EXISTS idx_cached_holidays_lookup
  ON cached_holidays(country_code, year);

-- Default holiday country per account
ALTER TABLE tenant_accounts ADD COLUMN IF NOT EXISTS holiday_country TEXT;

-- Per-person holiday country override
ALTER TABLE person_codes ADD COLUMN IF NOT EXISTS holiday_country TEXT;

-- Booking template: allow booking on holidays
ALTER TABLE booking_templates ADD COLUMN IF NOT EXISTS allow_holidays BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/17_add_holidays.sql
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/17_add_holidays.sql
git commit -m "feat: add holidays schema — cached_holidays table, country columns, allow_holidays"
```

---

### Task 2: Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add Holiday type**

Add after the existing types:

```typescript
/** A public holiday */
export interface Holiday {
  date: string          // YYYY-MM-DD
  name: string          // Localized name
  nameEn?: string       // English name
  country: string       // ISO country code
  type: string          // Public, National, etc.
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add Holiday type"
```

---

### Task 3: Holiday Client Library

**Files:**
- Create: `lib/holidays.ts`

- [ ] **Step 1: Write the holidays client**

```typescript
import { pool } from '@/lib/db'
import type { Holiday } from '@/types'

const API_BASE = 'https://openholidaysapi.org'

/** Fetch holidays from openholidaysapi.org */
async function fetchFromApi(countryCode: string, year: number): Promise<Holiday[]> {
  const res = await fetch(
    `${API_BASE}/PublicHolidays?countryIsoCode=${countryCode}&languageIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31`
  )
  if (!res.ok) {
    console.warn(`[holidays] API fetch failed for ${countryCode}/${year}: ${res.status}`)
    return []
  }
  const data = await res.json()
  return (data as any[]).map(h => ({
    date: h.startDate,
    name: h.name?.[0]?.text ?? h.startDate,
    nameEn: h.name?.find((n: any) => n.language === 'EN')?.text,
    country: countryCode,
    type: h.type ?? 'Public',
  }))
}

/** Get holidays for a country+year, caching in DB. */
export async function getHolidays(countryCode: string, year: number): Promise<Holiday[]> {
  // Check DB cache
  const { rows } = await pool.query(
    'SELECT date::text, name, name_en, country_code, type FROM cached_holidays WHERE country_code = $1 AND year = $2',
    [countryCode, year]
  )
  if (rows.length > 0) {
    return rows.map(r => ({
      date: r.date,
      name: r.name,
      nameEn: r.name_en,
      country: r.country_code,
      type: r.type,
    }))
  }

  // Fetch from API and cache
  const holidays = await fetchFromApi(countryCode, year)
  for (const h of holidays) {
    await pool.query(
      `INSERT INTO cached_holidays (country_code, year, date, name, name_en, type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (country_code, date) DO UPDATE SET name = $4, name_en = $5, type = $6, fetched_at = now()`,
      [countryCode, year, h.date, h.name, h.nameEn ?? null, h.type]
    )
  }
  return holidays
}

/** Get holidays for multiple countries in a date range. Returns Map<dateStr, Holiday[]>. */
export async function getHolidaysForRange(
  countryCodes: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, Holiday[]>> {
  const uniqueCountries = [...new Set(countryCodes)]
  const yearFrom = parseInt(dateFrom.slice(0, 4))
  const yearTo = parseInt(dateTo.slice(0, 4))

  const allHolidays: Holiday[] = []
  for (const cc of uniqueCountries) {
    for (let y = yearFrom; y <= yearTo; y++) {
      allHolidays.push(...(await getHolidays(cc, y)))
    }
  }

  const result = new Map<string, Holiday[]>()
  for (const h of allHolidays) {
    if (h.date >= dateFrom && h.date <= dateTo) {
      const existing = result.get(h.date) ?? []
      existing.push(h)
      result.set(h.date, existing)
    }
  }
  return result
}

/** Resolve holiday country for a person: person override > account default > null */
export async function getPersonHolidayCountry(personCode: string, accountId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT p.holiday_country AS person_country, a.holiday_country AS account_country
     FROM person_codes p
     JOIN tenant_accounts a ON a.id = p.account_id
     WHERE p.generated_code = $1 AND p.account_id = $2`,
    [personCode, accountId]
  )
  if (rows.length === 0) return null
  return rows[0].person_country || rows[0].account_country || null
}

/** Resolve holiday countries for multiple persons. Returns Map<personCode, countryCode>. */
export async function getPersonsHolidayCountries(
  personCodes: string[],
  accountId: string,
): Promise<Map<string, string>> {
  const { rows } = await pool.query(
    `SELECT p.generated_code, p.holiday_country AS person_country, a.holiday_country AS account_country
     FROM person_codes p
     JOIN tenant_accounts a ON a.id = p.account_id
     WHERE p.generated_code = ANY($1) AND p.account_id = $2`,
    [personCodes, accountId]
  )
  const result = new Map<string, string>()
  for (const r of rows) {
    const cc = r.person_country || r.account_country
    if (cc) result.set(r.generated_code, cc)
  }
  return result
}

/** Get available countries from the API (cached in memory). */
let countriesCache: { code: string; name: string }[] | null = null
export async function getAvailableCountries(): Promise<{ code: string; name: string }[]> {
  if (countriesCache) return countriesCache
  try {
    const res = await fetch(`${API_BASE}/Countries?languageIsoCode=EN`)
    if (!res.ok) return []
    const data = await res.json()
    countriesCache = (data as any[]).map(c => ({
      code: c.isoCode,
      name: c.name?.[0]?.text ?? c.isoCode,
    })).sort((a, b) => a.name.localeCompare(b.name))
    return countriesCache
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
```

- [ ] **Step 3: Commit**

```bash
git add lib/holidays.ts
git commit -m "feat: holidays client — API fetch, DB cache, country resolution"
```

---

### Task 4: Holiday API Endpoints

**Files:**
- Create: `app/api/holidays/route.ts`
- Create: `app/api/holidays/countries/route.ts`

- [ ] **Step 1: Write the holidays endpoint**

`app/api/holidays/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getPersonsHolidayCountries, getHolidaysForRange } from '@/lib/holidays'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons') ?? ''
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? dateFrom

  if (!persons || !dateFrom) return NextResponse.json({})

  const personCodes = persons.split(',').map(p => p.trim())
  const countryMap = await getPersonsHolidayCountries(personCodes, session.accountId)
  const countryCodes = [...new Set(countryMap.values())]

  if (countryCodes.length === 0) return NextResponse.json({})

  const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)

  // Convert Map to plain object for JSON
  const result: Record<string, { name: string; country: string }[]> = {}
  for (const [date, hols] of holidays) {
    result[date] = hols.map(h => ({ name: h.name, country: h.country }))
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 2: Write the countries endpoint**

`app/api/holidays/countries/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAvailableCountries } from '@/lib/holidays'

export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const countries = await getAvailableCountries()
  return NextResponse.json(countries)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/holidays/route.ts app/api/holidays/countries/route.ts
git commit -m "feat: holidays API endpoints — get holidays for persons, list countries"
```

---

### Task 5: Admin Config — Holidays Section

**Files:**
- Modify: `app/api/admin/config/route.ts`
- Modify: `app/admin/config/ConfigClient.tsx`
- Modify: `app/admin/config/page.tsx`

- [ ] **Step 1: Add holiday config to admin API**

In `app/api/admin/config/route.ts` PUT handler, add a case for `type === 'holidays'`:

```typescript
if (body.type === 'holidays') {
  await pool.query(
    'UPDATE tenant_accounts SET holiday_country = $1 WHERE id = $2',
    [body.holidayCountry || null, accountId]
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Load holiday config in page.tsx**

In `app/admin/config/page.tsx`, query the account's holiday_country and pass it to ConfigClient:

```typescript
const holidayCountry = accountRow?.holiday_country ?? null
```

Pass as prop: `holidayCountry={holidayCountry}`

- [ ] **Step 3: Add Holidays section to ConfigClient**

Add state:
```typescript
const [holidayCountry, setHolidayCountry] = useState(initialHolidayCountry ?? '')
const [holidayCountries, setHolidayCountries] = useState<{ code: string; name: string }[]>([])
const [holidayStatus, setHolidayStatus] = useState('')
```

Fetch countries on section open:
```typescript
useEffect(() => {
  if (isSectionOpen('holidays')) {
    fetch('/api/holidays/countries').then(r => r.json()).then(setHolidayCountries).catch(() => {})
  }
}, [/* section open state */])
```

Add UI section after Zoom:
```tsx
<section className="bg-surface border border-border rounded-xl overflow-hidden">
  <button onClick={() => toggleSection('holidays')} className="w-full flex items-center justify-between p-4 text-left hover:bg-border/20">
    <span className="font-bold text-sm">Public Holidays</span>
    {initialHolidayCountry && <span className="text-[10px] text-green-400 font-bold">{initialHolidayCountry}</span>}
  </button>
  {isSectionOpen('holidays') && (
    <div className="p-4 border-t border-border space-y-3">
      <div>
        <label className="text-xs text-text-muted block mb-1">Default Holiday Country</label>
        <select
          value={holidayCountry}
          onChange={e => setHolidayCountry(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Disabled</option>
          {holidayCountries.map(c => (
            <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>
      </div>
      {holidayStatus && <p className="text-xs text-text-muted">{holidayStatus}</p>}
      <button onClick={async () => {
        setHolidayStatus('Saving...')
        const res = await fetch('/api/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'holidays', holidayCountry: holidayCountry || null }),
        })
        setHolidayStatus(res.ok ? 'Saved!' : 'Error')
      }} className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg">
        Save Holiday Config
      </button>
    </div>
  )}
</section>
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add app/api/admin/config/route.ts app/admin/config/ConfigClient.tsx app/admin/config/page.tsx
git commit -m "feat: holidays admin config — default country selection"
```

---

### Task 6: Members Page — Per-Person Holiday Country

**Files:**
- Modify: `app/api/admin/members/route.ts`
- Modify: `app/admin/members/MembersClient.tsx`

- [ ] **Step 1: Handle holidayCountry in members API**

In the PATCH handler of `app/api/admin/members/route.ts`, add support for updating `holiday_country`:

```typescript
if (body.holidayCountry !== undefined) {
  await pool.query(
    'UPDATE person_codes SET holiday_country = $1 WHERE id = $2 AND account_id = $3',
    [body.holidayCountry || null, body.id, session.accountId]
  )
}
```

Also include `holiday_country` in the GET response when loading members.

- [ ] **Step 2: Add country dropdown in MembersClient**

Read the file first to understand the member table layout. Add a small country dropdown or badge per member row. Fetch available countries from `/api/holidays/countries`.

The dropdown should show:
- "Default" (empty value — inherits from account)
- All available countries

On change, PATCH the member with `{ id, holidayCountry }`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add app/api/admin/members/route.ts app/admin/members/MembersClient.tsx
git commit -m "feat: per-person holiday country override in members page"
```

---

### Task 7: CalendarShell + CalendarGrid — Holiday Background

**Files:**
- Modify: `components/CalendarShell.tsx`
- Modify: `components/CalendarGrid.tsx`

- [ ] **Step 1: Fetch holidays in CalendarShell**

Add state:
```typescript
const [holidays, setHolidays] = useState<Record<string, { name: string; country: string }[]>>({})
```

In the activity fetch function (or a parallel useEffect), fetch holidays for the visible date range:

```typescript
// After activities are fetched, or in parallel:
const personCodes = state.selectedPersons.map(p => p.code).join(',')
if (personCodes) {
  fetch(`/api/holidays?persons=${personCodes}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
    .then(r => r.ok ? r.json() : {})
    .then(setHolidays)
    .catch(() => {})
}
```

Pass `holidays` to CalendarGrid as a prop.

- [ ] **Step 2: Show holiday background in CalendarGrid date headers**

In CalendarGrid, receive `holidays` prop:
```typescript
holidays?: Record<string, { name: string; country: string }[]>
```

In the date header rendering (around line 248), check if the date has holidays:

```typescript
const dateHolidays = holidays?.[date]
const isHoliday = dateHolidays && dateHolidays.length > 0
```

Add a holiday background and name:
- The date column wrapper gets a subtle reddish background: `bg-red-500/5` or similar
- The date header shows the holiday name as a tooltip or small text below the date

```tsx
<div className={`h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold tracking-wide relative ${isHoliday ? 'bg-red-500/10' : ''}`}>
  ...existing date label...
  {isHoliday && (
    <span className="text-[8px] text-red-400 absolute bottom-0 left-1/2 -translate-x-1/2 truncate max-w-full px-1" title={dateHolidays.map(h => h.name).join(', ')}>
      {dateHolidays[0].name}
    </span>
  )}
</div>
```

Adjust the header height from `h-6` to `h-8` when there's a holiday name to display, or use a tooltip instead.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/CalendarShell.tsx components/CalendarGrid.tsx
git commit -m "feat: holiday background and name in calendar day headers"
```

---

### Task 8: MonthNavigator — Holiday Background Squares

**Files:**
- Modify: `components/MonthNavigator.tsx`

- [ ] **Step 1: Include holidays in summary response**

First modify `app/api/activities/summary/route.ts` to include holidays. After computing the activity summary, fetch holidays and add them:

```typescript
// After the activity summary is built:
const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
const countryMap = await getPersonsHolidayCountries(personList, session.accountId)
const countryCodes = [...new Set(countryMap.values())]
let holidayDates: Record<string, { name: string; country: string }[]> = {}
if (countryCodes.length > 0) {
  const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)
  for (const [date, hols] of holidays) {
    holidayDates[date] = hols.map(h => ({ name: h.name, country: h.country }))
  }
}

// Return both
return NextResponse.json({ summary: serialized, holidays: holidayDates })
```

Update the cache structure to include holidays.

- [ ] **Step 2: Update MonthNavigator to show holiday backgrounds**

Update the summary fetch to handle the new response shape:

```typescript
const [holidays, setHolidays] = useState<Record<string, { name: string; country: string }[]>>({})

// In the fetch handler:
.then((data) => {
  if (data.summary) {
    setSummary(data.summary)
    setHolidays(data.holidays ?? {})
  } else {
    // Backward compat: old format was flat summary
    setSummary(data)
  }
})
```

In the day cell rendering, add holiday check:

```typescript
const dateHolidays = holidays[dateStr]
const isHoliday = dateHolidays && dateHolidays.length > 0
```

Update the cell className to use reddish background for holidays (higher priority than the gray range highlight):

```typescript
className={[
  'flex flex-col items-center py-1 rounded-lg text-xs transition-colors',
  !inMonth ? 'opacity-30' : '',
  isHoliday ? 'bg-red-500/15' : inRange ? 'bg-border/60' : 'hover:bg-border/30',
].join(' ')}
```

Add tooltip with holiday name:

```typescript
title={isHoliday ? dateHolidays.map(h => h.name).join(', ') : undefined}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/MonthNavigator.tsx app/api/activities/summary/route.ts
git commit -m "feat: holiday background squares in month navigator"
```

---

### Task 9: Booking Availability — Holiday Blocking

**Files:**
- Modify: `app/api/share/[token]/availability/route.ts`
- Modify: `app/api/share/[token]/book/route.ts`
- Modify: `components/BookingTemplateEditor.tsx`

- [ ] **Step 1: Add "Allow booking on holidays" toggle to BookingTemplateEditor**

Add state:
```typescript
const [allowHolidays, setAllowHolidays] = useState(!!template?.allow_holidays)
```

Add UI after the Zoom section:

```tsx
{/* Holidays */}
<div className="p-3 border border-border rounded-lg space-y-2">
  <label className="flex items-center gap-2 text-xs cursor-pointer">
    <input type="checkbox" checked={allowHolidays} onChange={e => setAllowHolidays(e.target.checked)} className="accent-primary" />
    <span className="font-bold">Allow booking on public holidays</span>
  </label>
</div>
```

Include in save payload:
```typescript
allow_holidays: allowHolidays,
```

- [ ] **Step 2: Block holidays in availability endpoint**

In `app/api/share/[token]/availability/route.ts`, after computing busy blocks and before computing slots:

```typescript
// Holiday blocking
const template = templateRows[0]
if (!template.allow_holidays) {
  const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
  const countryMap = await getPersonsHolidayCountries(personCodes, accountId)
  const countryCodes = [...new Set(countryMap.values())]
  if (countryCodes.length > 0) {
    const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)
    // Remove holiday dates from slot computation by not generating slots for them
    for (const holidayDate of holidays.keys()) {
      // Mark entire day as blocked — skip in the slot loop below
      holidayDates.add(holidayDate)
    }
  }
}
```

In the slot computation loop, skip holiday dates:

```typescript
const holidayDates = new Set<string>()
// ... holiday fetching above populates this ...

while (current <= end) {
  const dateStr = current.toISOString().slice(0, 10)
  if (!holidayDates.has(dateStr)) {
    const dayBusy = busyByDate.get(dateStr) ?? []
    const daySlots = computeAvailableSlots(dateStr, windows, dayBusy, durationMinutes, bufferMinutes)
    if (daySlots.length > 0) slots[dateStr] = daySlots
  }
  current.setDate(current.getDate() + 1)
}
```

- [ ] **Step 3: Check holidays in book endpoint**

In `app/api/share/[token]/book/route.ts`, before confirming the booking, verify the date isn't a holiday (unless allow_holidays):

```typescript
if (!template.allow_holidays) {
  const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
  const countryMap = await getPersonsHolidayCountries(personCodes, accountId)
  const countryCodes = [...new Set(countryMap.values())]
  if (countryCodes.length > 0) {
    const holidays = await getHolidaysForRange(countryCodes, date, date)
    if (holidays.has(date)) {
      return NextResponse.json({ error: 'Cannot book on a public holiday' }, { status: 400 })
    }
  }
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add app/api/share/[token]/availability/route.ts app/api/share/[token]/book/route.ts components/BookingTemplateEditor.tsx
git commit -m "feat: holidays block booking availability with per-template override"
```

---

### Task 10: Deploy & Test

- [ ] **Step 1: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/17_add_holidays.sql
```

- [ ] **Step 2: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
git checkout main
```

- [ ] **Step 3: Test**

1. Admin: set default holiday country to LV in /admin/config
2. Calendar: verify Latvian holidays show as background on date headers
3. Month navigator: verify reddish background squares on holidays
4. Members: override one person to EE, verify Estonian holidays show in their column
5. Booking: verify holidays are excluded from availability slots
6. Booking: enable "Allow holidays" on a template, verify holiday slots appear
