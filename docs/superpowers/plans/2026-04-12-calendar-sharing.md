# Per-Calendar Sharing & Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set a sharing level (Private/Busy/Titles/Full) on their personally connected calendars (Google OAuth + ICS), so colleagues can see those events in person columns and the booking engine accounts for them.

**Architecture:** Add a `sharing` column to `user_google_calendars` and `user_calendars`. A new `fetchSharedCalendarEvents` function discovers shared calendars for a set of person codes and fetches events at the appropriate visibility level. The existing calendar view, share view, and availability engine call this shared function alongside domain-wide sources. The Settings UI gets a sharing dropdown per calendar.

**Tech Stack:** Next.js App Router, PostgreSQL, existing shared fetch modules (icsUtils, googleUtils)

**Spec:** `docs/superpowers/specs/2026-04-11-calendar-sharing-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `db/migrations/20_add_calendar_sharing.sql` | Add sharing column to both calendar tables |
| `lib/sharedCalendars.ts` | Discover and fetch shared calendar events for person codes |

### Modified files
| File | Change |
|------|--------|
| `types/index.ts` | Add `SharingLevel` type |
| `app/api/google/calendars/route.ts` | Accept `sharing` field in PUT |
| `app/api/settings/calendars/route.ts` | Accept `sharing` field in PUT + return it in GET |
| `components/SettingsModal.tsx` | Add sharing dropdown per Google calendar and ICS feed |
| `app/api/outlook/route.ts` | Include shared calendar events from colleagues |
| `app/api/google/route.ts` | Include shared calendar events from colleagues |
| `app/api/share/[token]/activities/route.ts` | Include shared calendar events |
| `lib/availability.ts` | Include shared calendars in busy blocks (busy+ sharing levels) |
| `app/api/activities/summary/route.ts` | Include shared calendars in summary dots |

---

### Task 1: Database Migration

**Files:**
- Create: `db/migrations/20_add_calendar_sharing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Sharing level for per-user Google calendars
ALTER TABLE user_google_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
-- Values: 'private', 'busy', 'titles', 'full'

-- Sharing level for ICS feeds
ALTER TABLE user_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
```

- [ ] **Step 2: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/20_add_calendar_sharing.sql
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/20_add_calendar_sharing.sql
git commit -m "feat: add sharing column to user_google_calendars and user_calendars"
```

---

### Task 2: Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add SharingLevel type**

```typescript
/** Calendar sharing visibility level */
export type SharingLevel = 'private' | 'busy' | 'titles' | 'full'
```

Add after the existing `Source` type.

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add SharingLevel type"
```

---

### Task 3: Settings UI — Sharing Dropdown

**Files:**
- Modify: `components/SettingsModal.tsx`
- Modify: `app/api/google/calendars/route.ts`
- Modify: `app/api/settings/calendars/route.ts`

- [ ] **Step 1: Add sharing field to Google calendars API**

In `app/api/google/calendars/route.ts`, the PUT handler already accepts `calendarDbId`, `enabled`, and `color`. Add `sharing`:

```typescript
if (typeof sharing === 'string' && ['private', 'busy', 'titles', 'full'].includes(sharing)) {
  updates.push(`sharing = $${paramIdx++}`)
  params.push(sharing)
}
```

Also include `sharing` in the GET response — the `getUserGoogleAccounts` function in `lib/google/userOAuth.ts` returns calendars. Add `sharing` to the SELECT query there.

- [ ] **Step 2: Add sharing field to ICS calendars API**

In `app/api/settings/calendars/route.ts`, find the GET response (returns `customCals`). Include `sharing` in the SELECT. Find the PUT handler. Add `sharing` as an updatable field.

- [ ] **Step 3: Add sharing dropdown to Settings UI**

In `components/SettingsModal.tsx`, for each Google calendar row (inside the Integrations tab), add a sharing dropdown after the color picker:

```tsx
<select
  value={cal.sharing ?? 'private'}
  onChange={async (e) => {
    // Optimistic update
    setGoogleAccounts(prev => prev.map(a => a.id === account.id ? {
      ...a,
      calendars: a.calendars.map(c => c.id === cal.id ? { ...c, sharing: e.target.value } : c)
    } : a))
    await fetch('/api/google/calendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarDbId: cal.id, sharing: e.target.value }),
    })
  }}
  className="bg-bg border border-border rounded text-[9px] px-1 py-0.5"
>
  <option value="private">Private</option>
  <option value="busy">Busy only</option>
  <option value="titles">Titles</option>
  <option value="full">Full details</option>
