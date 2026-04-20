# herbe.calendar — Design Brief

This brief is meant to be handed to Claude (or any designer) to produce a cohesive visual language and screen-level designs for every user-facing surface of the product. Everything here is descriptive, not prescriptive about visuals — the designer should have latitude on aesthetics within the constraints below.

---

## 1. Product summary

**What it is.** A multi-tenant web calendar that unifies Hansaworld / Standard Books ERP activities with external calendar sources (Microsoft 365 / Outlook, Google Workspace, per-user Google OAuth, Zoom, Calendly, ICS feeds, colleague-shared calendars). One screen, every meeting, every ERP activity, any person.

**Who uses it.** Two primary personas:

- **Operator** — an employee running their day. Lives in day/week view. Cares about: fast activity creation, seeing colleagues' availability, jumping between their ERP activities and Outlook/Google meetings without tab-switching.
- **Admin / office manager** — sets up the company. Cares about: connecting ERP and email integrations, managing members and roles, checking sync health, publishing share links and booking pages.

Secondary persona:

- **External booker** — a customer opening a public booking page to schedule with someone internal. Never logs in. Cares about: "when can I meet them, and how little effort is this."

**Deployment context.** Installed per organization (tenant). Multiple ERP connections per tenant are common (e.g. Burti LV + Burti LT + Flex BI). Users are invited by admins and log in via email magic link.

**Form factors.** Desktop-first but used heavily on mobile (portrait and landscape). The app is installable as a PWA.

---

## 2. Brand & voice direction

Current aesthetic (what to preserve):

- **Dark by default**, light theme available. System-preference aware.
- **Brand accent:** warm red-orange (`#cd4c38`). Used sparingly — primary actions, active states.
- **Typeface:** currently system fonts. The designer may propose a pair (one for UI, one optional for display), but it must perform well at 11–13px for dense calendar labels.
- **Dense, not cramped.** This app shows a lot of information per screen (20+ person columns × 24 hours is a real case). Information density is a feature, not a flaw. Resist the temptation to "breathe" by adding padding at the cost of rows visible.
- **Quiet chrome, loud content.** Headers, borders, and frames should recede. Events, person colors, and status are the thing people look at.
- **Tone:** pragmatic, calm, slightly technical. Not playful. Not corporate.

Non-goals for the design:

- Not a marketing site aesthetic. No hero images with smiling teams, no oversized headlines.
- Not a "calm app" minimalism that hides information behind menus. Controls stay visible.
- Not Material, not iOS. Avoid distinctive platform signatures. Custom but neutral.

---

## 3. Design system expectations

The designer should deliver a documented system, not just screens.

**Required tokens:**

- Color: background, surface, elevated-surface, border, divider, text, text-muted, text-disabled, primary, primary-hover, danger, warning, success, info. Each in light + dark.
- A 12-color categorical palette for person/source color-coding. Must be distinguishable on dark and light backgrounds for colorblind users.
- Typography: 5–6 tiers (display / h1 / h2 / body / small / micro). Micro tier (10–11px) must remain legible — used for badges and time labels.
- Spacing: 4-step or 8-step scale. Calendar grid rows are often at 24–30px row height — the spacing scale must support that without feeling wrong elsewhere.
- Radius: 3 steps (4 / 8 / 16). Calendar cells use the smallest.
- Shadow / elevation: 3 steps including "floating modal" and "sticky header" separately.

**Required components (atoms and molecules):**

- Button: primary / secondary / ghost / destructive, 3 sizes.
- Icon button (square, circular).
- Input: text, search, date, time, number, email.
- Select / dropdown (with search inside).
- Checkbox, toggle, radio, segmented control.
- Badge (source badge, sharing-level badge, status badge).
- Chip (person chip, activity-type chip).
- Tabs (settings, admin).
- Modal (center) + bottom sheet (mobile).
- Dropdown menu (anchored to trigger, keyboard-navigable).
- Toast / inline status banner (info / success / warn / error).
- Confirm dialog (destructive variant).
- Color swatch picker.
- Searchable combobox (activity type / project / customer / item — these are high-frequency).
- Skeleton loaders.
- Empty states.

