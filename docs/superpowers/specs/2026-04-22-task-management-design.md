# Task management — v1 design

**Status:** Design locked, pending implementation plan.
**Date:** 2026-04-22.
**Topic:** Multi-source task sidebar integrated into the calendar.

## Overview

Add task management to herbe.calendar. Tasks from three sources (Standard ERP, Microsoft To Do, Google Tasks) are read, merged, and exposed through a new "Tasks" option in the existing right-panel toggle currently used for Day/Agenda. Users can complete, edit, create, and copy tasks to calendar events, all via the existing `ActivityForm` component in a simplified task mode.

The feature is strictly personal: the signed-in user sees only their own tasks.

## Scope

### In v1

- Sidebar/view on `/cal` available from the existing right-panel toggle — which becomes `Day | Agenda | Tasks`.
- Three sources:
  - **Standard ERP** — activities where `TodoFlag='1'`; `done` is derived from `OKFlag` (see "ERP semantics" below).
  - **Microsoft To Do** — Graph `/me/todo/lists` + default list's `/tasks`.
  - **Google Tasks** — Tasks API `tasklists` + default list's `tasks`.
- Strictly personal scope:
  - ERP tasks filtered to activities where the signed-in user's person code is in `MainPersons` or `CCPersons`.
  - Outlook/Google tasks are personal by API (requires per-user auth).
- Tabs inside the Tasks panel: `All / ERP / Outlook / Google`, **conditional on configured sources**.
  - "All" shows everything, grouped by source with per-section headers.
  - Source-specific tabs show a flat list of just that source.