</select>
```

Do the same for each ICS feed in the ICS section.

- [ ] **Step 4: Update UserGoogleCalendar type**

In `types/index.ts`, add `sharing` to `UserGoogleCalendar`:
```typescript
sharing?: SharingLevel
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add types/index.ts components/SettingsModal.tsx app/api/google/calendars/route.ts app/api/settings/calendars/route.ts lib/google/userOAuth.ts
git commit -m "feat: sharing dropdown per calendar in Settings — Private/Busy/Titles/Full"
```

---

### Task 4: Shared Calendar Discovery & Fetch

**Files:**
- Create: `lib/sharedCalendars.ts`

- [ ] **Step 1: Create the shared calendars module**

This module discovers which users in the account have shared calendars relevant to the requested person codes, fetches events from those calendars, and filters them by visibility level.

```typescript
import { pool } from '@/lib/db'
import { fetchIcsForPerson } from '@/lib/icsUtils'
import { fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import type { Activity, SharingLevel } from '@/types'

interface SharedCalendarEvent {
  id: string
  source: string
  personCode: string
  date: string
  timeFrom: string
  timeTo: string
  description?: string  // only if titles or full
  // ... other fields only if full
  isShared: true
  sharingLevel: SharingLevel
  sharedByEmail: string
}

/**
 * Fetch shared calendar events from other users for a set of person codes.
 * Discovers users who have calendars with sharing != 'private' and fetches
 * events from those calendars, filtering by visibility level.
 */
export async function fetchSharedCalendarEvents(
  personCodes: string[],
  viewerEmail: string,  // The user viewing — exclude their own calendars
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ events: Activity[]; busyBlocks: Map<string, { start: string; end: string }[]> }> {
  const events: Activity[] = []
  const busyBlocks = new Map<string, { start: string; end: string }[]>()

  // 1. Find ICS feeds shared by OTHER users for these person codes
  const { rows: sharedIcs } = await pool.query(
    `SELECT uc.user_email, uc.target_person_code, uc.ics_url, uc.color, uc.name, uc.sharing
     FROM user_calendars uc
     WHERE uc.account_id = $1
       AND uc.target_person_code = ANY($2)
       AND uc.sharing != 'private'
       AND LOWER(uc.user_email) != LOWER($3)`,
    [accountId, personCodes, viewerEmail]
  )

  for (const row of sharedIcs) {
    try {
      const result = await fetchIcsForPerson(row.user_email, row.target_person_code, accountId, dateFrom, dateTo)
      for (const ev of result.events) {
        const date = String(ev.date ?? '')
        const start = String(ev.timeFrom ?? '')
        const end = String(ev.timeTo ?? '')
        if (!date || !start || !end) continue

        // Add to busy blocks (any sharing level above private)
        addBusy(busyBlocks, date, { start, end })

        // Add to visible events based on sharing level
        if (row.sharing === 'busy') {
          events.push({
            id: `shared-ics-${ev.id ?? date + start}`,
            source: 'outlook' as any,
            personCode: row.target_person_code,
            date, timeFrom: start, timeTo: end,
            description: 'Busy',
            isShared: true,
          } as any)
        } else if (row.sharing === 'titles' || row.sharing === 'full') {
          events.push({
            ...ev,
            id: `shared-ics-${ev.id ?? date + start}`,
            isShared: true,
            ...(row.sharing === 'titles' ? { bodyPreview: undefined, textInMatrix: undefined } : {}),
          } as any)
        }
      }
    } catch {}
  }

  // 2. Find per-user Google calendars shared by OTHER users
  const { rows: sharedGoogle } = await pool.query(
    `SELECT gt.user_email, gc.calendar_id, gc.name, gc.color, gc.sharing, gt.id as token_id
     FROM user_google_calendars gc
     JOIN user_google_tokens gt ON gt.id = gc.user_google_token_id
     WHERE gt.account_id = $1
       AND gc.enabled = true
       AND gc.sharing != 'private'
       AND LOWER(gt.user_email) != LOWER($2)`,
    [accountId, viewerEmail]
  )

  // Group by token_id to batch fetch
  const tokenGroups = new Map<string, typeof sharedGoogle>()
  for (const row of sharedGoogle) {
    const group = tokenGroups.get(row.token_id) ?? []
    group.push(row)
    tokenGroups.set(row.token_id, group)
  }

  for (const [tokenId, cals] of tokenGroups) {
    try {
      const { getValidAccessToken } = await import('@/lib/google/userOAuth')
      const { getOAuthCalendarClient } = await import('@/lib/google/client')
      const accessToken = await getValidAccessToken(tokenId)
      if (!accessToken) continue

      const oauthCal = getOAuthCalendarClient(accessToken)
      for (const cal of cals) {
        try {
          const res = await oauthCal.events.list({
            calendarId: cal.calendar_id,
            timeMin: `${dateFrom}T00:00:00+03:00`,
            timeMax: `${dateTo}T23:59:59+03:00`,
            timeZone: 'Europe/Riga',
            singleEvents: true,
            fields: 'items(id,summary,start,end)',
            maxResults: 250,
          })
          for (const ev of res.data.items ?? []) {
            const startStr = ev.start?.dateTime ?? ''
            const endStr = ev.end?.dateTime ?? ''
            if (!startStr || !endStr) continue
            const date = startStr.slice(0, 10)
            const start = startStr.slice(11, 16)
            const end = endStr.slice(11, 16)
            if (!date || !start || !end) continue

            // Busy blocks for all sharing levels
            addBusy(busyBlocks, date, { start, end })

            // Map to event by sharing level
            // Note: these events aren't tied to a specific person code (they're the sharer's calendar)
            // For now, show them in the first person code column
            const personCode = personCodes[0] ?? ''
            if (cal.sharing === 'busy') {
              events.push({
                id: `shared-g-${ev.id}`,
                source: 'google',
                personCode,
                date, timeFrom: start, timeTo: end,
                description: 'Busy',
                icsColor: cal.color ?? undefined,
                icsCalendarName: `${cal.name} (shared)`,
                isShared: true,
              } as any)
            } else {
              events.push({
                id: `shared-g-${ev.id}`,
                source: 'google',
                personCode,
                date, timeFrom: start, timeTo: end,
                description: cal.sharing === 'full' ? (ev.summary ?? '') : (ev.summary ?? ''),
                icsColor: cal.color ?? undefined,
                icsCalendarName: `${cal.name} (shared)`,
                isShared: true,
              } as any)
            }
          }
        } catch {}
      }
    } catch {}
  }

  return { events, busyBlocks }
}

function addBusy(map: Map<string, { start: string; end: string }[]>, date: string, block: { start: string; end: string }) {
  const existing = map.get(date) ?? []
  existing.push(block)
  map.set(date, existing)
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add lib/sharedCalendars.ts
git commit -m "feat: shared calendar discovery and fetch with visibility filtering"
```

---

### Task 5: Calendar View — Include Shared Events

**Files:**
- Modify: `app/api/outlook/route.ts`
- Modify: `app/api/google/route.ts`

- [ ] **Step 1: Add shared calendar events to Outlook route**

At the end of the GET handler (after all person events are collected), fetch shared calendar events and include them:

```typescript
import { fetchSharedCalendarEvents } from '@/lib/sharedCalendars'

// After the main event collection:
const shared = await fetchSharedCalendarEvents(personList, session.email, session.accountId, dateFrom, dateTo)
// Merge shared events into results
allEvents.push(...shared.events)
```

- [ ] **Step 2: Add shared calendar events to Google route**

Same pattern — at the end of the GET handler, fetch and merge shared events.

- [ ] **Step 3: Commit**

```bash
git add app/api/outlook/route.ts app/api/google/route.ts
git commit -m "feat: include shared calendar events in main calendar view"
```

---

### Task 6: Availability — Include Shared Calendar Busy Blocks

**Files:**
- Modify: `lib/availability.ts`

- [ ] **Step 1: Add shared calendar busy blocks**

In `collectBusyBlocks`, after the per-user Google section and before the return, add:

```typescript
// Shared calendars from other users (busy+ sharing levels)
try {
  const { fetchSharedCalendarEvents } = await import('@/lib/sharedCalendars')
  const shared = await fetchSharedCalendarEvents(personCodes, ownerEmail, accountId, dateFrom, dateTo)
  for (const [date, blocks] of shared.busyBlocks) {
    for (const block of blocks) addBusy(date, block)
  }
} catch (e) {
  console.warn('[availability] Shared calendar fetch failed:', String(e))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/availability.ts
git commit -m "feat: shared calendars contribute to booking availability busy blocks"
```

---

### Task 7: Share View + Summary — Include Shared Events

**Files:**
- Modify: `app/api/share/[token]/activities/route.ts`
- Modify: `app/api/activities/summary/route.ts`

- [ ] **Step 1: Add shared events to share activities route**

In the share activities route, after collecting all activities, fetch shared events and include them (filtered by the share link's visibility level).

- [ ] **Step 2: Add shared calendars to summary route**

In the activity summary route, include shared calendar events in the dot indicators.

- [ ] **Step 3: Commit**

```bash
git add app/api/share/[token]/activities/route.ts app/api/activities/summary/route.ts
git commit -m "feat: shared calendars in share view and month summary"
```

---

### Task 8: Deploy & Test

- [ ] **Step 1: Run migration**

```bash
source .env.local && psql "$DATABASE_URL" -f db/migrations/20_add_calendar_sharing.sql
```

- [ ] **Step 2: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
git checkout main
```

- [ ] **Step 3: Test**

1. Settings > Integrations > Set a Google calendar to "Busy" sharing
2. Switch to a different user (impersonate) — verify busy blocks appear
3. Set to "Titles" — verify event titles show
4. Set to "Full" — verify full details show
5. Booking page — verify shared calendar events block slots
6. Month navigator — verify shared calendar dots appear