**Required patterns:**

- Time grid (the calendar day/week view).
- Month grid.
- Person column header.
- Activity block (small, compact representation of an event).
- Activity block details popover.
- Form row (label left, control right) + stacked form row (mobile).
- Multi-select with search.
- Split-pane (month view with day detail on the side).

---

## 4. Screen catalog

The screens are grouped by surface. For each, the brief lists **purpose, key states, and any special design constraint**. Designer should produce desktop + mobile variants of every screen unless noted.

### 4.1 Authenticated calendar (the home of the product)

Single URL: `/cal`. Everything here happens in one shell — no hard page navigations.

**Shell frame**

- Top bar: logo / account switcher, view selector (1D / 3D / 5D / 7D / Month), date navigation (◀ ▶ Today + date label + date picker), person selector trigger, calendar-sources dropdown trigger, favorites dropdown, search (if any), settings icon, profile menu.
- Status strip (below top bar, collapses when idle): shows loading, error, stale-connection warnings. Example stale text: *"ERP Burti LT using cached data (connection unreachable)."* Needs a warning tone without being alarming.
- Main area: calendar grid or month view.
- Mobile: top bar collapses to a compact header with a bottom sheet for date navigation and view switching.

**Calendar grid (day / 3-day / 5-day / 7-day)**

- Person columns across, hours down. Rows typically 30-minute slots rendered compactly.
- Each activity block shows: time, title, activity-type chip, attendee count badge (if external), RSVP icon (if external and user is invited). Source is encoded via color and a tiny source mark.
- States to design: idle block, hover, selected, being-dragged, being-resized, optimistic-save (half-transparent), errored-save (red hairline).
- Current time indicator (horizontal line across columns) with the current time label.
- Holiday markers for days where a column's person has a public holiday — visible but not loud.
- Empty state when no people selected: prompt to pick people.
- Zoom toggle: 1× and 2× vertical density.

**Month view**

- 6×7 grid. Each cell shows up to ~4 activity chips + an overflow count.
- Side panel on desktop shows the selected day as a scaled-down day view.
- Mobile: cell tap opens a bottom-sheet day detail.
- Holiday cells have a subtle overlay and a tooltip with country name.
- Week header is clickable — selects that whole week (switches to 7-day view).

**Activity editor (modal on desktop, full-sheet on mobile)**

- Fields in this order: date, time from / to, primary person (required), activity type (searchable), project (searchable, ERP-linked), customer (searchable, ERP-linked), item (searchable, ERP-linked), description / notes, CC persons (multi-select), location (Outlook only), attendees (Outlook/Google), video provider (Teams / Meet / Zoom), RSVP status (external events).
- Footer actions: Save, Cancel, Duplicate, Delete. Save is default. Destructive actions confirm.
- Validation errors surface inline per field and as a summary banner.
- Keyboard: Ctrl/⌘+S save, Ctrl/⌘+Y duplicate, Esc close.
- Keep this screen dense — power users create 20+ of these a day. Don't pad.

**Person selector (modal)**

- Search by code or name. Multi-select with a visible running count.
- Each row: person code badge, full name, color dot.
- Selected rows show a checkmark and colored chip preview matching the grid color they'll get.

**Calendar sources dropdown**

- Groups: "Global" (ERP connections, Outlook), "Google" (workspace + per-user), "ICS" (per person), "Shared with me" (grouped by colleague).
- Each row: source color dot, label, sharing-level badge if applicable, visibility eye toggle.
- Show-all / Hide-all at the top.
- This is a critical discoverability surface — users commonly forget they hid a source and think things are broken. The "hidden count" indicator on the trigger button is important.

**Favorites dropdown + favorite detail**

