# Herbe Calendar — Design Spec

**Date:** 2026-03-12
**Status:** Approved

---

## Overview

A mobile-first web calendar application deployed on Vercel that displays and manages activities for one or multiple employees. Activities are sourced from two systems: the **Herbe ERP** (via REST API) and **Microsoft Outlook/Teams** (via MS Graph API). Users authenticate via magic link email. The app is internal tooling for a team at Burti.

---

## 1. Architecture

```
Browser (Next.js React — App Router)
    │  fetch("/api/...")
    ▼
Next.js API Routes  ←── Vercel env vars (credentials, company code)
    ├── Herbe ERP proxy  →  https://roniscloud.burti.lv:6012/api/3/{Register}
    └── MS Graph proxy   →  https://graph.microsoft.com/v1.0/users/{email}/...
```

- All ERP and Graph credentials live exclusively in Vercel environment variables — never sent to the browser.
- The OAuth token for Herbe ERP is obtained and cached server-side; refreshed automatically on expiry.
- The Azure AD app uses **app-only auth** (`Calendars.ReadWrite` application permission, admin-consented) so all users' calendars can be accessed from one service account.
- Single timezone — all times treated as local (no timezone conversion).

---

## 2. Authentication (App Login)

- **Method:** Magic link (passwordless email)
- **Library:** NextAuth.js v5 with Email provider
- **Email transport:** Microsoft Graph API (`/v1.0/users/{sender}/sendMail`) using the same Azure AD app registration
- **Flow:**
  1. User enters email on login page
  2. API route checks email against `UserVc` in Herbe ERP
  3. If not found → show "Email not registered" error, no link sent
  4. If found → send magic link email via MS Graph, store verification token in Neon DB
  5. User clicks link → NextAuth validates token, creates session with `{ email, userCode }` payload
