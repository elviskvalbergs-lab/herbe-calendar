# CC Persons, Logoff, Teams Button, RSVP & Read-only Lock — Design Spec

Date: 2026-03-24

---

## 1. CC Persons on Activities

### Data model

Add to `Activity` interface in `types/index.ts`:
```ts
ccPersons?: string[]   // from Herbe CCPersons field
```

### API — GET (server side)

`app/api/activities/route.ts` `mapActivity()` currently emits one row per entry in `MainPersons`. Extend it to also emit rows for each entry in `CCPersons` (if not already in `MainPersons`). For CC-emitted rows set `personCode` to the CC person's code (so the existing `CalendarGrid` filter `a.personCode === person.code` works unchanged) and set `ccPersons` to the full list parsed from `CCPersons`.

**Priority rule:** if a person appears in both `MainPersons` and `CCPersons`, they are emitted only once as a main person. The CC row is not emitted for them. Main always wins.

### API — POST / PATCH

`buildHerbePayload()` in `ActivityForm.tsx`:
```ts
CCPersons: selectedCCPersonCodes.length > 0
  ? selectedCCPersonCodes.join(',')
  : ''   // send empty string to clear — do NOT use || undefined
```
`toHerbeForm()` currently filters out empty strings (`v !== ''`). To allow clearing CC persons, add an `allowEmptyFields` parameter:
```ts
function toHerbeForm(data: Record<string, unknown>, allowEmptyFields: Set<string> = new Set()): string
```
Pass `new Set(['CCPersons'])` at the POST/PATCH call sites. Inside the filter, change:
```ts
.filter(([k, v]) => v !== undefined && v !== null && (v !== '' || allowEmptyFields.has(k)))
```
This is a targeted change that does not affect any existing fields.

### API — PUT / DELETE canEdit (server side)

`app/api/activities/[id]/route.ts` server-side `canEdit` must also check `CCPersons`. Fetch `CCPersons` from the Herbe record in the same way `MainPersons` and `AccessGroup` are fetched, then include `ccPersonsList.includes(sessionUserCode)` in the OR chain.

### CalendarGrid display

`CalendarGrid.tsx` filter is already `a.personCode === person.code` — no change needed because CC rows have `personCode` set to the CC viewer's code (see API section above).

The `isCC` flag for rendering: `const isCC = activity.ccPersons?.includes(person.code) && !activity.mainPersons?.includes(person.code)` — pass this as a prop to `ActivityBlock`.

### ActivityBlock visual — CC variant

When `isCC === true`:
- Background: `repeating-linear-gradient(135deg, color+'0a', color+'0a' 4px, transparent 4px, transparent 8px)`
- Left border: `2px solid color` at ~55% opacity
- Text opacity: ~60%
- No prefix symbol (actual uses `●`, planned uses `○`, CC has none)

**Persons row on all blocks** (shown below the time, when `mainPersons` or `ccPersons` are present):
- Main persons: filled red pill — `background: color+'33'`, white text
- CC persons: `border: 1px dashed color+'99'`, `color: color` at 80% opacity
- Limit total shown to 3 pips, `+N` overflow

### ActivityForm — CC Person(s) section

**Placement:** Directly below the existing `Person(s)` section.

**Label:** `CC Person(s)` — plain, no badge.

**State:** `selectedCCPersonCodes: string[]`, independent of `selectedPersonCodes`.

**Pill styles:**
- CC-selected: `border: 1px dashed var(--primary)`, `background: rgba(primary, 0.1)`, `color: var(--primary)` at 75% opacity
- Unselected (available to add): same as main persons `pill-unselected`
- `+N more` / Collapse mechanic identical to Person(s)

**Recent CC persons:** `localStorage` key `recentCCPersons`, max 6, front-merge (prepend new codes, deduplicate, slice to 6). Save on successful create/update. Do not save if `selectedCCPersonCodes` is empty (no-op, same behaviour as `saveRecentPersons`).

**Dirty detection:** Include `selectedCCPersonCodes` in `initialValuesRef`. Compare using sorted arrays (same pattern as `selectedPersonCodes` comparison in the existing dirty check).

**Edit mode init:** `initial.ccPersons ?? []`.

### canEdit at call sites (PersonColumn, CalendarShell)

`PersonColumn.canEdit()` currently checks `personCode === userCode || mainPersons.includes(userCode) || accessGroup.includes(userCode)`. Add: `|| activity.ccPersons?.includes(userCode)`. This drives the `canEdit` prop passed into `ActivityForm` from every call site consistently.

### Auto-start time exclusion

`smartDefaultStart()` in `ActivityForm.tsx` currently filters today's activities for `mainPersons?.includes(defaultPersonCode) || personCode === defaultPersonCode`. This is already correct — CC-only activities (where `defaultPersonCode` is NOT in `mainPersons`) are naturally excluded. No code change needed. `defaultPersonCode` is used (not `sessionUserCode`) because the form may be opened for a different person's column.

---

## 2. Logoff Button