- List of saved view presets. Each row shows view type (1D/3D/7D/month), person count, and share-link count.
- "Save current view as favorite" entry at the top with a naming input.
- Tapping a favorite applies it (restores view, persons, hidden sources).
- Per-favorite detail drawer: list of public share links for that favorite, with visibility level badge (busy / titles / full), expiry, access count, create-new-link form, delete controls.

**Account switcher**

- Modal. Keyboard-navigable list of accounts the user belongs to. Each row: logo or initials, name, current-marker.
- Hotkey: Ctrl/⌘+A.

**Keyboard shortcuts help**

- Modal with a compact two-column reference. Opened with `?`.

**Impersonation banner**

- When a super-admin is viewing as another user, a persistent amber strip across the top: "Viewing as <email> — <Exit>".

### 4.2 Settings (in-app modal)

`SettingsModal` — tabbed, user-level.

- **Style** — theme (Light / Dark / System) selector with previews.
- **Colors** — per-activity-class-group color overrides. A list of class groups, each with a color swatch. Designer should show the source-of-truth visual relationship between a class group color and how it renders on a calendar block (mini preview).
- **Integrations** — expandable sections per integration:
  - Google Workspace (per-user OAuth): account list, each with connected calendars (name, color override, sharing level). Add-account button opens OAuth.
  - Outlook: read-only status (configured globally in admin).
  - Zoom: connection status.
  - Calendly: personal-access-token input, template mapping dropdown.
  - ICS subscriptions: list of custom ICS feeds with name, URL, color, sharing level. Add / edit / delete.
- **Templates** — booking templates. List + detail editor. Template fields: name, duration, buffer, availability windows (day-of-week + time range, repeatable), ERP target fields, Outlook target toggle + online-meeting toggle + location, Google target toggle, Zoom toggle, custom form fields (label / type / required), holiday avoidance toggle.

Design the template editor as a form that can grow without getting messy — someone might have 8 availability windows and 6 custom fields.

### 4.3 Public surfaces

**Share link calendar** (`/share/[token]`)

- Looks like the authenticated calendar but read-only: no new/edit controls, no settings cog.
- Visibility level is enforced server-side but should be visible to the viewer as a subtle badge: "Showing: busy/available only" or "titles only" or "full details."
- Password gate: if the link is protected, first load is a centered password prompt — keep this tiny and non-threatening.
- If a booking template is attached, a prominent "Book a meeting" CTA appears in the header.

**Booking page** (`/book/[token]`)

- Standalone, not inside the calendar shell. Customer-facing — first impression matters.
- Layout: left (or top on mobile) shows template details — who you're booking, duration, maybe a short description. Right (or below) is a date picker, then a time slot list, then a form (name, email, any custom fields), then a Book button.
- Disabled / unavailable slots are shown grayed, not hidden — helps the viewer understand availability.
- Confirmation state: same URL, replace form with a success panel + cancel link + add-to-calendar buttons.
- Needs to feel legitimately businesslike. If it looks like a toy, bookings don't happen.

**Booking cancel** (`/booking/cancel/[cancelToken]`)

- Simple confirmation screen: "Cancel your booking for <title> on <date>?" with an optional reason field. After cancel, show a confirmation state.

**Landing** (`/landing`)

- Public marketing page. A single-page layout is fine. Sections: hero (what it is in one sentence), integrations (logos of the sources it connects), key features (3–5 with small illustrations or screenshots), sign-in CTA, docs link.
- Unlike the app, the landing page can breathe more — it's the only surface where marketing vibes are appropriate.

**Login** (`/login`)

- Email input, submit. Success state: "Check your inbox."
- Error states: invalid email, rate limited, unknown user (if policy allows the hint).

**Docs** (`/docs`, `/docs/getting-started`, `/docs/integrations`, `/docs/sharing`, `/docs/booking`, `/docs/admin`)

