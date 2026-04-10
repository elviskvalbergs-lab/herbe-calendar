# Booking Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a booking system to shared calendar links — visitors pick a template, see available slots, fill in fields, and the system creates activities across ERP/Outlook/Google endpoints with email notifications.

**Architecture:** Three layers: (1) booking templates stored per-user with CRUD API, (2) availability engine that checks calendars in the background and computes free slots, (3) public booking page with slot picker and form. Templates are linked to share links via a junction table. Bookings are tracked for cancel/reschedule via token.

**Tech Stack:** Next.js 16 App Router, PostgreSQL (Neon), ical.js, Microsoft Graph API, Google Calendar API, nodemailer/SMTP, existing auth + crypto infrastructure.

---

## File Structure

### New Files
- `db/migrations/13_create_booking_tables.sql` — booking_templates, share_link_templates, bookings tables
- `app/api/settings/templates/route.ts` — CRUD for booking templates
- `app/api/share/[token]/availability/route.ts` — compute available slots for a template
- `app/api/share/[token]/book/route.ts` — create a booking (activities + email)
- `app/api/bookings/[cancelToken]/route.ts` — cancel/reschedule via token
- `lib/availability.ts` — availability computation logic (merge busy times, find free slots)
- `lib/bookingEmail.ts` — email template for booking notifications
- `components/BookingTemplateEditor.tsx` — template create/edit form
- `components/BookingPage.tsx` — public booking page (slot picker + form)

### Modified Files
- `components/SettingsModal.tsx` — add "Templates" tab
- `components/ShareCalendarShell.tsx` — add booking entry point
- `app/api/settings/share-links/route.ts` — add booking_enabled + template linking
- `components/CalendarShell.tsx` — cancel/reschedule from activity view
- `components/FavoritesDropdown.tsx` — booking toggle in share link editor
- `types/index.ts` — add BookingTemplate, Booking types

---

## Task 1: Database Migration

**Files:**
- Create: `db/migrations/13_create_booking_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Booking templates (user-defined meeting types)
CREATE TABLE IF NOT EXISTS booking_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  name            TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  availability_windows JSONB NOT NULL DEFAULT '[]',
  buffer_minutes  INT NOT NULL DEFAULT 0,
  targets         JSONB NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '[]',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_templates_account ON booking_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_booking_templates_user ON booking_templates(user_email);

-- Junction: which templates are offered on which share links
CREATE TABLE IF NOT EXISTS share_link_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id   UUID NOT NULL REFERENCES favorite_share_links(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES booking_templates(id) ON DELETE CASCADE,
  UNIQUE (share_link_id, template_id)
);

-- Add booking_enabled flag to share links
ALTER TABLE favorite_share_links ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT false;

-- Bookings (created meetings)
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES booking_templates(id),
  share_link_id   UUID NOT NULL REFERENCES favorite_share_links(id),
  booker_email    TEXT NOT NULL,
  booked_date     DATE NOT NULL,
  booked_time     TIME NOT NULL,
  duration_minutes INT NOT NULL,
  field_values    JSONB NOT NULL DEFAULT '{}',
  cancel_token    TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'rescheduled')),
  created_erp_ids JSONB DEFAULT '[]',
  created_outlook_id TEXT,
  created_google_id TEXT,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_account ON bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cancel_token ON bookings(cancel_token);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_share_link ON bookings(share_link_id);
```

- [ ] **Step 2: Run migration locally**

Run: `psql $DATABASE_URL -f db/migrations/13_create_booking_tables.sql`
Expected: CREATE TABLE, CREATE INDEX, ALTER TABLE — no errors

- [ ] **Step 3: Commit**

```bash
git add db/migrations/13_create_booking_tables.sql
git commit -m "feat: add booking tables migration (templates, junction, bookings)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add booking types**

Add to the end of `types/index.ts`:

```typescript
export interface AvailabilityWindow {
  days: number[]        // 0=Sun, 1=Mon, ... 6=Sat
  startTime: string     // "HH:mm"
  endTime: string       // "HH:mm"
}

export interface CustomField {
  label: string
  type: 'text' | 'email'
  required: boolean
}

export interface TemplateTargets {
  erp?: {
    connectionId: string
    fields: Record<string, string>  // ActType, PRCode, CUCode, etc.
  }[]
  outlook?: {
    enabled: boolean
    onlineMeeting: boolean
    location?: string
  }
  google?: {
    enabled: boolean
    onlineMeeting: boolean
    location?: string
  }
}

export interface BookingTemplate {
  id: string
  name: string
  duration_minutes: number
  availability_windows: AvailabilityWindow[]
  buffer_minutes: number
  targets: TemplateTargets
  custom_fields: CustomField[]
  active: boolean
  created_at: string
  updated_at: string
  // Populated on read:
  linked_share_links?: { id: string; name: string }[]
}

