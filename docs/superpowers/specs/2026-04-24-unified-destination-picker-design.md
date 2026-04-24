# Unified Destination Picker — Design

**Date:** 2026-04-24
**Scope:** Replace the `ActivityForm` source-tab row and Google calendar sub-picker with a single destination dropdown that unifies all create-time target selection across task mode and event mode.
**Status:** Design approved; ready for implementation plan.

## Goal

Simplify create-time target selection in `ActivityForm`. Today the form has a row of source-tabs (`ERP-Burti | ERP-FlexBI | Outlook | Google`) plus — in event mode only — a Google calendar sub-picker. For task mode we also fell back to the "first account / default list" without user control, which produced the Google-Calendar-vs-Google-Tasks-list confusion (see prior fix `f857ee2`).

Replace both controls with one dropdown whose entries are full destinations — source + connection/calendar/list — grouped by source and color-coded. Remember the last successful choice per mode in `localStorage` and pre-select it on the next open.

## Non-Goals

- No server-side user preferences (deferred; localStorage is enough for now).
- No implicit mode-switching. `mode` stays anchored to how the form is opened; the dropdown only lists destinations valid for the current mode.
- No Settings UI. The dropdown is the sole surface for changing the default.
- No changes to the edit flow. Existing tasks/events still render with their original destination locked.
- No changes to the sidebar's source tabs (`TasksSidebar`) or the calendar shell's visibility toggles. Those are filtering concerns, not creation concerns.
- No new dependency (native `<select>`, no combobox library).

## Decisions

1. **Scope:** both event and task creation (B).
2. **Mode anchoring:** anchored at open time (A) — no morphing between modes inside the form.
3. **Default storage:** sticky `localStorage` (A) — no DB migration, no Settings UI.
4. **Default write policy:** the default is written *only on successful save*. Destinations the user picked but abandoned do not overwrite the remembered default.

## Current State