- Task row:
  - Source color bar on the left edge (ERP = #00AEE7 high-sky, Outlook = #6264a7 Teams purple, Google = #4285f4 Google blue).
  - Checkbox (writes `done` back to source).
  - Title, due-date badge (if set; overdue highlighted rowanberry #CD4C38).
  - Meta line: ERP project/customer, Outlook list name, Google list title.
  - **Always-visible** action icons (touch-friendly): copy-to-event (→📅), edit (✎), more (⋯).
- Sections in "All" tab and source-specific tabs both include:
  - Section header with source chip + count + `+ New task` button (creates in that source).
  - "Show N completed" disclosure at the bottom of each section; default hidden.
- Create/edit/copy all use the existing `ActivityForm` in a **slim "task" mode** that hides calendar-event fields (time, attendees, Zoom, meeting link, planned flag). The form's existing source/destination picker remains fully functional.
- Data freshness: live fetch on panel open + manual refresh; DB-backed cache as a stale fallback when a source fails.

### Explicitly out of v1

- Drag-and-drop between tasks and calendar slots (future desktop-only feature).
- Kanban view.
- Team / other-people's tasks.
- Date-based task scheduling (promoting a task to a specific date/time directly, beyond the manual copy-to-event flow).
- Per-list picking for Outlook/Google (v1 uses each source's default list).
- Additional task sources (Jira, Todoist, etc.).

## UI

### Right-panel toggle

Existing segmented control (currently `Day | Agenda`, accidentally rendered in day/week views alongside month view) is extended to `Day | Agenda | Tasks`. The "1D" label is renamed to "Day" for clarity.

### Responsive behaviour

| Viewport | Mode | Behaviour |
|---|---|---|
| Desktop (≥ existing tablet breakpoint in `CalendarGrid.tsx`) | **α — right-pane** | Selecting Tasks opens a ~340px pane on the right; main calendar grid shrinks to fit. In month view, Tasks replaces the existing right panel (same slot as today's 1D/Agenda). |
| Mobile | **β — main swap** | Selecting Tasks replaces the full main area. Calendar is hidden while Tasks is active. |

Responsiveness is a rendering concern driven by the same `rightPanel` state. When the window resizes across the breakpoint while Tasks is active, state stays; the layout reflows.

### Tabs inside the Tasks panel

- Order: `All`, then configured sources in the order `ERP, Outlook, Google`. Future sources register via the same "is configured?" check and slot in automatically.
- **Conditional rendering** — only configured sources get a tab:
  - ERP — always shown (core integration for this account).
  - Outlook — shown if the signed-in user has an active Microsoft session with `Tasks.ReadWrite` consent.
  - Google — shown if the user has per-user OAuth with `https://www.googleapis.com/auth/tasks` scope.
- Tab labels show a small colored dot (matching source color) + name + count.
- Active tab persisted in a cookie (`tasksTab`), defaults to `all`.

### States

- **Empty (connected, no tasks)** — "No tasks in your default list." with `+ New task` centered.
- **Not configured** — source tab hidden; if the user selects a source tab via a linked URL or cookie that has since become unconfigured, falls back to `All`. Admin/Settings shows a "Re-connect to enable task sync" hint.
- **Stale (cache fallback)** — inline banner at the top of the affected section: "Couldn't load Outlook tasks — showing last known state. Retry" (with retry button).
- **Error (no cache)** — section shows "Couldn't load — retry"; other sources still render.

### Completed tasks

- Hidden by default per section.
- Disclosure row `▸ Show N completed` expands them inline; completed rows use strikethrough + moss-filled checkbox.

## Data layer

### Unified Task type (`types/task.ts`)

```ts
export type TaskSource = 'herbe' | 'outlook' | 'google'

export interface Task {
  id: string                          // source-prefixed: "herbe:12345", "outlook:AAMkAG...", "google:xyz"
  source: TaskSource
  sourceConnectionId?: string         // ERP: which connection (accounts can have multiple ERPs)
  title: string
  description?: string
  dueDate?: string                    // YYYY-MM-DD; undefined if no due date
  done: boolean
  listName?: string                   // Outlook: "Tasks"; Google: list title; ERP: project or customer label
  erp?: {
    activityTypeCode?: string
    projectCode?: string
    projectName?: string
    customerCode?: string
    customerName?: string
    textInMatrix?: string
  }
  sourceUrl?: string                  // deep link for "Open in source"
}
```

### Server-side fetchers

Three new modules mirroring `lib/sync/erp.ts`, `graph.ts`, `google.ts`:

- **`lib/sync/erp-tasks.ts`** — reuses `herbeFetchAll` on the `ActVc` register with a wide date range (today-2y to today+2y until date-filtering UI lands). Filter predicate: `TodoFlag === '1'`. Multi-connection aggregation same as `fetchErpActivities`. Maps via a sibling of `mapHerbeRecord` that sets `done = okFlag`.
- **`lib/sync/graph-tasks.ts`** — Graph `/me/todo/lists` → find `isDefault=true` list → `/me/todo/lists/{id}/tasks`. Uses the existing Graph client and user-token refresh path.
- **`lib/sync/google-tasks.ts`** — Google Tasks API `tasklists.list` → default list → `tasks.list`. Uses `lib/google/userOAuth.ts` with the added `auth/tasks` scope.

Each fetcher returns `{ tasks: Task[], stale: boolean, error?: string }` — same failure-tolerant shape as `fetchErpActivitiesForConnectionOrStale`.

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/tasks` | Aggregator — fetches all configured sources in parallel; returns `{ tasks: Task[], configured: { herbe, outlook, google }, errors: { source: TaskSource, stale: boolean, msg?: string }[] }`. |
| `PATCH` | `/api/tasks/{source}/{id}` | Toggle done OR edit title/description/due (unified body). |
| `POST` | `/api/tasks/{source}` | Create a new task in that source. |

ERP create/edit can also flow through the existing `POST /api/activities` and `PATCH /api/activities/{id}` with `todoFlag='1'`; the new `POST/PATCH /api/tasks/herbe/...` routes are thin wrappers that enforce `todoFlag='1'` and delegate.

### Database cache

New migration **`db/migrations/25_create_task_cache.sql`**:

```sql
CREATE TABLE cached_tasks (
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_email     TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('herbe', 'outlook', 'google')),
  connection_id  TEXT NOT NULL DEFAULT '',  -- ERP connection id; '' for Outlook/Google
  task_id        TEXT NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_email, source, connection_id, task_id)
);
CREATE INDEX idx_cached_tasks_lookup
  ON cached_tasks (account_id, user_email, source);
```

`lib/cache/tasks.ts` exposes `getCachedTasks`, `upsertCachedTasks` (full replace-per-source using delete-by-prefix + insert so orphaned rows disappear on refresh), and `pruneCachedTasks`.

Live-fetch strategy per source:

1. Attempt live fetch.
2. On success — upsert cache, return `{ tasks, stale: false }`.
3. On failure — read cache, return `{ tasks: cached, stale: cached.length > 0, error }`.

### OAuth scope requirements

- **Microsoft Graph** — existing scope list extended with `Tasks.ReadWrite`. Users re-consent on next login; tab stays hidden until consented. Admin connections dashboard surfaces a "Tasks sync available after re-connect" hint.
- **Google** — per-user OAuth scope list extended with `https://www.googleapis.com/auth/tasks`. Same re-consent pattern. Workspace service-account delegation is unrelated to tasks (tasks are personal) — no admin-level config change needed.

Both are pure additions, no breaking changes to existing calendar sync.

## State + action flows

### CalendarShell state

```ts
const [rightPanel, setRightPanel] = useState<'day' | 'agenda' | 'tasks'>(/* cookie */)
const [tasks, setTasks] = useState<Task[]>([])
const [taskSources, setTaskSources] = useState<{ herbe: boolean; outlook: boolean; google: boolean }>()
const [taskErrors, setTaskErrors] = useState<Partial<Record<TaskSource, { stale: boolean; msg?: string }>>>({})
```

Fetched via `GET /api/tasks` on mount + manual refresh. Mutations are optimistic with rollback on server error.

### Flows

- **Toggle done** — optimistic state flip → `PATCH /api/tasks/{source}/{id}` with `{ done }`. Server maps:
  - ERP: updates the activity record with `OKFlag='1'` (or `'0'` to uncomplete).
  - Outlook: PATCH `/me/todo/lists/{listId}/tasks/{id}` with `status: 'completed'` | `'notStarted'`.
  - Google: PATCH `tasks.tasks.update` with `status: 'completed'` | `'needsAction'`.
  - On 4xx/5xx, UI reverts and toasts.
- **Edit** — click row body (or ✎) → `ActivityForm` opens in slim task mode (fields: source picker disabled, title, description, due date, ERP-only type/project/customer). Save → `PATCH /api/tasks/{source}/{id}`.
- **Create** — `+ New task` in a source section → `ActivityForm` opens in task mode with that source **pre-selected but user-changeable**. Save → `POST /api/tasks/{source}` (or `POST /api/activities` with `todoFlag='1'` for ERP). Newly created task appended to state.
- **Copy task to calendar event** — `→📅` on a row → `ActivityForm` opens in normal event mode pre-filled from the task: title, description, due → date, source defaults to ERP (most common destination), picker user-changeable. Save creates a calendar event. Source task is untouched (this is a copy, not a convert).

### Sidebar open/close + tab state

- `rightPanel` defaults match current behaviour (`'agenda'` on month view, persisted on others).
- `tasksTab` cookie stores active tab within the Tasks panel.
- Both are cookies (same pattern as existing UI prefs).

## ERP semantics

Confirmed with user on 2026-04-22:

- ERP activity is a **calendar entry** when `TodoFlag = '0'` (or empty) — unchanged; matches existing `isCalendarRecord`.
- ERP activity is a **task** when `TodoFlag = '1'`.
- Task completion is tracked by `OKFlag`, independent of `TodoFlag`:
  - `OKFlag = '0'` (or empty) → open task.
  - `OKFlag = '1'` → done task.
- Completion (`OKFlag`) is orthogonal to the task/calendar flag (`TodoFlag`). Toggling a task's done state flips `OKFlag` only; `TodoFlag` stays `'1'`.
- Existing calendar-side semantics (a calendar record with `OKFlag = '1'` is treated as read-only) are unchanged.

A regression test enforces these invariants (see "Testing"). Any edge cases encountered during implementation — for example if `TodoFlag = '2'` turns up as an archived-done convention in live ERP data — are handled there and documented alongside the test, not pre-committed in this spec.

## Testing

New test files, matching existing Jest patterns:

- `__tests__/lib/sync/erp-tasks.test.ts` — fixture with mixed `TodoFlag` + `OKFlag` combinations:
  - `TodoFlag='0'` records must NOT appear in tasks (guard against accidental filter inversion; this test also runs the inverse — calendar fetcher must still return them).
  - `TodoFlag='1', OKFlag='0'` → `done: false`.
  - `TodoFlag='1', OKFlag='1'` → `done: true`.
  - Multi-connection aggregation; failure in one connection does not poison others; stale fallback returns cache.
- `__tests__/lib/sync/graph-tasks.test.ts` — mock Graph responses; verify default-list discovery; title/body/dueDateTime/status mapping; missing scope returns "not configured" rather than an error.
- `__tests__/lib/sync/google-tasks.test.ts` — analogous for Google Tasks API.
- `__tests__/lib/cache/tasks.test.ts` — upsert replaces prior per-source rows; stale read on failure.
- `__tests__/api/tasks/route.test.ts` — aggregator returns merged list + `configured` flags + per-source errors.
- `__tests__/api/tasks/[source]/[id]/route.test.ts` — PATCH writes the right field per source; POST creates in the right source.
- `__tests__/components/TasksSidebar.test.tsx` — tab rendering is conditional on `configured`; "All" tab sums counts; completed disclosure toggles.
- `__tests__/components/TaskRow.test.tsx` — checkbox fires `onToggleDone` with the correct id; action icons fire their handlers.

Per project convention, any bug discovered during implementation gains a regression test.

## Migration and rollout

### Migration

- `db/migrations/25_create_task_cache.sql` — creates `cached_tasks` and its lookup index.

### Rollout order

1. **Data layer only** — migration, cache module, `Task` type, three server fetchers, aggregator + mutation routes, tests. Lands independently with no UI change. Verifiable via API.
2. **UI** — extend right-panel toggle, new `TasksSidebar` / `TasksList` / `TaskRow` / `TaskEditForm` components, CalendarShell state integration, responsive layout (α/β).
3. **Scope expansion + hints** — add Microsoft `Tasks.ReadWrite` and Google `auth/tasks` scopes; admin/settings hint for re-consent.

Feature is visible to users only after step 2 ships. Step 3 can land either before or after step 2 — the UI degrades gracefully (tab hidden when scope missing).

## Deferred / phase 2

Called out here so the v1 design consciously supports them:

- **Drag-and-drop** between task rows and calendar slots (desktop-only; α layout already puts them side-by-side).
- **Kanban view** — a second presentation layer over the same `Task[]` data.
- **Date-based task scheduling** — UI for promoting a task to a calendar slot directly; or displaying tasks on their due dates in the calendar grid.
- **Team / others' tasks** — person picker expansion; meaningful for ERP (Outlook/Google are per-user).
- **Outlook/Google list picker** — per-user preference for which task list(s) to surface beyond default.
- **New task sources** — Jira, Todoist, etc. Registration follows the same "is configured?" pattern.

## References

- `lib/herbe/recordUtils.ts` — reference for ERP multi-connection fetcher with failure-tolerant fallback.
- `lib/cache/events.ts` — reference for cache table + upsert + stale-read patterns.
- `components/ActivityForm.tsx` — reused in slim task mode; its existing `onDuplicate` pattern is the mechanism for copy-to-event.
- `components/MonthView.tsx` — current `rightSide: 'agenda' | 'day'` state; extended to `'agenda' | 'day' | 'tasks'`.
- `components/CalendarShell.tsx` — owner of new task state and handlers.