- Long-form content pages. Simple, readable typography. A left nav with the doc sections on desktop, collapsible on mobile. Code blocks formatted. Headers anchor-linkable.

### 4.4 Admin surfaces (`/admin/*`)

Everything under `/admin` shares a chrome — left sidebar (on desktop) with sections, content area on the right. On mobile the sidebar becomes a top drawer.

**Dashboard** (`/admin/dashboard`)

- Stats cards: Active members, Logins (30d), Created activities (30d), Edited activities (30d). Each card has a trend indicator.
- Recent logins table.
- Quick links to common admin tasks.

**Config** (`/admin/config`)

- The biggest admin screen. Sections (each collapsible):
  - Azure AD: tenant ID, client ID, sender email, Test button, Save.
  - SMTP (alternative to Azure for outbound email): host, port, username, password, sender email/name, TLS toggle, Test button.
  - Google Workspace: service account email, private key, admin email, domain, Test button.
  - Zoom: account ID, client ID, client secret.
  - Standard ERP connections: list of connections, each with a form (name, base URL, company code, OAuth vs basic auth, test, active toggle, delete). Add-connection button.
  - Activity color overrides (org-wide, per-connection matrix).
  - Holiday country (account default).

- A long scrollable form, lots of credentials. Needs clear section headers, helper text, and "Test connection" responses that are specific ("Fetched 42 calendars" / "Invalid client secret"). Inputs holding secrets should be masked by default with a reveal button.

**Members** (`/admin/members`)

- Duplicate candidates banner at top (collapsible). Each pair shows both rows and a Merge button.
- Search + Add-member + Sync-from-source buttons.
- Member table: code, name, email, source badges (ERP / Microsoft / Google / manual), role selector, last login, holiday country, status (active / inactive / orphan), delete.
- Orphan rows (person_codes without account_members) render with a "orphan" badge and no role toggle — designer should make these look like something that needs cleanup without looking broken.
- Row highlight when a pair is selected for merge.
- Merge confirmation modal: two sides ("Loses — deleted" / "Wins — kept") with a swap arrow between.
- Delete confirmation modal: shows reference counts (favorites, shared calendars, cached events) and offers cascade-delete if anything references the member.

**Accounts** (`/admin/accounts`, `/admin/accounts/[id]`) — super-admin only

- Account list: slug, name, logo, member count, suspended toggle.
- Create account form.
- Per-account detail page is essentially the Config screen scoped to that account.

**Tokens** (`/admin/tokens`)

- API token list: name, scope, created by / at, last used, expiry, status badge.
- Create-token form — after create, the token value is revealed once with a prominent copy button and a warning that it won't be shown again.
- Revoke action per row.

**Analytics** (`/admin/analytics`)

- Date range filters (from / to / preset chips like "Last 7 days", "Last 30 days").
- Group-by selector (day / week / month).
- Stacked bar chart timeline, one color per event type (login, activity_created, activity_edited, day_viewed, etc.).
- Top users table below.

**Cache** (`/admin/cache`)

- Sync status per source × connection. Each row: source name, last-sync timestamp, next-scheduled-sync, status badge (idle / syncing / error). When in error, show the error message expandably.
- Force-sync form: date range + Force button.
- Nuke form: date range OR "Clear all" checkbox, with a destructive-style confirmation.
- Feedback lane for action results ("Synced 241 events" / "Cleared 89 events").

### 4.5 Supporting UI

**Install prompt (mobile PWA)**

- Bottom banner on mobile browsers where the app is installable. Dismissible. Shouldn't block content.

**Offline state / service-worker status**

- When offline, show a thin top strip: "You're offline — calendar may be out of date." Normal browsing continues from cache.

**Error boundary fallback**

- Full-page error with "Reload" button and a small collapsible "Technical details" section for support.

---

## 5. Global interaction rules

