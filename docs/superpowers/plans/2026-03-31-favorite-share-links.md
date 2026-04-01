# Favorite Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated users to generate anonymous, optionally password-protected sharing links for their saved favorites, rendering a read-only calendar view with configurable visibility levels.

**Architecture:** New `favorite_share_links` DB table linked to `user_favorites`. A CRUD API under `/api/settings/share-links` manages links. A public route `/share/[token]` renders a read-only calendar that fetches live data via a dedicated `/api/share/[token]/activities` endpoint (bypasses NextAuth, uses service-level Herbe/Graph credentials). A `FavoriteDetailModal` component provides the management UI. Visibility filtering happens server-side to prevent data leakage.

**Tech Stack:** Next.js 16 App Router, Neon Postgres, `crypto.randomBytes` for tokens, `bcryptjs` for optional password hashing, existing `CalendarGrid`/`PersonColumn` components for the anonymous view.

---

## File Structure

### New Files
- `db/migrations/03_create_favorite_share_links.sql` — Schema for share links table
- `app/api/settings/share-links/route.ts` — CRUD API for managing share links (auth required)
- `app/api/share/[token]/route.ts` — Public metadata endpoint (returns favorite config + link validity)
- `app/api/share/[token]/activities/route.ts` — Public activities endpoint (returns filtered activities)
- `app/share/[token]/page.tsx` — Server component for the anonymous view
- `components/ShareCalendarShell.tsx` — Client component: read-only calendar for anonymous viewers
- `components/FavoriteDetailModal.tsx` — Modal for viewing favorite details + managing share links
- `lib/shareLinks.ts` — Client-side fetch helpers for share link CRUD

### Modified Files
- `types/index.ts` — Add `ShareLink` and `ShareVisibility` types
- `components/FavoritesDropdown.tsx` — Add share/detail icon per favorite to open `FavoriteDetailModal`
- `components/ActivityBlock.tsx` — Respect `visibility` prop to hide details in anonymous mode
- `components/PersonColumn.tsx` — Pass `visibility` prop through to `ActivityBlock` and `AllDayBanner`
- `components/CalendarGrid.tsx` — Accept and forward `visibility` prop

---

## Task 1: Types and Database Schema

**Files:**
- Modify: `types/index.ts:74-80`
- Create: `db/migrations/03_create_favorite_share_links.sql`

- [ ] **Step 1: Add types to `types/index.ts`**

Add after the existing `Favorite` interface (line 80):

```typescript
export type ShareVisibility = 'busy' | 'titles' | 'full'

export interface ShareLink {
  id: string
  favoriteId: string
  token: string
  name: string
  visibility: ShareVisibility
  hasPassword: boolean
  expiresAt: string | null
  createdAt: string
  lastAccessedAt: string | null
  accessCount: number
}
```

- [ ] **Step 2: Create migration file**

Create `db/migrations/03_create_favorite_share_links.sql`:

```sql
CREATE TABLE IF NOT EXISTS favorite_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_id UUID NOT NULL REFERENCES user_favorites(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  visibility TEXT NOT NULL DEFAULT 'busy' CHECK (visibility IN ('busy', 'titles', 'full')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON favorite_share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_favorite_id ON favorite_share_links(favorite_id);
```

- [ ] **Step 3: Commit**

```bash
git add types/index.ts db/migrations/03_create_favorite_share_links.sql
git commit -m "feat: add ShareLink types and DB migration for favorite sharing"
```

---

## Task 2: Share Links CRUD API

**Files:**
- Create: `app/api/settings/share-links/route.ts`
- Create: `lib/shareLinks.ts`

- [ ] **Step 1: Create the API route**

Create `app/api/settings/share-links/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import crypto from 'crypto'

let tableCheckedAt = 0
const TABLE_CHECK_TTL = 60 * 60 * 1000
async function ensureTable() {
  if (Date.now() - tableCheckedAt < TABLE_CHECK_TTL) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorite_share_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      favorite_id UUID NOT NULL REFERENCES user_favorites(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT,
      visibility TEXT NOT NULL DEFAULT 'busy' CHECK (visibility IN ('busy', 'titles', 'full')),
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at TIMESTAMP WITH TIME ZONE,
      access_count INTEGER NOT NULL DEFAULT 0
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_links_token ON favorite_share_links(token)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_links_favorite_id ON favorite_share_links(favorite_id)`)
  tableCheckedAt = Date.now()
}

