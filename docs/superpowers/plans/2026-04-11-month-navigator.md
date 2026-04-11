# Month Navigator & 7-Day View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7-day view to the view selector, and replace the native date picker with a month calendar overlay that shows source-colored activity dots (mobile) or event titles (desktop), with week number navigation.

**Architecture:** Extend the `CalendarState.view` type to include `'7day'`. Create a new `MonthNavigator` component that renders a calendar grid overlay. A new lightweight `/api/activities/summary` endpoint returns dates→sources for a whole month, cached 5min. CalendarHeader opens the navigator instead of the native date picker.

**Tech Stack:** Next.js App Router, React, date-fns, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-11-month-navigator-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `components/MonthNavigator.tsx` | Month calendar overlay with dots/titles, week numbers |
| `app/api/activities/summary/route.ts` | Lightweight date→sources summary endpoint |

### Modified files
| File | Change |
|------|--------|
| `types/index.ts` | Add `'7day'` to CalendarState.view union |
| `components/CalendarHeader.tsx` | Add 7day to view buttons, replace date picker with MonthNavigator |
| `components/CalendarShell.tsx` | 7-day date range calc, keyboard shortcut, pass props to header |
| `components/CalendarGrid.tsx` | Handle 7day in `isMultiDay` and `is3Day` checks |
| `components/FavoritesDropdown.tsx` | Show "7D" label for 7day favorites |
| `components/FavoriteDetailModal.tsx` | Show "7-day" label |
| `app/api/settings/favorites/route.ts` | Allow '7day' in view CHECK constraint |

---

### Task 1: Types — Add 7-Day View

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Extend CalendarState view type**

Find `CalendarState` interface. Change:
```typescript
view: 'day' | '3day' | '5day'
```
to:
```typescript
view: 'day' | '3day' | '5day' | '7day'
```

- [ ] **Step 2: Update favorites DB constraint**

The `user_favorites` table has a CHECK constraint: `view IN ('day', '3day', '5day')`. Add '7day':

```sql
ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_view_check;
ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_view_check CHECK (view IN ('day', '3day', '5day', '7day'));
```

Run this against the DB: `source .env.local && psql "$DATABASE_URL" -c "ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_view_check; ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_view_check CHECK (view IN ('day', '3day', '5day', '7day'));"` 

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add 7day to CalendarState view type"
```

---

### Task 2: CalendarShell — 7-Day Support

**Files:**
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Update date range calculation**

Find the `dateTo` calculation (around line 530). Change:
```typescript
const dateTo = state.view === '5day'
  ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
  : state.view === '3day'
  ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
  : state.date
```
to:
```typescript
const dateTo = state.view === '7day'
  ? format(addDays(parseISO(state.date), 6), 'yyyy-MM-dd')
  : state.view === '5day'
  ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
  : state.view === '3day'
  ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
  : state.date