- **NextAuth email transport:** Uses a custom `sendVerificationRequest` callback (not NextAuth's built-in nodemailer transport) that calls `POST /v1.0/users/{SENDER_EMAIL}/sendMail` via MS Graph with the app-only Azure AD token.
- **Session storage:** Neon (serverless Postgres) via NextAuth adapter — stores `users`, `sessions`, `verification_tokens` tables

---

## 3. Environment Variables

```bash
# Herbe ERP
HERBE_API_BASE_URL=https://roniscloud.burti.lv:6012/api
HERBE_COMPANY_CODE=3
HERBE_CLIENT_ID=...
HERBE_CLIENT_SECRET=...

# Microsoft (Azure AD app registration)
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...

# NextAuth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-app.vercel.app

# Neon
DATABASE_URL=...
```

---

## 4. API Routes (Next.js proxy layer)

All routes are authenticated — unauthenticated requests return 401.

### Herbe ERP

| Method | Route | ERP endpoint | Notes |
|--------|-------|-------------|-------|
| GET | `/api/users` | `UserVc` | Full list, cached; used for person selector |
| GET | `/api/activity-types` | `ActTypeVc` | Full list, cached |
| GET | `/api/activities` | `ActVc` | Query: `persons`, `date` (or `dateFrom`/`dateTo`); paged with `offset`/`limit` |
| POST | `/api/activities` | `ActVc` | Multi-person: comma-separated codes in `AccessGroup` field |
| PUT | `/api/activities/[id]` | `ActVc` | Fetch-before-mutate: proxy GETs the activity first, checks `AccessGroup`, then forwards PATCH only if authorized |
| DELETE | `/api/activities/[id]` | `ActVc` | Same fetch-before-mutate authorization check as PUT |
| GET | `/api/projects` | `PRVc` | Query: `q` (search string); paged |
| GET | `/api/customers` | `CUVc` | Query: `q` (search string); paged |

> **Note:** The exact field name for multi-person assignment (`AccessGroup`) should be verified against the `ActVc` field list during implementation. It is defined as a named constant `ACTIVITY_ACCESS_GROUP_FIELD` so it can be corrected in one place.

### Microsoft Graph

| Method | Route | Graph endpoint | Notes |
|--------|-------|---------------|-------|
| GET | `/api/outlook` | `/users/{email}/calendarView` | Query: `persons`, `date`/`dateRange`; fetches all selected users' events |
| POST | `/api/outlook` | `/users/{email}/events` | Creates event with `attendees` array for multi-person |
| PUT | `/api/outlook/[id]` | `/users/{email}/events/{id}` | Only if session user is organizer |
| DELETE | `/api/outlook/[id]` | `/users/{email}/events/{id}` | Only if session user is organizer |

Recurring events are **excluded** from all Graph queries (`recurrence` filter or skip series masters).

---

## 5. Frontend Components

```
app/
├── page.tsx                    # Main calendar (requires auth)
├── login/page.tsx              # Email input + "link sent" state
└── components/
    ├── CalendarHeader/         # Toolbar: date nav, Day/3-day toggle, person chips, + New
    ├── PersonSelector/         # Modal: add/remove people from active view
    ├── CalendarGrid/           # Outer scroll container; composes time column + person columns
    ├── TimeColumn/             # Fixed left column with hour labels (sticky)
    ├── PersonColumn/           # One person's time column; renders Herbe + Outlook blocks
    ├── ActivityBlock/          # Positioned block: solid left border = Herbe, dashed = Outlook
    ├── ActivityForm/           # Bottom sheet (mobile) / modal: create, edit, duplicate
    └── ErrorBanner/            # Inline API/validation errors inside ActivityForm
```

---

## 6. Calendar Views

### Day View
- Fixed time column (sticky left)
- One column per selected person
- Mobile: 2 columns visible at once; horizontal swipe to reveal more
- Desktop: all columns visible

### 3-Day View
- Same grid; date headers above each group of person columns
- Navigate with prev/next arrows (shifts by 1 day)
- Mobile: 2 people × 3 days visible; swipe horizontally

### Time Grid
- Hours displayed: **06:00 – 22:00** rendered in the grid; the viewport scrolls to show 08:00 on initial load. Users can scroll up/down to see outside normal hours.
- Each hour row: 56px tall, half-hour dashed divider
- Clicking an empty slot opens ActivityForm pre-filled with that time and person

### Activity Blocks
- Positioned absolutely within the time column by `top` (start time) and `height` (duration)
- **Herbe:** solid 3px left border, slightly opaque background in person's brand color
- **Outlook:** dashed 2px left border, more muted background, small calendar icon
- **Overlapping activities** (same person, same time): rendered side-by-side as narrow sub-columns within the person column

### Drag Interactions (touch + mouse)
- **Drag to move:** drag an activity block vertically to change its start/end time; snaps to 15-minute increments. On drop, fires PUT with updated times. Only available if user has edit permission.
- **Drag to resize:** drag the bottom edge of a block to extend/shorten the end time; same 15-min snap. On release, fires PUT.
- Both interactions show a ghost/preview of the new time while dragging and display the updated time label inline.
- On error (e.g. ERP rejects the new time), the block snaps back to its original position and an error toast is shown.

---

## 7. Activity Form

**Trigger:**
- Click empty time slot → pre-fill person (that column), date, time-from (clicked slot), time-to (60 min later by default)
- Click **+ New** → pre-fill person (logged-in user), date (current view), time-from = **end of last activity that day for that person** (smart default for continuous time entry)
- Click existing activity block → pre-fill all fields for editing

**Fields:**

| Field | Type | Source |
|-------|------|--------|
| Source | Toggle: Herbe / Outlook | — |
| Person(s) | Multi-select chips | `UserVc` (defaults to selected people in view) |
| Description | Text input | — |
| Date | Date picker | — |
| Time From | Time input | — |
| Time To | Time input | — |
| Activity Type | Dropdown | `ActTypeVc` |
| Project | Type-to-search | `PRVc` (paged, min 2 chars to search) |
| Customer | Type-to-search | `CUVc` (paged, min 2 chars to search) |

**Behaviour:**
- On submit: POST/PUT to relevant API route
- On ERP validation error (e.g. "Project is required"): show error inline in form, keep form open, allow correction and resubmit
- On success: close form, refetch affected person(s) activities
- **Duplicate button** (edit mode only): copies all fields into a new create form with time fields cleared for user to adjust
- **Delete button** (edit mode only): confirmation prompt, then DELETE request

**Permission guard:** Edit/delete controls only shown if session user is the activity owner or is in `AccessGroup` (Herbe) / is the event organizer (Outlook).

---

## 8. Person Selector

- Displayed as colored chips in the header (one per active person, their user code)
- Tap **+** chip to open PersonSelector modal
- Search/filter from `UserVc` list
- Tap to add/remove; changes immediately update the calendar view
- Each person is assigned a consistent color from the Burti brand palette:
  - Person 1: High Sky `#00ABCE`
  - Person 2: Rowanberry `#cd4c38`
  - Person 3: Forest Green `#4db89a`
  - Person 4+: colors rotate through the three base colors at 70% opacity (`rgba` tint), cycling indefinitely

---

## 9. Visual Design

**Theme:** Dark, Burti brand palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#231f20` (Deep Black) | App background |
| Surface | `#2d2829` | Cards, toolbar, calendar grid |
| Border | `#3a3435` | Dividers, hour lines |
| Primary | `#cd4c38` (Rowanberry) | Buttons, active states, CTA |
| Person 1 accent | `#00ABCE` (High Sky) | Column header, activity blocks |
| Person 2 accent | `#cd4c38` (Rowanberry) | Column header, activity blocks |
| Person 3 accent | `#4db89a` (Forest Green) | Column header, activity blocks |
| Text primary | `#ffffff` | — |
| Text muted | `#6b6467` | Time labels, secondary info |

**Mobile-first:** All layout and interaction designed for touch. Bottom sheet for forms. Swipe gesture for person columns. Pull-to-refresh on the calendar grid.

---

## 10. Data & Paging Strategy

- `UserVc` and `ActTypeVc`: fetched once on app load, stored in React state (small lists)
- `PRVc` and `CUVc`: searched on demand (min 2 chars), `limit=20`, never preloaded
- `ActVc` and Graph calendar events: fetched per view change (date + persons), `limit=100` per person per request; if a response returns exactly 100 records a second page is fetched (offset+100) — this continues until a partial page is received. In practice activity counts per day are well under 100.
- No client-side caching library (plain `fetch`); refetch triggered by date/person changes and after mutations

---

## 11. Out of Scope (v1)

- Recurring Outlook events (skipped entirely)
- Drag-to-move across different person columns (same person only)
- Export / print
- Push notifications / reminders
- Multi-company support (company code is a single env var)
- Offline support