// GET — list all share links for a favorite (query: ?favoriteId=...)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const favoriteId = req.nextUrl.searchParams.get('favoriteId')
  if (!favoriteId) return NextResponse.json({ error: 'favoriteId required' }, { status: 400 })

  try {
    await ensureTable()
    // Verify the favorite belongs to this user
    const { rows: favRows } = await pool.query(
      'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
      [favoriteId, session.user.email]
    )
    if (!favRows.length) return NextResponse.json({ error: 'Favorite not found' }, { status: 404 })

    const { rows } = await pool.query(
      `SELECT id, favorite_id AS "favoriteId", token, name, visibility,
              password_hash IS NOT NULL AS "hasPassword",
              expires_at AS "expiresAt", created_at AS "createdAt",
              last_accessed_at AS "lastAccessedAt", access_count AS "accessCount"
       FROM favorite_share_links WHERE favorite_id = $1 ORDER BY created_at DESC`,
      [favoriteId]
    )
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — create a new share link
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { favoriteId, name, visibility, expiresAt, password } = await req.json()
    if (!favoriteId || !name || !visibility) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Verify ownership
    const { rows: favRows } = await pool.query(
      'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
      [favoriteId, session.user.email]
    )
    if (!favRows.length) return NextResponse.json({ error: 'Favorite not found' }, { status: 404 })

    const token = crypto.randomBytes(32).toString('hex')
    let passwordHash: string | null = null
    if (password) {
      const bcrypt = await import('bcryptjs')
      passwordHash = await bcrypt.hash(password, 10)
    }

    const { rows } = await pool.query(
      `INSERT INTO favorite_share_links (favorite_id, token, name, password_hash, visibility, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, favorite_id AS "favoriteId", token, name, visibility,
                 password_hash IS NOT NULL AS "hasPassword",
                 expires_at AS "expiresAt", created_at AS "createdAt",
                 last_accessed_at AS "lastAccessedAt", access_count AS "accessCount"`,
      [favoriteId, token, name, passwordHash, visibility, expiresAt || null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE — remove a share link (body: { id } or { favoriteId } to remove all)
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, favoriteId } = await req.json()

    if (favoriteId) {
      // Remove ALL links for a favorite (kill switch)
      const { rows: favRows } = await pool.query(
        'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
        [favoriteId, session.user.email]
      )
      if (!favRows.length) return NextResponse.json({ error: 'Favorite not found' }, { status: 404 })
      await pool.query('DELETE FROM favorite_share_links WHERE favorite_id = $1', [favoriteId])
      return NextResponse.json({ success: true })
    }

    if (id) {
      // Remove single link — verify ownership through favorite join
      await pool.query(
        `DELETE FROM favorite_share_links WHERE id = $1
         AND favorite_id IN (SELECT id FROM user_favorites WHERE user_email = $2)`,
        [id, session.user.email]
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'id or favoriteId required' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create client-side helpers**

Create `lib/shareLinks.ts`:

```typescript
import type { ShareLink, ShareVisibility } from '@/types'

export async function loadShareLinks(favoriteId: string): Promise<ShareLink[]> {
  try {
    const res = await fetch(`/api/settings/share-links?favoriteId=${favoriteId}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function createShareLink(data: {
  favoriteId: string
  name: string
  visibility: ShareVisibility
  expiresAt?: string
  password?: string
}): Promise<ShareLink> {
  const res = await fetch('/api/settings/share-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function removeShareLink(id: string): Promise<void> {
  await fetch('/api/settings/share-links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export async function removeAllShareLinks(favoriteId: string): Promise<void> {
  await fetch('/api/settings/share-links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favoriteId }),
  })
}
```

- [ ] **Step 3: Install bcryptjs**

```bash
npm install bcryptjs && npm install -D @types/bcryptjs
```

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/share-links/route.ts lib/shareLinks.ts package.json package-lock.json
git commit -m "feat: share links CRUD API and client helpers"
```

---

## Task 3: Public Share Token Endpoints

**Files:**
- Create: `app/api/share/[token]/route.ts`
- Create: `app/api/share/[token]/activities/route.ts`

These endpoints are **public** — no NextAuth session required. They validate the token, check expiration, and optionally verify the password.

- [ ] **Step 1: Create the metadata endpoint**

Create `app/api/share/[token]/route.ts`. This returns the favorite config (view, personCodes, hiddenCalendars) and link metadata — or an error if expired/invalid. Password verification happens here via a POST.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

// GET — check if link is valid, return favorite config (no password check)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const { rows } = await pool.query(
      `SELECT sl.id, sl.visibility, sl.expires_at, sl.password_hash IS NOT NULL AS "hasPassword",
              sl.name AS "linkName",
              f.name AS "favoriteName", f.view, f.person_codes AS "personCodes",
              f.hidden_calendars AS "hiddenCalendars", f.user_email AS "ownerEmail"
       FROM favorite_share_links sl
       JOIN user_favorites f ON f.id = sl.favorite_id
       WHERE sl.token = $1`,
      [token]
    )
    if (!rows.length) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

    const link = rows[0]
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    // Don't expose ownerEmail to the client
    return NextResponse.json({
      favoriteName: link.favoriteName,
      view: link.view,
      personCodes: link.personCodes,
      hiddenCalendars: link.hiddenCalendars ?? [],
      visibility: link.visibility,
      hasPassword: link.hasPassword,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — verify password for protected links, returns same data as GET on success
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  try {
    const { password } = await req.json()
    const { rows } = await pool.query(
      `SELECT sl.id, sl.visibility, sl.expires_at, sl.password_hash,
              sl.name AS "linkName",
              f.name AS "favoriteName", f.view, f.person_codes AS "personCodes",
              f.hidden_calendars AS "hiddenCalendars", f.user_email AS "ownerEmail"
       FROM favorite_share_links sl
       JOIN user_favorites f ON f.id = sl.favorite_id
       WHERE sl.token = $1`,
      [token]
    )
    if (!rows.length) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

    const link = rows[0]
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    if (link.password_hash) {
      const bcrypt = await import('bcryptjs')
      const valid = await bcrypt.compare(password ?? '', link.password_hash)
      if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
    }

    // Update access stats
    await pool.query(
      `UPDATE favorite_share_links SET last_accessed_at = NOW(), access_count = access_count + 1 WHERE id = $1`,
      [link.id]
    )

    return NextResponse.json({
      favoriteName: link.favoriteName,
      view: link.view,
      personCodes: link.personCodes,
      hiddenCalendars: link.hiddenCalendars ?? [],
      visibility: link.visibility,
      hasPassword: false, // Already verified
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the activities endpoint**

Create `app/api/share/[token]/activities/route.ts`. This is the core data endpoint — fetches live activities using service-level credentials, then filters based on visibility level.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { REGISTERS } from '@/lib/herbe/constants'
import type { Activity, ShareVisibility } from '@/types'

// Reuse the emailForCode logic from the outlook route
let userListCache: { data: Record<string, string>; ts: number } | null = null
const USER_LIST_CACHE_TTL = 5 * 60 * 1000

async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache || Date.now() - userListCache.ts > USER_LIST_CACHE_TTL) {
    try {
      const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
      const data = Object.fromEntries(
        (users as Record<string, unknown>[])
          .filter(u => u['Code'] && (u['emailAddr'] || u['LoginEmailAddr']))
          .map(u => [u['Code'] as string, (u['emailAddr'] || u['LoginEmailAddr']) as string])
      )
      userListCache = { data, ts: Date.now() }
    } catch {
      userListCache = { data: {}, ts: Date.now() }
    }
  }
  return userListCache.data[code] ?? null
}

function filterActivity(activity: Record<string, unknown>, visibility: ShareVisibility): Partial<Activity> {
  const base = {
    id: String(activity.id),
    source: activity.source as Activity['source'],
    personCode: String(activity.personCode),
    date: String(activity.date),
    timeFrom: String(activity.timeFrom),
    timeTo: String(activity.timeTo),
    isAllDay: activity.isAllDay as boolean | undefined,
    icsColor: activity.icsColor as string | undefined,
  }
  if (visibility === 'busy') {
    return { ...base, description: 'Busy' }
  }
  if (visibility === 'titles') {
    return {
      ...base,
      description: String(activity.description || ''),
      icsCalendarName: activity.icsCalendarName as string | undefined,
    }
  }
  // 'full' — everything except joinUrl, webLink, and edit-related fields
  return {
    ...base,
    description: String(activity.description || ''),
    activityTypeCode: activity.activityTypeCode as string | undefined,
    activityTypeName: activity.activityTypeName as string | undefined,
    projectName: activity.projectName as string | undefined,
    customerName: activity.customerName as string | undefined,
    mainPersons: activity.mainPersons as string[] | undefined,
    ccPersons: activity.ccPersons as string[] | undefined,
    planned: activity.planned as boolean | undefined,
    isExternal: activity.isExternal as boolean | undefined,
    icsCalendarName: activity.icsCalendarName as string | undefined,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo required' }, { status: 400 })
  }

  try {
    // Validate token and get favorite config
    const { rows } = await pool.query(
      `SELECT sl.id, sl.visibility, sl.expires_at, sl.password_hash IS NOT NULL AS "hasPassword",
              f.person_codes AS "personCodes", f.hidden_calendars AS "hiddenCalendars",
              f.user_email AS "ownerEmail"
       FROM favorite_share_links sl
       JOIN user_favorites f ON f.id = sl.favorite_id
       WHERE sl.token = $1`,
      [token]
    )
    if (!rows.length) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

    const link = rows[0]
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 })
    }

    // For password-protected links, require the password cookie/header
    // The client must POST to /api/share/[token] first to verify password,
    // then include the token in a session cookie. For simplicity, we use
    // a signed hash: the client sends X-Share-Auth header = sha256(token + password).
    // This avoids storing session state for anonymous users.
    if (link.hasPassword) {
      const authHeader = req.headers.get('x-share-auth')
      if (!authHeader) {
        return NextResponse.json({ error: 'Password required' }, { status: 403 })
      }
      // Verify by checking password against stored hash
      // The client sends the raw password in the header (over HTTPS)
      const bcrypt = await import('bcryptjs')
      const { rows: pwRows } = await pool.query(
        'SELECT password_hash FROM favorite_share_links WHERE token = $1',
        [token]
      )
      const valid = await bcrypt.compare(authHeader, pwRows[0].password_hash)
      if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
    }

    // Update access stats
    await pool.query(
      `UPDATE favorite_share_links SET last_accessed_at = NOW(), access_count = access_count + 1 WHERE id = $1`,
      [link.id]
    )

    const personCodes: string[] = link.personCodes
    const visibility: ShareVisibility = link.visibility
    const ownerEmail: string = link.ownerEmail
    const hiddenCalendars = new Set<string>(link.hiddenCalendars ?? [])

    // Fetch Herbe activities (service-level auth)
    let herbeActivities: Record<string, unknown>[] = []
    try {
      const raw = await herbeFetchAll(REGISTERS.activities, {
        sort: 'TransDate',
        range: `${dateFrom}:${dateTo}`,
      })
      const personSet = new Set(personCodes)
      herbeActivities = raw.flatMap(r => {
        const rec = r as Record<string, unknown>
        const mainPersons = String(rec['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
        const ccPersonsArr = String(rec['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
        const results: Record<string, unknown>[] = []
        for (const p of mainPersons) {
          if (personSet.has(p)) {
            results.push({
              id: String(rec['SerNr'] ?? ''),
              source: 'herbe',
              personCode: p,
              description: String(rec['Comment'] ?? ''),
              date: String(rec['TransDate'] ?? ''),
              timeFrom: (String(rec['StartTime'] ?? '')).slice(0, 5),
              timeTo: (String(rec['EndTime'] ?? '')).slice(0, 5),
              activityTypeCode: String(rec['ActType'] ?? '') || undefined,
              activityTypeName: undefined,
              customerName: String(rec['CUName'] ?? '') || undefined,
              projectName: String(rec['PRName'] ?? rec['PRComment'] ?? '') || undefined,
              mainPersons: mainPersons.length ? mainPersons : undefined,
              ccPersons: ccPersonsArr.length ? ccPersonsArr : undefined,
              planned: String(rec['CalTimeFlag'] ?? '1') === '2',
            })
          }
        }
        // CC rows
        for (const ccCode of ccPersonsArr) {
          if (personSet.has(ccCode) && !mainPersons.includes(ccCode)) {
            results.push({
              id: String(rec['SerNr'] ?? ''),
              source: 'herbe',
              personCode: ccCode,
              description: String(rec['Comment'] ?? ''),
              date: String(rec['TransDate'] ?? ''),
              timeFrom: (String(rec['StartTime'] ?? '')).slice(0, 5),
              timeTo: (String(rec['EndTime'] ?? '')).slice(0, 5),
              activityTypeCode: String(rec['ActType'] ?? '') || undefined,
              planned: String(rec['CalTimeFlag'] ?? '1') === '2',
            })
          }
        }
        return results
      })
    } catch (e) {
      console.warn('[share] Herbe fetch failed:', e)
      // Continue — Herbe might not be configured
    }

    // Fetch Outlook/ICS activities (service-level Graph + ICS URLs from owner's calendars)
    let outlookActivities: Record<string, unknown>[] = []
    try {
      const allResults = await Promise.all(personCodes.map(async code => {
        const email = await emailForCode(code)
        if (!email) return []

        // ICS feeds — lookup by owner's email
        let icsEvents: Record<string, unknown>[] = []
        try {
          const { rows: icsRows } = await pool.query(
            'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2',
            [ownerEmail, code]
          )
          if (icsRows.length > 0) {
            // Import the ICS fetcher dynamically to reuse existing logic
            // For now, fetch inline (simplified — the full ICS parsing is in the outlook route)
            const icsModule = await import('@/app/api/outlook/route')
            // ICS parsing is internal to the outlook route — we'll call the endpoint server-side
            // Actually, we can't easily reuse it. For the plan: extract fetchIcsEvents to a shared lib.
            // For now, skip ICS in the anonymous view — we'll refactor in a later task.
          }
        } catch {}

        // Graph calendarView
        const startDt = `${dateFrom}T00:00:00`
        const endDt = `${dateTo}T23:59:59`
        const calendarViewParams = `startDateTime=${startDt}&endDateTime=${endDt}&$top=100`
        const res = await graphFetch(
          `/users/${email}/calendarView?${calendarViewParams}`,
          { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } }
        )
        if (!res.ok) return []
        const data = await res.json()
        return (data.value ?? []).map((ev: Record<string, unknown>) => {
          const start = (ev['start'] as Record<string, string> | undefined)
          const end = (ev['end'] as Record<string, string> | undefined)
          const startDt = start?.dateTime ?? ''
          const endDt = end?.dateTime ?? ''
          return {
            id: String(ev['id'] ?? ''),
            source: 'outlook',
            personCode: code,
            description: String(ev['subject'] ?? ''),
            date: startDt.slice(0, 10),
            timeFrom: startDt.slice(11, 16),
            timeTo: endDt.slice(11, 16),
            isExternal: false,
          }
        })
      }))
      outlookActivities = allResults.flat()
    } catch (e) {
      console.warn('[share] Outlook fetch failed:', e)
    }

    // Combine, filter by hiddenCalendars, apply visibility
    const allActivities = [...herbeActivities, ...outlookActivities]
    const filtered = allActivities
      .filter(a => {
        const source = String(a.source)
        if (source === 'herbe' && hiddenCalendars.has('herbe')) return false
        if (source === 'outlook' && !a.isExternal && hiddenCalendars.has('outlook')) return false
        if (a.icsCalendarName && hiddenCalendars.has(`ics:${a.icsCalendarName}`)) return false
        return true
      })
      .map(a => filterActivity(a, visibility))

    return NextResponse.json(filtered, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

**Important note for the implementer:** The ICS feed parsing (`fetchIcsEvents`) currently lives inside `app/api/outlook/route.ts` as a file-scoped function. Before implementing this task, extract `fetchIcsEvents` and `emailForCode` from `app/api/outlook/route.ts` into `lib/icsParser.ts` and `lib/emailForCode.ts` respectively, then import them in both routes. This avoids duplicating ~150 lines of ICS parsing logic.

- [ ] **Step 3: Commit**

```bash
git add app/api/share/ app/api/settings/share-links/
git commit -m "feat: public share token and activities endpoints"
```

---

## Task 4: Extract Shared Utilities

Before the anonymous route can fetch ICS events, extract shared code from the Outlook route.

**Files:**
- Create: `lib/icsParser.ts` — extracted `fetchIcsEvents` function
- Create: `lib/emailForCode.ts` — extracted `emailForCode` function
- Modify: `app/api/outlook/route.ts` — import from new modules instead of defining locally
- Modify: `app/api/share/[token]/activities/route.ts` — import from new modules

- [ ] **Step 1: Create `lib/emailForCode.ts`**

Extract the `emailForCode` function and its cache from `app/api/outlook/route.ts:163-183`:

```typescript
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'

let userListCache: { data: Record<string, string>; ts: number } | null = null
const USER_LIST_CACHE_TTL = 5 * 60 * 1000

export async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache || Date.now() - userListCache.ts > USER_LIST_CACHE_TTL) {
    try {
      const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
      const data = Object.fromEntries(
        (users as Record<string, unknown>[])
          .filter(u => u['Code'] && (u['emailAddr'] || u['LoginEmailAddr']))
          .map(u => [u['Code'] as string, (u['emailAddr'] || u['LoginEmailAddr']) as string])
      )
      userListCache = { data, ts: Date.now() }
    } catch (e) {
      console.warn('[emailForCode] UserVc unavailable:', String(e))
      userListCache = { data: {}, ts: Date.now() }
    }
  }
  return userListCache.data[code] ?? null
}
```

- [ ] **Step 2: Create `lib/icsParser.ts`**

Extract `fetchIcsEvents` from `app/api/outlook/route.ts:11-161`. Copy the entire function as-is. The imports it needs:

```typescript
import ICAL from 'ical.js'
import { parseISO, isWithinInterval, startOfDay, endOfDay, addDays, format } from 'date-fns'

// Copy fetchIcsEvents exactly as it exists in app/api/outlook/route.ts lines 11-161
export async function fetchIcsEvents(url: string, code: string, dateFrom: string, dateTo: string): Promise<any[]> {
  // ... exact copy of the existing function body
}
```

- [ ] **Step 3: Update `app/api/outlook/route.ts`**

Remove the local `fetchIcsEvents` function (lines 11-161) and `emailForCode` function (lines 163-183) plus its cache (lines 164-165). Replace with imports:

```typescript
import { fetchIcsEvents } from '@/lib/icsParser'
import { emailForCode } from '@/lib/emailForCode'
```

- [ ] **Step 4: Update `app/api/share/[token]/activities/route.ts`**

Replace the inline `emailForCode` with the import and add ICS support using the shared `fetchIcsEvents`:

```typescript
import { fetchIcsEvents } from '@/lib/icsParser'
import { emailForCode } from '@/lib/emailForCode'
```

Add ICS fetching in the Outlook section where the comment says "skip ICS in the anonymous view":

```typescript
if (icsRows.length > 0) {
  const icsResults = await Promise.all(
    icsRows.map(async (row: any) => {
      const events = await fetchIcsEvents(row.ics_url, code, dateFrom, dateTo)
      return events.map((ev: any) => ({
        ...ev,
        ...(row.color ? { icsColor: row.color } : {}),
        icsCalendarName: row.name,
      }))
    })
  )
  icsEvents = icsResults.flat()
}
```

- [ ] **Step 5: Verify build passes**

```bash
npx next build
```

- [ ] **Step 6: Commit**

```bash
git add lib/icsParser.ts lib/emailForCode.ts app/api/outlook/route.ts app/api/share/
git commit -m "refactor: extract fetchIcsEvents and emailForCode into shared modules"
```

---

## Task 5: Anonymous View Page and Shell

**Files:**
- Create: `app/share/[token]/page.tsx`
- Create: `components/ShareCalendarShell.tsx`

- [ ] **Step 1: Create the server component page**

Create `app/share/[token]/page.tsx`:

```typescript
import ShareCalendarShell from '@/components/ShareCalendarShell'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ShareCalendarShell token={token} />
}
```

- [ ] **Step 2: Create `ShareCalendarShell.tsx`**

This is the read-only calendar client component. It:
1. Fetches link metadata from `/api/share/[token]`
2. Shows password prompt if needed
3. Renders the calendar using existing `CalendarGrid` (read-only mode)
4. Fetches activities from `/api/share/[token]/activities`
5. No edit, no drag, no RSVP, no activity form, no settings

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import type { Activity, CalendarState, ShareVisibility } from '@/types'
import CalendarGrid from './CalendarGrid'
import {
  getActivityColor as getActivityColorFn,
  buildClassGroupColorMap, OUTLOOK_COLOR, FALLBACK_COLOR
} from '@/lib/activityColors'
import { personColor } from '@/lib/colors'

interface ShareConfig {
  favoriteName: string
  view: CalendarState['view']
  personCodes: string[]
  hiddenCalendars: string[]
  visibility: ShareVisibility
  hasPassword: boolean
}

export default function ShareCalendarShell({ token }: { token: string }) {
  const [config, setConfig] = useState<ShareConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // Fetch link metadata
  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(async res => {
        if (res.status === 410) { setError('This link has expired'); return }
        if (res.status === 404) { setError('Link not found'); return }
        const data = await res.json()
        if (data.hasPassword) {
          setNeedsPassword(true)
          setLoading(false)
        } else {
          setConfig(data)
        }
      })
      .catch(() => setError('Failed to load'))
  }, [token])

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/share/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.status === 403) { setError('Invalid password'); setError(null); return }
    if (!res.ok) { setError('Failed to verify'); return }
    const data = await res.json()
    setVerifiedPassword(password)
    setConfig(data)
    setNeedsPassword(false)
  }

  // Build a simple state object for CalendarGrid
  const state: CalendarState = {
    view: config?.view ?? 'day',
    date,
    selectedPersons: (config?.personCodes ?? []).map(code => ({ code, name: code, email: '' })),
  }

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!config) return
    setLoading(true)
    const dateFrom = date
    const dateTo = config.view === '5day'
      ? format(addDays(parseISO(date), 4), 'yyyy-MM-dd')
      : config.view === '3day'
      ? format(addDays(parseISO(date), 2), 'yyyy-MM-dd')
      : date

    const headers: Record<string, string> = {}
    if (verifiedPassword) headers['x-share-auth'] = verifiedPassword

    try {
      const res = await fetch(
        `/api/share/${token}/activities?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { headers }
      )
      if (res.ok) {
        setActivities(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch shared activities:', e)
    } finally {
      setLoading(false)
    }
  }, [config, date, token, verifiedPassword])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  // Navigation
  function navigate(dir: 'prev' | 'next') {
    const days = config?.view === '5day' ? 5 : config?.view === '3day' ? 3 : 1
    const newDate = dir === 'next'
      ? format(addDays(parseISO(date), days), 'yyyy-MM-dd')
      : format(addDays(parseISO(date), -days), 'yyyy-MM-dd')
    setDate(newDate)
  }

  // Simple color assignment
  function getColor(a: Activity) {
    if (a.icsColor) return a.icsColor
    if (a.source === 'outlook') return OUTLOOK_COLOR
    return FALLBACK_COLOR
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <div className="text-center p-8">
          <p className="text-xl font-bold mb-2">{error}</p>
          <p className="text-text-muted text-sm">Contact the person who shared this link.</p>
        </div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <form onSubmit={handlePasswordSubmit} className="bg-surface border border-border rounded-xl p-6 w-80">
          <h2 className="text-lg font-bold mb-4">Password required</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full bg-transparent border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary mb-3"
            autoFocus
          />
          <button
            type="submit"
            disabled={!password}
            className="w-full bg-primary text-white rounded px-3 py-2 text-sm font-bold disabled:opacity-30"
          >
            Open calendar
          </button>
        </form>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-text">
        <p className="text-text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background text-text">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <button onClick={() => navigate('prev')} className="px-2 py-1 rounded hover:bg-border text-sm">←</button>
        <div className="text-center">
          <p className="text-sm font-bold">{config.favoriteName}</p>
          <p className="text-xs text-text-muted">{format(parseISO(date), 'EEE, MMM d, yyyy')}</p>
        </div>
        <button onClick={() => navigate('next')} className="px-2 py-1 rounded hover:bg-border text-sm">→</button>
      </div>

      {/* Calendar grid — read-only */}
      <div className="flex-1 overflow-hidden">
        <CalendarGrid
          state={state}
          activities={activities}
          loading={loading}
          getActivityColor={getColor}
          onRefresh={fetchActivities}
          onNavigate={navigate}
          onSlotClick={() => {}}
          onActivityClick={() => {}}
          onActivityUpdate={() => {}}
          visibility={config.visibility}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/share/ components/ShareCalendarShell.tsx
git commit -m "feat: anonymous share view page and shell component"
```

---

## Task 6: Visibility Prop Through Calendar Components

Pass a `visibility` prop through `CalendarGrid` → `PersonColumn` → `ActivityBlock` / `AllDayBanner` to control what's shown in preview cards. When `visibility` is `undefined` (normal authenticated view), everything renders as before.

**Files:**
- Modify: `components/CalendarGrid.tsx` — accept and forward `visibility` prop
- Modify: `components/PersonColumn.tsx` — forward `visibility` to `ActivityBlock` and `AllDayBanner`
- Modify: `components/ActivityBlock.tsx` — respect `visibility` in preview card rendering

- [ ] **Step 1: Add `visibility` to CalendarGrid props**

In `components/CalendarGrid.tsx`, add to the Props interface:

```typescript
visibility?: ShareVisibility
```

Add import:

```typescript
import type { ShareVisibility } from '@/types'
```

Forward to `PersonColumn`:

```typescript
<PersonColumn
  ...existing props...
  visibility={visibility}
/>
```

(Apply this to both the herbe and outlook `PersonColumn` renders.)

- [ ] **Step 2: Add `visibility` to PersonColumn**

In `components/PersonColumn.tsx`, add to the Props interface:

```typescript
visibility?: ShareVisibility
```

Add import:

```typescript
import type { ShareVisibility } from '@/types'
```

Forward to `ActivityBlock`:

```typescript
<ActivityBlock
  ...existing props...
  visibility={visibility}
/>
```

Forward to `AllDayBanner`:

```typescript
<AllDayBanner
  ...existing props...
  visibility={visibility}
/>
```

Update `AllDayBanner` props to accept `visibility?: ShareVisibility`.

- [ ] **Step 3: Respect `visibility` in ActivityBlock preview card**

In `components/ActivityBlock.tsx`, add to Props interface:

```typescript
visibility?: ShareVisibility
```

Add import:

```typescript
import type { ShareVisibility } from '@/types'
```

In the preview card section (line 176-255), wrap content conditionally:

- When `visibility === 'busy'`: show only "Busy" text and time range
- When `visibility === 'titles'`: show description and time, hide customer/project/type/source
- When `visibility === undefined` or `'full'`: show everything as before (but no joinUrl/edit buttons when in shared mode)

Also: when `visibility` is set (i.e., anonymous mode), clicking the card should **not** open the activity detail — remove the `onClick` handler on the card wrapper.

Replace the preview card content block with:

```typescript
{/* Preview card content */}
{visibility === 'busy' ? (
  <>
    <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>Busy</p>
    <p className="text-xs text-text-muted">{activity.timeFrom} – {activity.timeTo}</p>
  </>
) : (
  <>
    <p className="text-xs font-bold leading-snug mb-1.5 pr-8" style={{ color }}>
      {activity.icsCalendarName ? '📅 ' : isOutlook ? <><OutlookIcon /> </> : null}{activity.description || '(no title)'}
    </p>
    <p className="text-xs text-text-muted">
      {activity.isAllDay ? 'All day' : `${activity.timeFrom} – ${activity.timeTo}`}
      {!visibility && isPlanned && <span className="ml-1 text-amber-500 text-[10px]">(planned)</span>}
    </p>
    {(!visibility || visibility === 'full') && (
      <>
        {activity.activityTypeCode && (
          <p className="text-[10px] mt-1" style={{ color }}>
            <span className="font-mono">{activity.activityTypeCode}</span>
            {(getTypeName?.(activity.activityTypeCode) || activity.activityTypeName) && (
              <span className="ml-1 not-italic">
                {getTypeName?.(activity.activityTypeCode) || activity.activityTypeName}
              </span>
            )}
          </p>
        )}
        {activity.projectName && <p className="text-xs text-text-muted mt-1 truncate">{activity.projectName}</p>}
        {activity.customerName && <p className="text-xs text-text-muted truncate">{activity.customerName}</p>}
        {activity.icsCalendarName && <p className="text-[10px] mt-1 text-text-muted truncate">📅 {activity.icsCalendarName}</p>}
        {isOutlook && !activity.icsCalendarName && <p className="text-[10px] mt-1 text-text-muted truncate"><OutlookIcon /> Outlook Calendar</p>}
        {!isOutlook && activity.source === 'herbe' && <p className="text-[10px] mt-1 text-text-muted truncate">Herbe ERP</p>}
        {isCC && <p className="text-[10px] mt-1" style={{ color: color + '99', fontStyle: 'italic' }}>CC only</p>}
      </>
    )}
    {/* Join and Edit buttons — only in authenticated mode */}
    {!visibility && activity.joinUrl && (
      <a ... existing join button ... />
    )}
    {!visibility && (
      <button ... existing edit/view button ... />
    )}
  </>
)}
```

Apply the same visibility logic to `AllDayBanner`'s preview card in `PersonColumn.tsx`.

- [ ] **Step 4: In anonymous mode, disable click-to-open on the activity block itself**

In `ActivityBlock.tsx`, modify the outer div's `onClick`:

```typescript
onClick={() => {
  if (visibility) return // Read-only in shared mode
  if (wasTouchRef.current || globalTouchActive) { wasTouchRef.current = false; return }
  onClick(activity)
}}
```

Similarly, the preview card's `onClick` wrapper should be a no-op in shared mode:

```typescript
onClick={(e) => {
  e.stopPropagation()
  if (visibility) return
  onMobileClose?.()
  onClick(activity)
}}
```

- [ ] **Step 5: Verify build**

```bash
npx next build
```

- [ ] **Step 6: Commit**

```bash
git add components/CalendarGrid.tsx components/PersonColumn.tsx components/ActivityBlock.tsx
git commit -m "feat: visibility prop controls detail level in shared calendar views"
```

---

## Task 7: Favorite Detail Modal

**Files:**
- Create: `components/FavoriteDetailModal.tsx`
- Modify: `components/FavoritesDropdown.tsx` — add share icon per favorite that opens the modal

- [ ] **Step 1: Create `FavoriteDetailModal.tsx`**

This modal shows:
- Favorite name (editable — for future, or just display for now since there's no UPDATE endpoint)
- View type, person codes, hidden calendars
- List of share links with stats
- Form to create new share link
- "Remove all links" button

```typescript
'use client'
import { useState, useEffect } from 'react'
import type { Favorite, ShareLink, ShareVisibility } from '@/types'
import { loadShareLinks, createShareLink, removeShareLink, removeAllShareLinks } from '@/lib/shareLinks'

interface Props {
  favorite: Favorite
  open: boolean
  onClose: () => void
}

export default function FavoriteDetailModal({ favorite, open, onClose }: Props) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // New link form state
  const [newName, setNewName] = useState('')
  const [newVisibility, setNewVisibility] = useState<ShareVisibility>('busy')
  const [newExpiry, setNewExpiry] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (open) {
      setLoading(true)
      loadShareLinks(favorite.id).then(l => { setLinks(l); setLoading(false) })
    }
  }, [open, favorite.id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const link = await createShareLink({
      favoriteId: favorite.id,
      name: newName.trim(),
      visibility: newVisibility,
      expiresAt: newExpiry || undefined,
      password: newPassword || undefined,
    })
    setLinks(prev => [link, ...prev])
    setNewName('')
    setNewVisibility('busy')
    setNewExpiry('')
    setNewPassword('')
    setShowForm(false)
    setCreating(false)
  }

  async function handleDelete(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
    await removeShareLink(id)
  }

  async function handleDeleteAll() {
    if (!confirm('Remove all sharing links for this favorite?')) return
    setLinks([])
    await removeAllShareLinks(favorite.id)
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  function openLink(token: string) {
    window.open(`/share/${token}`, '_blank')
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto pointer-events-auto p-5" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">{favorite.name}</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {favorite.view === 'day' ? 'Day' : favorite.view === '3day' ? '3-day' : '5-day'} view · {favorite.personCodes.length} person{favorite.personCodes.length !== 1 ? 's' : ''}: {favorite.personCodes.join(', ')}
              </p>
              {favorite.hiddenCalendars && favorite.hiddenCalendars.length > 0 && (
                <p className="text-[10px] text-text-muted mt-0.5">
                  Hidden: {favorite.hiddenCalendars.join(', ')}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">✕</button>
          </div>

          <div className="h-px bg-border mb-4" />

          {/* Share links list */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">Sharing links</h3>
            {links.length > 0 && (
              <button onClick={handleDeleteAll} className="text-[10px] text-red-400 hover:text-red-300">
                Remove all
              </button>
            )}
          </div>

          {loading && <p className="text-xs text-text-muted mb-3">Loading…</p>}

          {!loading && links.length === 0 && !showForm && (
            <p className="text-xs text-text-muted mb-3">No sharing links yet.</p>
          )}

          {links.map(link => (
            <div key={link.id} className="border border-border rounded-lg p-3 mb-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{link.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {link.visibility === 'busy' ? 'Busy/Available' : link.visibility === 'titles' ? 'Titles only' : 'Full details'}
                    {link.hasPassword && ' · 🔒'}
                    {link.expiresAt && ` · Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleDelete(link.id)} className="text-text-muted hover:text-red-400 text-xs">✕</button>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={() => copyLink(link.token)}
                  className="flex-1 px-2 py-1 rounded text-[11px] font-bold bg-primary/20 text-primary hover:bg-primary/30"
                >
                  {copied === link.token ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  onClick={() => openLink(link.token)}
                  className="px-2 py-1 rounded text-[11px] font-bold bg-border hover:bg-border/80 text-text-muted"
                >
                  Open
                </button>
              </div>
              <p className="text-[10px] text-text-muted mt-1.5">
                {link.accessCount === 0
                  ? 'Never accessed'
                  : `Accessed ${link.accessCount} time${link.accessCount !== 1 ? 's' : ''}${link.lastAccessedAt ? ` · Last: ${new Date(link.lastAccessedAt).toLocaleDateString()}` : ''}`}
              </p>
            </div>
          ))}

          {/* New link form */}
          {showForm ? (
            <form onSubmit={handleCreate} className="border border-border rounded-lg p-3 mb-2">
              <p className="text-sm font-bold mb-2">New sharing link</p>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Who is this for?"
                className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary mb-2"
                autoFocus
              />
              <div className="mb-2">
                <label className="text-[10px] text-text-muted block mb-1">Visibility</label>
                <select
                  value={newVisibility}
                  onChange={e => setNewVisibility(e.target.value as ShareVisibility)}
                  className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
                >
                  <option value="busy">Busy / Available only</option>
                  <option value="titles">Show titles</option>
                  <option value="full">Full details</option>
                </select>
              </div>
              <div className="mb-2">
                <label className="text-[10px] text-text-muted block mb-1">Expiration (optional)</label>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={e => setNewExpiry(e.target.value)}
                  className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="mb-3">
                <label className="text-[10px] text-text-muted block mb-1">Password (optional)</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave empty for no password"
                  className="w-full bg-transparent border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="flex-1 px-2 py-1.5 rounded text-[11px] font-bold bg-primary text-white disabled:opacity-30"
                >
                  {creating ? 'Creating…' : 'Create link'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded text-[11px] text-text-muted hover:bg-border"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-border text-primary font-semibold flex items-center gap-2 rounded-lg"
            >
              <span>+</span>
              <span>Generate new link</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Add share icon to FavoritesDropdown**

In `components/FavoritesDropdown.tsx`, add state and import for the modal:

```typescript
import FavoriteDetailModal from './FavoriteDetailModal'
// Add to component state:
const [detailFavorite, setDetailFavorite] = useState<Favorite | null>(null)
```

In the favorite item rendering (around line 66-85), add a share button next to the delete button:

```typescript
<button
  onClick={(e) => { e.stopPropagation(); setDetailFavorite(fav); if (!inline) setOpen(false) }}
  className="text-text-muted hover:text-primary text-xs ml-auto shrink-0 opacity-0 group-hover:opacity-100"
  title="Share & details"
>
  ↗
</button>
```

At the end of the component (before the final closing tag), add the modal:

```typescript
<FavoriteDetailModal
  favorite={detailFavorite!}
  open={!!detailFavorite}
  onClose={() => setDetailFavorite(null)}
/>
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add components/FavoriteDetailModal.tsx components/FavoritesDropdown.tsx
git commit -m "feat: favorite detail modal with share link management UI"
```

---

## Task 8: Layout for Share Route

The share route needs its own layout that does NOT include `SessionProvider` (no auth needed). It also needs the theme script and base styles.

**Files:**
- Create: `app/share/layout.tsx`

- [ ] **Step 1: Create the share layout**

Create `app/share/layout.tsx`:

```typescript
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { title: 'Shared Calendar' }

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

Note: The root layout already has `<SessionProvider>` wrapping `{children}`. `SessionProvider` is harmless for unauthenticated routes — it just provides an empty session. The share route's page component doesn't call `auth()` or `redirect('/login')`, so it works fine. No separate layout tree needed. However, if `SessionProvider` causes issues (e.g., fetching session on every anonymous page load), we can revisit.

- [ ] **Step 2: Verify the anonymous route loads without auth**

```bash
npx next build
```

After deploy, navigate to `/share/nonexistent-token` — should show "Link not found" without redirecting to `/login`.

- [ ] **Step 3: Commit**

```bash
git add app/share/layout.tsx
git commit -m "feat: share route layout for anonymous calendar views"
```

---

## Task 9: Deploy and End-to-End Test

- [ ] **Step 1: Build and deploy**

```bash
npx next build && vercel deploy --yes
```

Then alias:

```bash
vercel alias <deployment-url> herbe-calendar-test.vercel.app
```

- [ ] **Step 2: Manual end-to-end test**

1. Log in to the app
2. Create a favorite if none exist
3. Open the favorites dropdown, click the share icon on a favorite
4. Create a share link with "busy" visibility, no password, no expiry
5. Copy the link, open in incognito — verify it shows the calendar with "Busy" blocks
6. Create another link with "full" visibility + password
7. Open in incognito — verify password prompt appears and works
8. Check access count updates after visiting
9. Delete a single link, verify it's removed
10. Use "Remove all" to clear remaining links

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: share links end-to-end fixes"
```

---

## Summary of All Files

| Action | Path |
|--------|------|
| Modify | `types/index.ts` |
| Create | `db/migrations/03_create_favorite_share_links.sql` |
| Create | `app/api/settings/share-links/route.ts` |
| Create | `app/api/share/[token]/route.ts` |
| Create | `app/api/share/[token]/activities/route.ts` |
| Create | `app/share/[token]/page.tsx` |
| Create | `app/share/layout.tsx` |
| Create | `components/ShareCalendarShell.tsx` |
| Create | `components/FavoriteDetailModal.tsx` |
| Create | `lib/shareLinks.ts` |
| Create | `lib/icsParser.ts` |
| Create | `lib/emailForCode.ts` |
| Modify | `app/api/outlook/route.ts` |
| Modify | `components/FavoritesDropdown.tsx` |
| Modify | `components/CalendarGrid.tsx` |
| Modify | `components/PersonColumn.tsx` |
| Modify | `components/ActivityBlock.tsx` |