export interface Booking {
  id: string
  template_id: string
  share_link_id: string
  booker_email: string
  booked_date: string
  booked_time: string
  duration_minutes: number
  field_values: Record<string, string>
  cancel_token: string
  status: 'confirmed' | 'cancelled' | 'rescheduled'
  created_erp_ids: { connectionId: string; activityId: string }[]
  created_outlook_id: string | null
  created_google_id: string | null
  created_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add BookingTemplate and Booking types"
```

---

## Task 3: Templates CRUD API

**Files:**
- Create: `app/api/settings/templates/route.ts`
- Test: `__tests__/api/templates.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { GET, POST, PUT, DELETE } from '@/app/api/settings/templates/route'

// Mock dependencies
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({
    userCode: 'EKS', email: 'test@test.com', accountId: '00000000-0000-0000-0000-000000000001'
  }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
}))
jest.mock('@/lib/db', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  }
}))

describe('GET /api/settings/templates', () => {
  it('returns templates for the current user', async () => {
    const { pool } = require('@/lib/db')
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 't1', name: 'Sales Intro', duration_minutes: 30, availability_windows: [], buffer_minutes: 0, targets: {}, custom_fields: [], active: true, created_at: '2026-01-01', updated_at: '2026-01-01' }
    ]})
    const res = await GET()
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Sales Intro')
  })
})