```

- [ ] **Step 2: Add keyboard shortcut for 7-day view**

Find the keyboard shortcut handler (around line 229). There should be cases for `1`, `3`, `5` keys. Add after the `5` case:

```typescript
} else if (e.key === '7') {
  e.preventDefault()
  setState(s => ({ ...s, view: '7day' }))
```

- [ ] **Step 3: Commit**

```bash
git add components/CalendarShell.tsx
git commit -m "feat: 7-day date range calculation and keyboard shortcut"
```

---

### Task 3: CalendarHeader — Add 7-Day Button & MonthNavigator State

**Files:**
- Modify: `components/CalendarHeader.tsx`
- Modify: `components/CalendarGrid.tsx`
- Modify: `components/FavoritesDropdown.tsx`
- Modify: `components/FavoriteDetailModal.tsx`

- [ ] **Step 1: Add 7day to view toggle buttons**

In CalendarHeader, find the view toggle (around line 102):
```typescript
{(['day', '3day', '5day'] as const).map(v => (
```
Change to:
```typescript
{(['day', '3day', '5day', '7day'] as const).map(v => (
```

Update the label (around line 108):
```typescript
{v === 'day' ? 'Day' : v === '3day' ? '3 Day' : '5 Day'}
```
to:
```typescript
{v === 'day' ? 'Day' : v === '3day' ? '3D' : v === '5day' ? '5D' : '7D'}
```

- [ ] **Step 2: Update viewStep for 7-day**

In CalendarHeader, find:
```typescript
const viewStep = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
```
Change to:
```typescript
const viewStep = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
```

- [ ] **Step 3: Update CalendarGrid isMultiDay checks**

In CalendarGrid, find (around line 223):
```typescript
is3Day={state.view === '3day' || state.view === '5day'}
```
Change to:
```typescript
is3Day={state.view !== 'day'}
```

Find (around line 238):
```typescript
const isMultiDay = state.view === '3day' || state.view === '5day'
```
Change to:
```typescript
const isMultiDay = state.view !== 'day'
```

- [ ] **Step 4: Update FavoritesDropdown label**

Find the view label (around line 99):
```typescript
{fav.view === 'day' ? 'Day' : fav.view === '3day' ? '3D' : '5D'}
```
Change to:
```typescript
{fav.view === 'day' ? 'Day' : fav.view === '3day' ? '3D' : fav.view === '5day' ? '5D' : '7D'}
```

- [ ] **Step 5: Update FavoriteDetailModal label**

Find the view label (around line 205):
```typescript
{favorite.view === 'day' ? 'Day' : favorite.view === '3day' ? '3-day' : '5-day'} view
```
Change to:
```typescript
{favorite.view === 'day' ? 'Day' : favorite.view === '3day' ? '3-day' : favorite.view === '5day' ? '5-day' : '7-day'} view
```

- [ ] **Step 6: Verify compilation and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/CalendarHeader.tsx components/CalendarGrid.tsx components/FavoritesDropdown.tsx components/FavoriteDetailModal.tsx
git commit -m "feat: 7-day view button and multi-day layout support"
```

---

### Task 4: Activity Summary API

**Files:**
- Create: `app/api/activities/summary/route.ts`

- [ ] **Step 1: Write the summary endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { getUserGoogleAccounts, getValidAccessToken } from '@/lib/google/userOAuth'
import { getOAuthCalendarClient } from '@/lib/google/client'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { graphFetch } from '@/lib/graph/client'
import { emailForCode } from '@/lib/emailForCode'
import { isCalendarRecord, parsePersons } from '@/lib/herbe/recordUtils'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'

type DaySummary = { sources: string[]; count: number }
const cache = new Map<string, { data: Record<string, DaySummary>; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons') ?? ''
  const month = searchParams.get('month') ?? format(new Date(), 'yyyy-MM')

  if (!persons) return NextResponse.json({})

  const cacheKey = `${session.accountId}:${persons}:${month}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { 'Cache-Control': 'no-store' } })
  }

  const dateFrom = `${month}-01`
  const dateTo = format(endOfMonth(parseISO(dateFrom)), 'yyyy-MM-dd')
  const personList = persons.split(',').map(p => p.trim())
  const personSet = new Set(personList)
  const result: Record<string, { sources: Set<string>; count: number }> = {}

  function addEntry(date: string, source: string) {
    if (!result[date]) result[date] = { sources: new Set(), count: 0 }
    result[date].sources.add(source)
    result[date].count++
  }

  // ERP
  try {
    const connections = await getErpConnections(session.accountId)
    for (const conn of connections) {
      try {
        const raw = await herbeFetchAll(REGISTERS.activities, { sort: 'TransDate', range: `${dateFrom}:${dateTo}` }, 100, conn)
        for (const record of raw) {
          const r = record as Record<string, unknown>
          if (!isCalendarRecord(r)) continue
          const { main, cc } = parsePersons(r)
          if ([...main, ...cc].some(p => personSet.has(p))) {
            addEntry(String(r['TransDate'] ?? ''), 'herbe')
          }
        }
      } catch {}
    }
  } catch {}

  // Outlook
  try {
    const azureConfig = await getAzureConfig(session.accountId)
    if (azureConfig) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${dateFrom}T00:00:00&endDateTime=${dateTo}T23:59:59&$select=start&$top=500`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of data.value ?? []) {
              const date = ((ev.start as { dateTime?: string })?.dateTime ?? '').slice(0, 10)
              if (date) addEntry(date, 'outlook')
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Google (domain-wide)
  try {
    const googleConfig = await getGoogleConfig(session.accountId)
    if (googleConfig) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            singleEvents: true,
            fields: 'items(start)',
            maxResults: 500,
          })
          for (const ev of res.data.items ?? []) {
            const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
            if (date) addEntry(date, 'google')
          }
        } catch {}
      }
    }
  } catch {}

  // Google (per-user)
  try {
    const userAccounts = await getUserGoogleAccounts(session.email, session.accountId)
    for (const account of userAccounts) {
      const enabledCals = account.calendars.filter(c => c.enabled)
      if (enabledCals.length === 0) continue
      const accessToken = await getValidAccessToken(account.id)
      if (!accessToken) continue
      const oauthCal = getOAuthCalendarClient(accessToken)
      for (const cal of enabledCals) {
        try {
          const res = await oauthCal.events.list({
            calendarId: cal.calendarId,
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            singleEvents: true,
            fields: 'items(start)',
            maxResults: 500,
          })
          for (const ev of res.data.items ?? []) {
            const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
            if (date) addEntry(date, `google-user:${account.googleEmail}`)
          }
        } catch {}
      }
    }
  } catch {}

  // Convert Sets to arrays
  const serialized: Record<string, DaySummary> = {}
  for (const [date, entry] of Object.entries(result)) {
    serialized[date] = { sources: [...entry.sources], count: entry.count }
  }

  cache.set(cacheKey, { data: serialized, ts: Date.now() })
  return NextResponse.json(serialized, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/activities/summary/route.ts
git commit -m "feat: activity summary endpoint for month navigator"
```

---

### Task 5: MonthNavigator Component

**Files:**
- Create: `components/MonthNavigator.tsx`

- [ ] **Step 1: Create the MonthNavigator component**

This is the core UI component — a month calendar overlay. It should:

1. Show a month grid (Mon-Sun, weeks as rows)
2. Fetch summary data for the displayed month
3. Show colored dots per source on each day (mobile) or event count badge (desktop is stretch goal — start with dots)
4. Week numbers in left column — clickable
5. Month/year navigation arrows
6. Highlight today and the current date range
7. Click date → onSelectDate callback
8. Click week number → onSelectWeek callback
9. ESC/click-outside → onClose
10. Swipe left/right to change month (mobile)

Key implementation details:
- Use `date-fns` for calendar math: `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `eachDayOfInterval`, `getISOWeek`, `format`, `addMonths`, `subMonths`, `isSameDay`, `isSameMonth`, `isWithinInterval`
- Start week on Monday (`{ weekStartsOn: 1 }`)
- Source colors: map source names to colors using existing constants (HERBE_COLOR, OUTLOOK_COLOR, GOOGLE_COLOR, FALLBACK_COLOR from `@/lib/activityColors`)
- Overlay: fixed position, centered, z-50, dark backdrop

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import {
  format, parseISO, addMonths, subMonths, addDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, getISOWeek, isSameDay, isSameMonth,
  isWithinInterval,
} from 'date-fns'
import { HERBE_COLOR } from '@/lib/calendarVisibility'
```

Props:
```typescript
interface Props {
  open: boolean
  currentDate: string
  currentView: 'day' | '3day' | '5day' | '7day'
  persons: string[]
  onSelectDate: (date: string) => void
  onSelectWeek: (mondayDate: string) => void
  onClose: () => void
}
```

The component fetches `/api/activities/summary?persons=X&month=YYYY-MM` when the displayed month changes and renders the grid.

Source color mapping:
```typescript
function sourceColor(source: string): string {
  if (source === 'herbe') return '#228B22'
  if (source === 'outlook') return '#0078d4'
  if (source === 'google') return '#4285f4'
  if (source.startsWith('google-user:')) return '#34a853'
  return '#888'
}
```

The grid renders 6 rows of 7 days. Each cell shows:
- Date number (dimmed if outside current month)
- Up to 4 colored dots below the number (one per source)
- Today highlighted with a ring/circle
- Current view range highlighted with a background color

Week numbers column on the left — each clickable.

Month navigation: `‹ April 2026 ›` at top. Clicking month name could show a year picker (stretch — start simple with arrows only).

Touch handling: track touchStart X, if swipe > 50px, change month.

- [ ] **Step 2: Commit**

```bash
git add components/MonthNavigator.tsx
git commit -m "feat: MonthNavigator component with dots, week numbers, swipe"
```

---

### Task 6: Wire MonthNavigator into CalendarHeader

**Files:**
- Modify: `components/CalendarHeader.tsx`

- [ ] **Step 1: Add MonthNavigator state and rendering**

Add import:
```typescript
import MonthNavigator from './MonthNavigator'
```

Add state:
```typescript
const [monthNavOpen, setMonthNavOpen] = useState(false)
```

Replace the date picker `<label>` (that currently has the hidden `<input type="date">`) with a button that toggles the month navigator:

```typescript
<button
  onClick={() => setMonthNavOpen(true)}
  className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-sm font-semibold whitespace-nowrap"
  title="Pick a date"
>
  {format(parseISO(state.date), 'd MMM yyyy')}
</button>
```

Remove the `dateInputRef` and the hidden date input.

Add the MonthNavigator component at the end of the header JSX (before the closing fragment):

```typescript
<MonthNavigator
  open={monthNavOpen}
  currentDate={state.date}
  currentView={state.view}
  persons={state.selectedPersons.map(p => p.code)}
  onSelectDate={(date) => {
    onStateChange({ ...state, date })
    setMonthNavOpen(false)
  }}
  onSelectWeek={(monday) => {
    onStateChange({ ...state, view: '7day', date: monday })
    setMonthNavOpen(false)
  }}
  onClose={() => setMonthNavOpen(false)}
/>
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/CalendarHeader.tsx
git commit -m "feat: wire MonthNavigator into CalendarHeader replacing native date picker"
```

---

### Task 7: Deploy & Test

- [ ] **Step 1: Final type check**

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

- [ ] **Step 3: Test**

1. Verify 7-day view works (button + keyboard shortcut 7)
2. Click date in header → month navigator opens
3. Colored dots show for days with activities
4. Click a date → navigates to that date
5. Click a week number → navigates to that week in 7-day view
6. Swipe left/right changes month (mobile)
7. ESC closes the overlay
8. Favorites can be saved with 7-day view