- `components/ActivityForm.tsx:1211–1242` — source-tab row. Renders one tab per ERP connection + conditional Outlook / Google tabs, gated on `availableSources.azure` / `availableSources.google` (the latter was widened in `f857ee2` for task mode with per-user OAuth).
- `components/ActivityForm.tsx:1232–1255` — Google calendar sub-picker. `isGoogleSource && mode !== 'task' && userGoogleAccounts?.length > 0` → `<select>` of calendars grouped by per-user OAuth account, writing `selectedGoogleCalendar` as `${accountId}:${calendarId}`, persisted via `localStorage.setItem('lastGoogleCalendar', ...)`.
- `source` state holds the active source as one of `'herbe' | 'outlook' | 'google' | <erp-connection-id>`. Several downstream derivations: `isGoogleSource`, `isExternalCalSource`, conditional ERP-field rendering.
- ERP-only form fields (activity type, project, customer, CC persons) show only when the source is an ERP connection. Switching away from ERP leaves those state values in place (they're simply not rendered).
- Data fetching today: `userGoogleAccounts` is loaded once in `CalendarShell` from `GET /api/google/calendars`. ERP connections come bundled with `GET /api/users`. Outlook To Do lists are not pre-fetched for form use; `createOutlookTask` resolves "default list" at POST time.

## Design

### 1. Destination identity

Destinations are fully specified by one string key used in `<option value="…">` and in `localStorage`:

**Task mode:**
- `herbe:<connectionId>`
- `outlook:<listId>`
- `google:<tokenId>:<listId>`

**Event mode:**
- `herbe:<connectionId>`
- `outlook` — only one Outlook calendar per user in this app, no sub-id needed
- `google:<tokenId>:<calendarId>`

The key is the sole stable identity; the `label`, `color`, and `meta` are presentation.

### 2. `Destination` type

In `lib/destinations/types.ts`:

```ts
export type DestinationMode = 'task' | 'event'
export type DestinationSource = 'herbe' | 'outlook' | 'google'

export interface Destination {
  key: string            // parseable by parseDestinationKey
  source: DestinationSource
  label: string          // e.g. "Burti" or "Work"
  sourceLabel: string    // e.g. "ERP" | "Outlook" | "Google"
  color: string          // hex; brand color or per-calendar override
  meta:
    | { kind: 'herbe'; connectionId: string; connectionName: string }
    | { kind: 'outlook-task'; listId: string; listName: string }
    | { kind: 'outlook-event' }
    | { kind: 'google-task';  tokenId: string; listId: string; listName: string; email: string }
    | { kind: 'google-event'; tokenId: string; calendarId: string; calendarName: string; email: string }
}
```

Helpers in `lib/destinations/keys.ts`:

```ts
export function makeKey(d: Destination): string
export function parseDestinationKey(key: string): { source: DestinationSource; parts: string[] }
```

### 3. Data fetching — two read-only endpoints

**`GET /api/destinations?mode=task`** — returns `Destination[]` where every entry's meta.kind is one of `herbe | outlook-task | google-task`.

**`GET /api/destinations?mode=event`** — returns `Destination[]` where every entry's meta.kind is one of `herbe | outlook-event | google-event`.

Handler composition in `app/api/destinations/route.ts`:

- ERP: `getErpConnections(accountId)` → one entry per connection.
- Outlook (task mode): list the user's Microsoft To Do lists via Graph (`/users/{email}/todo/lists`). Cache per-request only.
- Outlook (event mode): if workspace `azureConfig` is present, one entry `outlook`.
- Google: `getUserGoogleAccounts(email, accountId)` → for each account, fetch either that account's task lists (`/users/@me/lists` on the Tasks API) or its enabled calendars. One entry per list/calendar.

Graceful degradation: if a source errors out, its entries are omitted from the response. No per-source stale flags; the form falls back to "no destinations from that source this session" rather than blocking.

`Cache-Control: no-store` — destinations reflect live config.

### 4. `DestinationPicker` component

`components/DestinationPicker.tsx`:

```tsx
interface Props {
  mode: DestinationMode
  value: string | null             // destination key
  onChange: (dest: Destination) => void
}
```

Behavior:
- On mount, `GET /api/destinations?mode={mode}` and populate the dropdown.
- Renders a native `<select>` with `<optgroup label="ERP" | "Outlook" | "Google">` per source; options ordered by source then by `label`.
- Each `<option>` includes a CSS `background-color: <dest.color>` as a thin leading stripe (via a `:before` pseudo on the option wrapper, or a `<span>` inside). Where the OS ignores option styling, the grouping + prefixing still carries the distinction.
- Source label prefix on the option text: `ERP · Burti`, `Outlook · Tasks`, `Google · Work (elvis@…)`. Email is appended only when the user has multiple Google accounts.
- Empty state: if the endpoint returns `[]`, renders a disabled `<select>` with text "No destinations configured".
- Loading state: shows the label "Loading destinations…" until the fetch resolves. Form save is disabled until the picker has a resolved selection.

### 5. Field-sync on destination change — the critical piece

`ActivityForm` owns a single `destination: Destination | null` state. The existing `source` state is removed; `isGoogleSource` / `isExternalCalSource` become `destination?.source === 'google'` / `destination && destination.source !== 'herbe'`.

ERP-only field retention uses a ref:

```ts
const parkedErpFields = useRef({
  activityTypeCode: '',
  projectCode: '',
  customerCode: '',
  ccPersons: [] as string[],
})

useEffect(() => {
  if (!destination) return
  if (destination.source === 'herbe') {
    // Restore parked values.
    setActivityTypeCode(parkedErpFields.current.activityTypeCode)
    setProjectCode(parkedErpFields.current.projectCode)
    setCustomerCode(parkedErpFields.current.customerCode)
    setCcPersons(parkedErpFields.current.ccPersons)
  } else {
    // Park current values before they disappear from the DOM.
    parkedErpFields.current = {
      activityTypeCode, projectCode, customerCode, ccPersons,
    }
  }
}, [destination?.key])  // intentional: fire only on destination change
```

Implications:
- Values are **not cleared** when switching away from ERP — they stay parked for restore.
- Submission strips ERP-only values from the POST body whenever `destination.source !== 'herbe'`. The UI doesn't need to clear them.
- First-open with localStorage-resolved ERP default: the mount flow sets `destination`, the effect fires, `parkedErpFields` is still the initial zero values, so nothing to restore. Behavior matches "opened fresh on ERP".
- First-open with non-ERP default: ERP fields are hidden; parked values are the initial zero values. If the user switches to ERP, they get empty ERP fields — correct.

### 6. LocalStorage defaults

Two keys:
- `defaultDestination:task`
- `defaultDestination:event`

**Read** (form mount):
1. After `DestinationPicker` resolves `destinations`, read `localStorage.getItem('defaultDestination:' + mode)`.
2. Find the destination whose `key` matches. If found, set as initial `destination`.
3. If not found (key invalid / destinations list stale), set `destinations[0]` as initial `destination`.
4. If `destinations` is empty, `destination` stays `null` and save is disabled.

**Write:**
- On successful save, `localStorage.setItem('defaultDestination:' + mode, destination.key)`.
- Not on every dropdown change — a user who experimentally picks "Outlook · Shopping" then cancels should not overwrite their real default.

Legacy `lastGoogleCalendar` key is left untouched (it's no longer read; harmless to leave for now).

### 7. Removals

- `ActivityForm.tsx:1211–1242` — entire source-tab row.
- `ActivityForm.tsx:1232–1255` — Google calendar sub-picker (obsolete — `DestinationPicker` covers it).
- `availableSources` prop on `ActivityForm` and the places that compute it in `CalendarShell`. Destination availability comes from the endpoint response.
- `source` state + `setSource` setter. Everywhere `source` was read becomes `destination?.source` or a meta read.
- The special-case passing of `userGoogleAccounts` into `ActivityForm` for use in the calendar picker — the picker is gone. The prop still flows for event creation logic elsewhere (`selectedGoogleCalendar` → `googleCalendarId` in the POST body), but that wiring is re-routed: now it reads from `destination.meta` when `meta.kind === 'google-event'`.

### 8. POST plumbing

No server-side shape changes for existing routes. The form just starts sending the right fields based on `destination.meta`:

- ERP event: POST `/api/activities` with the existing body plus `connectionId = destination.meta.connectionId`.
- ERP task: POST `/api/tasks/herbe` with `connectionId = destination.meta.connectionId` (unchanged).
- Outlook event: POST `/api/outlook` (unchanged — one calendar per user).
- Outlook task: POST `/api/tasks/outlook`. **New field** `listId = destination.meta.listId` in the request body; `CreateBody` in `app/api/tasks/[source]/route.ts` gets `listId?: string` and the Outlook branch passes it to `createOutlookTask`. `createOutlookTask` gains an optional `listId` arg that, if set, skips `resolveDefaultListId()`.
- Google event: POST `/api/google` with `googleTokenId = destination.meta.tokenId`, `googleCalendarId = destination.meta.calendarId`.
- Google task: POST `/api/tasks/google`. **New fields** `googleTokenId` + `googleListId`; `createGoogleTask` gains matching args and uses them to choose list instead of always calling `resolveDefaultGoogleListId()`.

These are additive — absence of the new fields keeps the current "default list" behavior, so older clients keep working during rollout.

### 9. Component interface changes

```diff
- export function ActivityForm(props: {
-   availableSources?: { herbe: boolean; azure: boolean; google?: boolean }
-   userGoogleAccounts?: UserGoogleAccount[]
-   ...
- })

+ export function ActivityForm(props: {
+   // availableSources removed
+   // userGoogleAccounts removed (absorbed by DestinationPicker)
+   ...
+ })
```

`CalendarShell.tsx:1175` drops the `availableSources={sources}` and `userGoogleAccounts={userGoogleAccounts}` props on the form render.

### 10. Edit flow

When `isEdit === true`, the `DestinationPicker` is **not rendered**. Instead a static read-only label shows `{sourceLabel} · {listName or connectionName}`, derived from whatever fields `initial` carries (`source`, `sourceConnectionId`, `listName`). This sidesteps a real resolution issue: `Task` stores `listName` but not `listId`, and trying to reconstruct the exact destination key by fuzzy name-matching would be brittle.

Changing the destination of an existing task or event is out of scope for FU-D. Deferred: move-via-recreate for Outlook tasks (requires the Outlook list-move sub-feature explicitly punted earlier in the conversation).

## Testing

**Handler tests — `__tests__/app/api/destinations.test.ts`:**
- Task mode: returns ERP connections, Outlook To Do lists, Google Tasks lists; fails gracefully when one source errors.
- Event mode: returns ERP connections, Outlook entry if azureConfig present, Google calendars.
- Each response entry has the correct `meta.kind` and `key` derivable via `parseDestinationKey`.

**Component tests — `__tests__/components/DestinationPicker.test.tsx`:**
- Renders one optgroup per source with non-empty results.
- Calls `onChange` with the parsed `Destination` on user selection.
- Disabled empty state on empty payload.

**Form tests — `__tests__/components/ActivityForm.destination.test.tsx`:**
- Parked ERP values: type activity type + project → switch destination to Outlook → switch back to ERP → fields restored.
- Submission strips ERP fields when destination is not ERP: mock `fetch`, assert POST body has no `activityTypeCode` / `projectCode` when destination is Outlook.
- Mount with localStorage key pointing to a deleted destination: falls back to `destinations[0]`.
- Successful save writes `defaultDestination:task` (or `:event`) to localStorage.
- Abandoned change (user picks different destination then cancels) does not overwrite the localStorage default.

**Files `__tests__/lib/destinations/*`:**
- `keys.test.ts` — round-trip `makeKey` / `parseDestinationKey` for all six meta kinds + rejects malformed keys.

## Files Touched

**New:**
- `lib/destinations/types.ts`
- `lib/destinations/keys.ts`
- `app/api/destinations/route.ts`
- `components/DestinationPicker.tsx`
- `__tests__/lib/destinations/keys.test.ts`
- `__tests__/app/api/destinations.test.ts`
- `__tests__/components/DestinationPicker.test.tsx`
- `__tests__/components/ActivityForm.destination.test.tsx`

**Modified:**
- `components/ActivityForm.tsx` — replaces source-tab row + Google sub-picker with `<DestinationPicker>`; removes `source` state; adds `destination` state; wires the parked-ERP-fields effect; reads/writes localStorage default; submission body uses `destination.meta`.
- `components/CalendarShell.tsx` — drops `availableSources` and `userGoogleAccounts` props on `ActivityForm`.
- `app/api/tasks/[source]/route.ts` — `CreateBody` gains `listId?`, `googleTokenId?`, `googleListId?`; Outlook branch passes `listId` to `createOutlookTask`; Google branch passes `googleTokenId` + `googleListId` to `createGoogleTask`.
- `lib/outlook/tasks.ts` — `createOutlookTask` gains optional `listId` argument; when present, skips `resolveDefaultListId()`.
- `lib/google/tasks.ts` — `createGoogleTask` gains optional `listId` + `tokenId` arguments; when present, uses them instead of first-account + default-list fallbacks.
- `app/design.css` — minor rules for `DestinationPicker` visual: the leading color dot / stripe and the `<select>` spacing.

## Out of Scope (deferred)

- Server-side user preferences for defaults.
- Move/reparent existing tasks/events between destinations (including Outlook delete+recreate).
- Multi-Google-account UX for events (current fallback: list all calendars across accounts, prefix with email when >1 account).
- Search/filter inside the dropdown (native `<select>` is enough for the current destination counts).
- Color overrides on Outlook/ERP destinations (not currently user-configurable; only Google calendar overrides exist today).
- Telemetry for which destinations users pick.