- **Progressive rendering.** Calendar activities arrive from 3+ sources in parallel. Don't block the grid on the slowest source. Each source should fade in as its data loads, with a small per-source indicator in the sources dropdown showing it's still fetching.
- **Optimistic writes.** Create, move, and delete actions render instantly. On server failure, revert with a toast.
- **Keyboard parity.** Every action a mouse/touch user can do should have a keyboard path. Tab order must make sense. Focus rings must be visible (especially in dark mode where they often aren't).
- **Respect reduced motion.** No slide-in-from-right animations when `prefers-reduced-motion`.
- **No layout shift on data load.** Use skeletons or reserved space. The calendar grid height must be deterministic regardless of activity count per day.
- **Mobile gestures.** Swipe-down to close bottom sheets. Swipe-left/right to navigate dates in day view. These should feel native, not scripted.

---

## 6. Accessibility baseline

- Target WCAG 2.2 AA. Color contrast of 4.5:1 for text, 3:1 for UI boundaries — on both themes.
- Color is never the only signal. Activity sources have a color AND a shape/letter mark.
- Every interactive element has a non-default focus state.
- Modal focus traps + Escape to close.
- Form fields have visible labels (not placeholder-only).
- Chart colors in analytics must be distinguishable in grayscale.
- Activity density: even at 1× zoom, 30-min slots must remain readable at mobile widths (360px).

---

## 7. Deliverables expected from the designer

**Tier 1 — must have, before any code changes:**

1. Color tokens (light + dark) in a format we can import to Tailwind (CSS variables).
2. Typography scale with font stack + fallback.
3. Core component set (buttons, inputs, selects, badges, modals, bottom sheets) — designed in both themes.
4. Calendar grid (day view) with all block states.
5. Month view with side panel.
6. Activity editor modal.
7. Booking page (the most customer-facing surface).

**Tier 2 — full coverage:**

8. Settings modal all tabs.
9. All admin screens.
10. Share link calendar.
11. Person selector, calendar sources dropdown, favorites dropdown.
12. Status / error / stale / offline banners.
13. Empty states for every list view.

**Tier 3 — polish:**

14. Landing page.
15. Docs layout.
16. Login.
17. PWA install prompt, offline strip, error boundary.
18. Micro-interactions spec (hover, active, drag feedback, toast appearance).

Each deliverable should include desktop + mobile variants and both themes.

---

## 8. What the designer should explicitly NOT decide alone

Flag these for product input rather than choosing silently:

- Changing the information hierarchy of the activity block (what's shown inside a small event rectangle). This is load-bearing — operators read these at a glance all day.
- Hiding controls behind menus to "declutter." Every current top-bar control was added because it's used.
- Introducing a second brand color. The single warm-red-orange is deliberate.
- Removing the keyboard shortcuts help modal or the shortcuts it documents.
- Changing source color semantics (ERP ≠ Outlook ≠ Google by color convention).

---

## 9. Reference material

Existing code surfaces the designer may want to study:

- `components/CalendarShell.tsx` — the shell, view switching, source loading orchestration.
- `components/CalendarGrid.tsx` / `MonthView.tsx` — grid implementations, current density.
- `components/ActivityForm.tsx` — the most-used modal, complex field layout.
- `components/SettingsModal.tsx` — tabbed settings surface.
- `components/PersonSelector.tsx`, `components/CalendarSourcesDropdown.tsx`, `components/FavoritesDropdown.tsx` — secondary navigation.
- `app/admin/*` — every admin page.
- `app/share/[token]/page.tsx`, `app/book/[token]/page.tsx` — public surfaces.
- `lib/colors.ts` — current color palette for person/source coding.
- `app/globals.css` — current CSS variables.

---

## 10. Out of scope

- Server-rendered email templates (booking confirmations, magic-link emails). Design those separately when we get to transactional email.
- Admin "accounts" super-admin views beyond listing + toggling — deeper cross-tenant admin is deferred.
- Dark-only or light-only proposals. Both themes are first-class.
- Any redesign that would require schema changes (person_codes, tenant_accounts, account_members, etc.).