describe('POST /api/settings/templates', () => {
  it('creates a new template', async () => {
    const { pool } = require('@/lib/db')
    pool.query.mockResolvedValueOnce({ rows: [{ id: 't1', name: 'Demo' }] })
    const req = new Request('http://localhost/api/settings/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Demo', duration_minutes: 60, availability_windows: [{ days: [1,2,3,4,5], startTime: '09:00', endTime: '17:00' }], targets: {}, custom_fields: [] }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/api/templates.test.ts --no-cache`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { rows } = await pool.query(
    `SELECT t.*, COALESCE(
      (SELECT json_agg(json_build_object('id', sl.id, 'name', sl.name))
       FROM share_link_templates slt
       JOIN favorite_share_links sl ON sl.id = slt.share_link_id
       WHERE slt.template_id = t.id), '[]'
    ) AS linked_share_links
    FROM booking_templates t
    WHERE t.account_id = $1 AND t.user_email = $2
    ORDER BY t.name`,
    [session.accountId, session.email]
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const body = await req.json()
  const { name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields } = body

  if (!name || !duration_minutes) {
    return NextResponse.json({ error: 'name and duration_minutes required' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `INSERT INTO booking_templates (account_id, user_email, name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [session.accountId, session.email, name, duration_minutes,
     JSON.stringify(availability_windows ?? []), buffer_minutes ?? 0,
     JSON.stringify(targets ?? {}), JSON.stringify(custom_fields ?? [])]
  )
  return NextResponse.json(rows[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sets: string[] = []
  const params: unknown[] = []
  let idx = 1

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'durationMinutes' ? 'duration_minutes'
      : key === 'availabilityWindows' ? 'availability_windows'
      : key === 'bufferMinutes' ? 'buffer_minutes'
      : key === 'customFields' ? 'custom_fields'
      : key
    const dbValue = ['availability_windows', 'targets', 'custom_fields'].includes(dbKey)
      ? JSON.stringify(value) : value
    sets.push(`${dbKey} = $${idx++}`)
    params.push(dbValue)
  }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  sets.push(`updated_at = now()`)
  params.push(id, session.accountId, session.email)

  const { rows } = await pool.query(
    `UPDATE booking_templates SET ${sets.join(', ')} WHERE id = $${idx++} AND account_id = $${idx++} AND user_email = $${idx} RETURNING *`,
    params
  )
  if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { id, duplicate } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (duplicate) {
    // Duplicate: copy template with " (copy)" suffix
    const { rows } = await pool.query(
      `INSERT INTO booking_templates (account_id, user_email, name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields)
       SELECT account_id, user_email, name || ' (copy)', duration_minutes, availability_windows, buffer_minutes, targets, custom_fields
       FROM booking_templates WHERE id = $1 AND account_id = $2 AND user_email = $3
       RETURNING *`,
      [id, session.accountId, session.email]
    )
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(rows[0], { status: 201 })
  }

  await pool.query(
    'DELETE FROM booking_templates WHERE id = $1 AND account_id = $2 AND user_email = $3',
    [id, session.accountId, session.email]
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/api/templates.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/settings/templates/route.ts __tests__/api/templates.test.ts types/index.ts
git commit -m "feat: templates CRUD API with tests"
```

---

## Task 4: Availability Engine

**Files:**
- Create: `lib/availability.ts`
- Test: `__tests__/lib/availability.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { computeAvailableSlots, type BusyBlock } from '@/lib/availability'

describe('computeAvailableSlots', () => {
  const windows = [
    { days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }, // Mon-Fri 9-17
  ]

  it('returns slots for a free day', () => {
    // Monday 2026-04-13, no busy blocks, 30min duration, 0 buffer
    const slots = computeAvailableSlots('2026-04-13', windows, [], 30, 0)
    expect(slots.length).toBe(16) // 09:00-09:30, 09:30-10:00, ... 16:30-17:00
    expect(slots[0]).toEqual({ start: '09:00', end: '09:30' })
    expect(slots[slots.length - 1]).toEqual({ start: '16:30', end: '17:00' })
  })

  it('blocks busy times', () => {
    const busy: BusyBlock[] = [{ start: '10:00', end: '11:00' }]
    const slots = computeAvailableSlots('2026-04-13', windows, busy, 30, 0)
    // Should not contain 10:00 or 10:30 starts
    expect(slots.find(s => s.start === '10:00')).toBeUndefined()
    expect(slots.find(s => s.start === '10:30')).toBeUndefined()
    expect(slots.find(s => s.start === '09:00')).toBeDefined()
    expect(slots.find(s => s.start === '11:00')).toBeDefined()
  })

  it('respects buffer time', () => {
    const busy: BusyBlock[] = [{ start: '10:00', end: '10:30' }]
    const slots = computeAvailableSlots('2026-04-13', windows, busy, 30, 15)
    // 09:00-09:30 ok, 09:30-10:00 blocked (15min buffer before 10:00), 10:30-11:00 blocked (15min buffer after 10:30)
    expect(slots.find(s => s.start === '09:00')).toBeDefined()
    expect(slots.find(s => s.start === '09:30')).toBeUndefined()
    expect(slots.find(s => s.start === '10:30')).toBeUndefined()
    expect(slots.find(s => s.start === '10:45')).toBeDefined()
  })

  it('returns empty for weekend when only weekdays configured', () => {
    // Saturday 2026-04-18
    const slots = computeAvailableSlots('2026-04-18', windows, [], 30, 0)
    expect(slots).toHaveLength(0)
  })

  it('handles 1h duration', () => {
    const slots = computeAvailableSlots('2026-04-13', windows, [], 60, 0)
    expect(slots.length).toBe(8) // 09:00-10:00, 10:00-11:00, ... 16:00-17:00
    expect(slots[0]).toEqual({ start: '09:00', end: '10:00' })
  })

  it('handles multiple windows on same day', () => {
    const multiWindows = [
      { days: [1], startTime: '09:00', endTime: '12:00' },
      { days: [1], startTime: '14:00', endTime: '17:00' },
    ]
    const slots = computeAvailableSlots('2026-04-13', multiWindows, [], 60, 0)
    // 09-12 = 3 slots, 14-17 = 3 slots
    expect(slots.length).toBe(6)
    expect(slots.find(s => s.start === '12:00')).toBeUndefined()
    expect(slots.find(s => s.start === '13:00')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/availability.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement availability engine**

```typescript
import { parseISO, getDay } from 'date-fns'
import type { AvailabilityWindow } from '@/types'

export interface BusyBlock {
  start: string  // "HH:mm"
  end: string    // "HH:mm"
}

export interface TimeSlot {
  start: string  // "HH:mm"
  end: string    // "HH:mm"
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Compute available time slots for a given date.
 * 1. Find which availability windows apply to this day of week
 * 2. Generate candidate slots at 30-min intervals within those windows
 * 3. Remove slots that overlap with busy blocks (including buffer)
 */
export function computeAvailableSlots(
  date: string,
  windows: AvailabilityWindow[],
  busy: BusyBlock[],
  durationMinutes: number,
  bufferMinutes: number
): TimeSlot[] {
  const dayOfWeek = getDay(parseISO(date)) // 0=Sun, 1=Mon, ...

  // Collect all availability ranges for this day
  const ranges: { start: number; end: number }[] = []
  for (const w of windows) {
    if (w.days.includes(dayOfWeek)) {
      ranges.push({ start: timeToMinutes(w.startTime), end: timeToMinutes(w.endTime) })
    }
  }
  if (ranges.length === 0) return []

  // Expand busy blocks with buffer
  const expandedBusy = busy.map(b => ({
    start: timeToMinutes(b.start) - bufferMinutes,
    end: timeToMinutes(b.end) + bufferMinutes,
  }))

  // Generate candidate slots at 30-min intervals
  const STEP = 30
  const slots: TimeSlot[] = []

  for (const range of ranges) {
    for (let start = range.start; start + durationMinutes <= range.end; start += STEP) {
      const end = start + durationMinutes

      // Check overlap with any busy block
      const overlaps = expandedBusy.some(b => start < b.end && end > b.start)
      if (!overlaps) {
        slots.push({ start: minutesToTime(start), end: minutesToTime(end) })
      }
    }
  }

  return slots
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/lib/availability.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/availability.ts __tests__/lib/availability.test.ts
git commit -m "feat: availability engine with busy-block exclusion and buffer"
```

---

## Task 5: Availability API Endpoint

**Files:**
- Create: `app/api/share/[token]/availability/route.ts`

This endpoint is public (no auth) — it uses the share token. It fetches activities from the favorite's calendars, computes busy blocks, and returns available slots for a given template + date range.

- [ ] **Step 1: Implement the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { fetchIcsEvents } from '@/lib/icsParser'
import { emailForCode } from '@/lib/emailForCode'
import { computeAvailableSlots, type BusyBlock } from '@/lib/availability'
import type { AvailabilityWindow } from '@/types'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

function toTime(raw: string): string {
  return (raw ?? '').slice(0, 5)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { searchParams } = new URL(req.url)
  const templateId = searchParams.get('templateId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  if (!templateId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'templateId, dateFrom, dateTo required' }, { status: 400 })
  }

  // Validate share link + booking enabled
  const { rows: linkRows } = await pool.query(
    `SELECT sl.id, sl.booking_enabled, sl.password_hash IS NOT NULL AS "hasPassword",
            f.person_codes AS "personCodes", f.hidden_calendars AS "hiddenCalendars",
            f.user_email AS "ownerEmail", f.account_id AS "accountId"
     FROM favorite_share_links sl
     JOIN user_favorites f ON f.id = sl.favorite_id
     WHERE sl.token = $1`,
    [token]
  )
  if (linkRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const link = linkRows[0]
  if (!link.booking_enabled) return NextResponse.json({ error: 'Booking not enabled' }, { status: 403 })
  if (link.hasPassword) return NextResponse.json({ error: 'Password-protected links cannot use booking' }, { status: 403 })

  // Verify template is linked to this share link
  const { rows: templateRows } = await pool.query(
    `SELECT t.* FROM booking_templates t
     JOIN share_link_templates slt ON slt.template_id = t.id
     WHERE slt.share_link_id = $1 AND t.id = $2 AND t.active = true`,
    [link.id, templateId]
  )
  if (templateRows.length === 0) return NextResponse.json({ error: 'Template not available' }, { status: 404 })
  const template = templateRows[0]

  const personCodes: string[] = link.personCodes ?? []
  const hiddenCalendarsSet = new Set<string>(link.hiddenCalendars ?? [])
  const accountId: string = link.accountId ?? DEFAULT_ACCOUNT_ID
  const windows: AvailabilityWindow[] = template.availability_windows ?? []
  const duration: number = template.duration_minutes
  const buffer: number = template.buffer_minutes ?? 0

  // Collect busy blocks per day
  const busyByDate = new Map<string, BusyBlock[]>()
  function addBusy(date: string, start: string, end: string) {
    if (!date || !start || !end) return
    const list = busyByDate.get(date) ?? []
    list.push({ start, end })
    busyByDate.set(date, list)
  }

  // Also include existing bookings for this share link
  const { rows: existingBookings } = await pool.query(
    `SELECT booked_date, booked_time, duration_minutes FROM bookings
     WHERE share_link_id = $1 AND status = 'confirmed'
     AND booked_date >= $2::date AND booked_date <= $3::date`,
    [link.id, dateFrom, dateTo]
  )
  for (const b of existingBookings) {
    const startMins = parseInt(b.booked_time.split(':')[0]) * 60 + parseInt(b.booked_time.split(':')[1])
    const endMins = startMins + b.duration_minutes
    const endH = String(Math.floor(endMins / 60)).padStart(2, '0')
    const endM = String(endMins % 60).padStart(2, '0')
    addBusy(b.booked_date.toISOString().slice(0, 10), b.booked_time.slice(0, 5), `${endH}:${endM}`)
  }

  // Fetch busy times from ERP
  if (!hiddenCalendarsSet.has('herbe')) {
    try {
      const connections = await getErpConnections(accountId)
      for (const conn of connections) {
        try {
          const raw = await herbeFetchAll(REGISTERS.activities, { sort: 'TransDate', range: `${dateFrom}:${dateTo}` }, 100, conn)
          for (const record of raw) {
            const r = record as Record<string, unknown>
            const todoFlag = String(r['TodoFlag'] ?? '0')
            if (todoFlag !== '0' && todoFlag !== '') continue
            const mainPersons = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
            if (mainPersons.some(p => personCodes.includes(p))) {
              addBusy(String(r['TransDate'] ?? ''), toTime(String(r['StartTime'] ?? '')), toTime(String(r['EndTime'] ?? '')))
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Fetch busy times from Outlook
  if (!hiddenCalendarsSet.has('outlook')) {
    const azureConfig = await getAzureConfig(accountId)
    if (azureConfig) {
      for (const code of personCodes) {
        try {
          const email = await emailForCode(code, accountId)
          if (!email) continue
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${dateFrom}T00:00:00&endDateTime=${dateTo}T23:59:59&$top=200&$select=start,end`,
            { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of (data.value ?? []) as Record<string, unknown>[]) {
              const start = ev['start'] as Record<string, string> | undefined
              const end = ev['end'] as Record<string, string> | undefined
              if (start?.dateTime && end?.dateTime) {
                addBusy(start.dateTime.slice(0, 10), start.dateTime.slice(11, 16), end.dateTime.slice(11, 16))
              }
            }
          }
        } catch {}
      }
    }
  }

  // Fetch busy times from Google
  const googleConfig = await getGoogleConfig(accountId)
  if (googleConfig) {
    for (const code of personCodes) {
      try {
        const email = await emailForCode(code, accountId)
        if (!email) continue
        const calendar = getCalendarClient(googleConfig, email)
        const res = await calendar.events.list({
          calendarId: 'primary',
          timeMin: `${dateFrom}T00:00:00+02:00`,
          timeMax: `${dateTo}T23:59:59+02:00`,
          singleEvents: true,
          fields: 'items(start,end)',
        })
        for (const ev of res.data.items ?? []) {
          const startDt = ev.start?.dateTime ?? ''
          const endDt = ev.end?.dateTime ?? ''
          if (startDt && endDt) {
            addBusy(startDt.slice(0, 10), startDt.slice(11, 16), endDt.slice(11, 16))
          }
        }
      } catch {}
    }
  }

  // Compute available slots per day
  const result: Record<string, { start: string; end: string }[]> = {}
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) {
    const dateStr = d.toISOString().slice(0, 10)
    const busy = busyByDate.get(dateStr) ?? []
    const slots = computeAvailableSlots(dateStr, windows, busy, duration, buffer)
    if (slots.length > 0) result[dateStr] = slots
  }

  return NextResponse.json({ slots: result, template: { name: template.name, duration_minutes: duration, custom_fields: template.custom_fields ?? [] } })
}
```

- [ ] **Step 2: Build check**

Run: `npx next build`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add app/api/share/[token]/availability/route.ts
git commit -m "feat: availability API endpoint — computes free slots from all calendar sources"
```

---

## Task 6: Booking Email Template

**Files:**
- Create: `lib/bookingEmail.ts`

- [ ] **Step 1: Implement email template**

```typescript
export interface BookingEmailData {
  templateName: string
  date: string           // "2026-04-15"
  time: string           // "14:00"
  duration: number       // minutes
  bookerEmail: string
  participants: string[] // person emails
  fieldValues: Record<string, string>
  cancelUrl: string
  status: 'confirmed' | 'cancelled' | 'rescheduled'
}

export function buildBookingEmail(data: BookingEmailData): { subject: string; html: string } {
  const statusLabel = data.status === 'confirmed' ? 'Booking Confirmed'
    : data.status === 'cancelled' ? 'Booking Cancelled'
    : 'Booking Rescheduled'

  const fieldRows = Object.entries(data.fieldValues)
    .map(([label, value]) => `<tr><td style="padding:4px 8px;color:#888;">${label}</td><td style="padding:4px 8px;">${value || '—'}</td></tr>`)
    .join('')

  const subject = `${statusLabel}: ${data.templateName} — ${data.date} ${data.time}`

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
  <h2 style="margin:0 0 16px;">${statusLabel}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 8px;color:#888;">Meeting</td><td style="padding:4px 8px;font-weight:bold;">${data.templateName}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Date</td><td style="padding:4px 8px;">${data.date}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Time</td><td style="padding:4px 8px;">${data.time} (${data.duration} min)</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Booked by</td><td style="padding:4px 8px;">${data.bookerEmail}</td></tr>
    <tr><td style="padding:4px 8px;color:#888;">Participants</td><td style="padding:4px 8px;">${data.participants.join(', ')}</td></tr>
    ${fieldRows}
  </table>
  ${data.status !== 'cancelled' ? `
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">
    <a href="${data.cancelUrl}" style="display:inline-block;padding:8px 16px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;font-size:13px;font-weight:bold;">Cancel / Reschedule</a>
  </div>` : ''}
  <p style="margin-top:20px;font-size:11px;color:#999;">Sent by herbe.calendar</p>
</div>`

  return { subject, html }
}

/** Build structured text for ERP Text field and Outlook/Google description */
export function buildActivityText(
  bookerEmail: string,
  fieldValues: Record<string, string>,
  cancelUrl: string
): string {
  const lines = [`Booked by: ${bookerEmail}`]
  for (const [label, value] of Object.entries(fieldValues)) {
    lines.push(`${label}: ${value || '—'}`)
  }
  lines.push('', `Cancel/reschedule: ${cancelUrl}`)
  return lines.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/bookingEmail.ts
git commit -m "feat: booking email template and activity text builder"
```

---

## Task 7: Booking Creation API

**Files:**
- Create: `app/api/share/[token]/book/route.ts`

This is the most complex endpoint — it validates availability, creates activities in all configured endpoints, sends emails, and returns the booking confirmation.

- [ ] **Step 1: Implement the booking endpoint**

Create `app/api/share/[token]/book/route.ts` with:
- POST handler that accepts `{ templateId, date, time, bookerEmail, fieldValues }`
- Re-checks availability for the selected slot (conflict guard)
- Creates activities in ERP connections (via `POST /api/activities` pattern using `herbeFetch`)
- Creates Outlook event (via `graphFetch`)
- Creates Google event (via `getCalendarClient`)
- Inserts booking record with cancel_token
- Sends notification email to booker + all participants
- Returns `{ booking, cancelToken }`

The full implementation follows the patterns from `app/api/activities/route.ts` (ERP), `app/api/outlook/route.ts` (Outlook), and `app/api/google/route.ts` (Google). Each target in the template's `targets` config is processed. Activity text includes the booker info and custom field values via `buildActivityText()`.

Email sending uses `sendMailSmtp()` from `lib/smtp.ts` or `graphFetch('/users/{email}/sendMail')` for Azure-based accounts, following the existing pattern in `app/api/admin/config/route.ts`.

- [ ] **Step 2: Build check**

Run: `npx next build`
Expected: Compiles successfully

- [ ] **Step 3: Commit**

```bash
git add app/api/share/[token]/book/route.ts
git commit -m "feat: booking creation endpoint — multi-target activity creation + email"
```

---

## Task 8: Cancel/Reschedule API

**Files:**
- Create: `app/api/bookings/[cancelToken]/route.ts`

- [ ] **Step 1: Implement cancel/reschedule endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { herbeFetchById, herbeWebExcellentDelete } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { emailForCode } from '@/lib/emailForCode'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { buildBookingEmail } from '@/lib/bookingEmail'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cancelToken: string }> }
) {
  const { cancelToken } = await params
  const { rows } = await pool.query(
    `SELECT b.*, t.name AS template_name, t.duration_minutes, t.custom_fields
     FROM bookings b JOIN booking_templates t ON t.id = b.template_id
     WHERE b.cancel_token = $1`,
    [cancelToken]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ cancelToken: string }> }
) {
  const { cancelToken } = await params

  const { rows } = await pool.query(
    `SELECT b.*, t.name AS template_name, t.duration_minutes,
            f.person_codes AS "personCodes", f.user_email AS "ownerEmail", f.account_id AS "accountId"
     FROM bookings b
     JOIN booking_templates t ON t.id = b.template_id
     JOIN favorite_share_links sl ON sl.id = b.share_link_id
     JOIN user_favorites f ON f.id = sl.favorite_id
     WHERE b.cancel_token = $1 AND b.status = 'confirmed'`,
    [cancelToken]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Booking not found or already cancelled' }, { status: 404 })

  const booking = rows[0]
  const accountId = booking.accountId

  // Cancel ERP activities
  for (const erp of (booking.created_erp_ids ?? []) as { connectionId: string; activityId: string }[]) {
    try {
      const connections = await getErpConnections(accountId)
      const conn = connections.find(c => c.id === erp.connectionId)
      if (conn) {
        await herbeWebExcellentDelete('ActVc', erp.activityId, '', conn)
      }
    } catch (e) {
      console.warn('[booking cancel] ERP delete failed:', String(e))
    }
  }

  // Cancel Outlook event
  if (booking.created_outlook_id) {
    try {
      const azureConfig = await getAzureConfig(accountId)
      if (azureConfig) {
        const email = booking.ownerEmail
        await graphFetch(`/users/${email}/events/${booking.created_outlook_id}`, { method: 'DELETE' }, azureConfig)
      }
    } catch (e) {
      console.warn('[booking cancel] Outlook delete failed:', String(e))
    }
  }

  // Cancel Google event
  if (booking.created_google_id) {
    try {
      const googleConfig = await getGoogleConfig(accountId)
      if (googleConfig) {
        const email = booking.ownerEmail
        const calendar = getCalendarClient(googleConfig, email)
        await calendar.events.delete({ calendarId: 'primary', eventId: booking.created_google_id })
      }
    } catch (e) {
      console.warn('[booking cancel] Google delete failed:', String(e))
    }
  }

  // Update booking status
  await pool.query('UPDATE bookings SET status = $1 WHERE id = $2', ['cancelled', booking.id])

  // Send cancellation email
  try {
    const personEmails: string[] = []
    for (const code of (booking.personCodes ?? []) as string[]) {
      const email = await emailForCode(code, accountId)
      if (email) personEmails.push(email)
    }
    const allRecipients = [booking.booker_email, ...personEmails]
    const cancelUrl = `${req.headers.get('origin') ?? ''}/booking/cancel/${cancelToken}`
    const emailData = buildBookingEmail({
      templateName: booking.template_name,
      date: booking.booked_date.toISOString().slice(0, 10),
      time: booking.booked_time.slice(0, 5),
      duration: booking.duration_minutes,
      bookerEmail: booking.booker_email,
      participants: personEmails,
      fieldValues: booking.field_values ?? {},
      cancelUrl,
      status: 'cancelled',
    })

    const smtpConfig = await getSmtpConfig(accountId)
    if (smtpConfig) {
      for (const to of allRecipients) {
        await sendMailSmtp(smtpConfig, to, emailData.subject, emailData.html).catch(() => {})
      }
    }
  } catch {}

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/bookings/[cancelToken]/route.ts
git commit -m "feat: cancel booking endpoint — deletes activities across endpoints + sends email"
```

---

## Task 9: Templates Tab in Settings Modal

**Files:**
- Modify: `components/SettingsModal.tsx`
- Create: `components/BookingTemplateEditor.tsx`

- [ ] **Step 1: Add 'templates' to Tab type and add the tab button**

In `SettingsModal.tsx`, change the Tab type and add the button in the tab bar. The tab renders a list of templates with create/edit/duplicate/delete actions. Each template shows its name, duration, linked share links, and an edit button.

- [ ] **Step 2: Create BookingTemplateEditor component**

`BookingTemplateEditor.tsx` is a form for creating/editing a template. Fields:
- Name (text input)
- Duration (select: 15, 30, 45, 60, 90, 120 min)
- Availability windows (add/remove rows: day checkboxes + time range)
- Buffer time (number input)
- Targets section: toggles for ERP connections, Outlook (with Teams toggle), Google (with Meet toggle), with pre-fill fields for ERP
- Custom fields (add/remove rows: label + type + required toggle)
- Save/Cancel buttons

The component fetches ERP connections from the users API response (already available in CalendarShell and passed via props).

- [ ] **Step 3: Wire template list with CRUD operations**

The templates tab in SettingsModal:
- On mount, `GET /api/settings/templates`
- Create: opens BookingTemplateEditor, on save `POST /api/settings/templates`
- Edit: opens BookingTemplateEditor pre-filled, on save `PUT /api/settings/templates`
- Duplicate: `DELETE /api/settings/templates` with `{ id, duplicate: true }`
- Delete: confirm dialog, then `DELETE /api/settings/templates` with `{ id }`
- Shows which share links use each template (from `linked_share_links` in GET response)

- [ ] **Step 4: Build check and commit**

```bash
git add components/SettingsModal.tsx components/BookingTemplateEditor.tsx
git commit -m "feat: Templates tab in Settings modal with full CRUD"
```

---

## Task 10: Share Link Booking Toggle

**Files:**
- Modify: `app/api/settings/share-links/route.ts`
- Modify: `components/FavoritesDropdown.tsx`

- [ ] **Step 1: Update share-links API**

In the PUT handler of `app/api/settings/share-links/route.ts`, add support for `booking_enabled` and `templateIds` fields. When `booking_enabled` is toggled, update the flag. When `templateIds` is provided, sync the `share_link_templates` junction table (delete old, insert new).

In the GET handler, join `share_link_templates` to return `templateIds` and template names for each share link.

- [ ] **Step 2: Update FavoritesDropdown**

In the share link editor UI (where visibility/password/expiry are configured), add:
- "Enable Booking" toggle
- When enabled, show a multi-select of available templates (fetched from `/api/settings/templates`)
- Save button updates both `booking_enabled` and `templateIds`

- [ ] **Step 3: Build check and commit**

```bash
git add app/api/settings/share-links/route.ts components/FavoritesDropdown.tsx
git commit -m "feat: booking toggle + template linking on share links"
```

---

## Task 11: Booking Page UI

**Files:**
- Create: `components/BookingPage.tsx`
- Modify: `components/ShareCalendarShell.tsx`

- [ ] **Step 1: Create BookingPage component**

`BookingPage.tsx` is the public-facing booking interface. Flow:

1. **Template selection** — show available templates as cards (name, duration)
2. **Date picker** — week-at-a-glance or date list showing which days have slots
3. **Slot picker** — show available time slots for selected date (fetched from `/api/share/{token}/availability?templateId=X&dateFrom=Y&dateTo=Z`)
4. **Booking form** — booker email (always required) + custom fields from template
5. **Confirmation** — success message with meeting details

The component manages its own state machine: `selectTemplate → selectDate → selectSlot → fillForm → confirm`.

Timezone handling: detect browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`, show a timezone selector, and convert displayed times accordingly.

- [ ] **Step 2: Add booking entry to ShareCalendarShell**

In `ShareCalendarShell.tsx`, when `config.bookingEnabled` is true, show a "Book a Meeting" button in the header. Clicking it renders `<BookingPage>` instead of the calendar grid.

Add `bookingEnabled` and `templateNames` to the `ShareConfig` interface and the `GET /api/share/[token]` response.

- [ ] **Step 3: Update share token API**

In `app/api/share/[token]/route.ts`, add `booking_enabled` and template info to the response:

```sql
SELECT sl.booking_enabled,
  (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'duration_minutes', t.duration_minutes))
   FROM share_link_templates slt JOIN booking_templates t ON t.id = slt.template_id
   WHERE slt.share_link_id = sl.id AND t.active = true) AS templates
```

- [ ] **Step 4: Build check and commit**

```bash
git add components/BookingPage.tsx components/ShareCalendarShell.tsx app/api/share/[token]/route.ts
git commit -m "feat: booking page UI — template selection, slot picker, form, confirmation"
```

---

## Task 12: Booking Creation Integration

**Files:**
- Modify: `app/api/share/[token]/book/route.ts` (finalize from Task 7)

- [ ] **Step 1: Implement full booking creation logic**

Complete the POST handler with:
- Validate share link token + booking enabled
- Validate template is linked to this share link
- Re-check availability (conflict guard)
- Resolve person emails from person codes
- Create ERP activities for each configured connection (using `herbeFetch` POST pattern from `app/api/activities/route.ts`)
- Create Outlook event if configured (using `graphFetch` POST pattern)
- Create Google event if configured (using `getCalendarClient` pattern)
- Build activity text with `buildActivityText()`
- Insert booking record
- Send emails to all parties
- Return booking confirmation

- [ ] **Step 2: End-to-end test**

Test the full flow: select template → pick slot → fill form → submit → verify activities created + email sent + booking record exists.

- [ ] **Step 3: Commit**

```bash
git add app/api/share/[token]/book/route.ts
git commit -m "feat: complete booking creation with multi-endpoint activity creation"
```

---

## Task 13: Cancel/Reschedule Page

**Files:**
- Create: `app/booking/cancel/[cancelToken]/page.tsx`
- Create: `components/BookingCancelPage.tsx`

- [ ] **Step 1: Create cancel page**

Server component at `app/booking/cancel/[cancelToken]/page.tsx` renders `<BookingCancelPage cancelToken={cancelToken} />`.

- [ ] **Step 2: Create BookingCancelPage component**

`BookingCancelPage.tsx`:
- On mount, `GET /api/bookings/{cancelToken}` to fetch booking details
- Shows meeting details (template name, date, time, field values)
- "Cancel Booking" button → `DELETE /api/bookings/{cancelToken}`
- "Reschedule" button → redirects to the share link booking page with a `reschedule={cancelToken}` query param (the booking page pre-cancels the old booking on successful rebooking)
- Shows confirmation after cancel

- [ ] **Step 3: Commit**

```bash
git add app/booking/cancel/[cancelToken]/page.tsx components/BookingCancelPage.tsx
git commit -m "feat: cancel/reschedule page for bookings"
```

---

## Task 14: Participant Cancel from Calendar

**Files:**
- Modify: `components/ActivityForm.tsx`
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Detect booked activities**

When viewing an activity that was created by a booking, show a "Cancel Booking" or "Reschedule" button in the ActivityForm. Detection: check if the activity's ERP Text or Outlook description contains a cancel URL pattern, or query the bookings table by created activity IDs.

A simpler approach: add a `bookingCancelToken` field to the Activity interface. When fetching activities, check if any booking record references this activity's ID and include the cancel token.

- [ ] **Step 2: Add cancel/reschedule actions**

In ActivityForm, when `bookingCancelToken` is present:
- Show "This is a booked meeting" indicator
- "Cancel Booking" button → calls `DELETE /api/bookings/{cancelToken}`
- "Reschedule" button → opens cancel page in new tab

- [ ] **Step 3: Commit**

```bash
git add components/ActivityForm.tsx components/CalendarShell.tsx
git commit -m "feat: participants can cancel/reschedule bookings from calendar view"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-09-booking-page.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?