**Desktop:** Replace the standalone refresh `↻` button in `CalendarHeader.tsx` with a logoff button (`Sign out` label or exit icon). The user confirmed this is intentional — refresh is already accessible via the hamburger/palette menu, so the dedicated desktop button is redundant. Note: the hamburger is `lg:hidden`, so on desktop (`≥1024px`) refresh is accessible via the inline desktop buttons area (the existing color/keyboard/new buttons). A refresh option should be verified present there before the standalone refresh button is removed.

**Mobile:** Add `Sign out` as a menu item in the hamburger dropdown (below existing Color settings and Keyboard shortcuts).

**Implementation:** `signOut()` from `next-auth/react`. No confirmation dialog.

---

## 3. "Open in Teams" Button (replacing raw joinUrl)

The raw `joinUrl` currently overflows in the form header and activity block tooltip. Replace all raw URL displays with a styled button.

**Button style:** Match the existing Teams purple button (`bg-[#464EB8]` white text) already used on the post-save success screen.

**Label:** `Open in Teams` with a Teams icon or video icon.

**Placement:**
- `ActivityForm`: where the raw link currently appears (below the description, above form fields) — only when `initial?.joinUrl` exists
- `ActivityBlock` hover card: replace the raw link text with the styled button

**Existing inline "Join" chip on the block face** (`ActivityBlock.tsx` lines 47–58): retain as-is — it is small and non-intrusive. The hover card gets the full `Open in Teams` button.

**Gating:** Render on `joinUrl` presence regardless of `source` — if a Herbe activity somehow has a `joinUrl`, the button appears there too.

**Deep link behaviour:** `window.open(joinUrl, '_blank')` — Teams intercepts `https://teams.microsoft.com/...` URLs and opens the Teams app directly on supported platforms. No special API needed.

---

## 4. RSVP for Outlook Events (Accept / Decline / Tentative)

### Feasibility

Microsoft Graph supports event RSVP via:
- `POST /users/{email}/events/{id}/accept` — body: `{ "sendResponse": true }`
- `POST /users/{email}/events/{id}/decline` — same
- `POST /users/{email}/events/{id}/tentativelyAccept` — same

All three use the existing `graphFetch` helper and the user's email from session. Supported for events where the user is an invitee (not just the organizer).

### Current response status

The Outlook event object returned by Graph includes `responseStatus: { response: 'accepted'|'declined'|'tentativelyAccepted'|'notResponded'|'organizer', time: string }`. Map this to the `Activity` type as `rsvpStatus?: string`.

### UI

**Placement in ActivityForm:** Below the `Open in Teams` button (Outlook events only).

**Three buttons — matching the screenshot style:**
```
✓ Accept    ✗ Decline    ? Tentative
```
- Accept: green tint (`border-green-600`, `text-green-400` when active)
- Decline: red tint (`border-red-600`, `text-red-400` when active)
- Tentative: purple tint (`border-purple-500`, `text-purple-400` when active)
- The current `rsvpStatus` is highlighted; others are outline/muted

**Behaviour:** Clicking a button calls a new API route `POST /api/outlook/[id]/rsvp` with `{ action: 'accept'|'decline'|'tentativelyAccept' }`. The route calls Graph. On success, update `rsvpStatus` in local state. No full calendar reload needed.

**Show when:** `source === 'outlook'` AND `rsvpStatus !== 'organizer'` (organizer does not RSVP to their own event).

### New API route

`app/api/outlook/[id]/rsvp/route.ts` — POST handler:
```ts
const VALID_ACTIONS = new Set(['accept', 'decline', 'tentativelyAccept'])
const { action } = await req.json()
if (!VALID_ACTIONS.has(action)) return NextResponse.json({ error: 'invalid action' }, { status: 400 })
// email MUST come from session, never from request body
const email = session.email
await graphFetch(`/users/${email}/events/${id}/${action}`, {
  method: 'POST',
  body: JSON.stringify({ sendResponse: true }),
})
```
Requires session auth (same as existing Outlook routes). `id` comes from the URL param.

### Data model addition
```ts
rsvpStatus?: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'organizer'
```
Mapped from `responseStatus.response` in `app/api/outlook/route.ts`.

---

## 5. Read-only Lock When Edit Not Permitted

**Rule:** An activity is read-only for the current user if `canEdit === false` (as computed by the updated `PersonColumn.canEdit()` — which now includes CC persons).

**UI when read-only:**
- All form inputs: `disabled` / `readOnly`
- Banner at top of form body: `"View only — you are not a participant in this activity"`
- Save button: hidden (not disabled with tooltip — just absent to avoid confusion)
- Form remains openable for viewing

**Note:** The `canEdit` prop already flows into `ActivityForm`. The form just needs to consume it to apply locked state, which it currently does not do.

---

## Out of scope

- Filtering/hiding CC activities from calendar view
- CC persons on Outlook events (Outlook has its own attendee model)
- RSVP on Herbe activities
- Sending email on RSVP (`sendResponse: false` is also acceptable if desired — out of scope for now, hardcode `true`)
