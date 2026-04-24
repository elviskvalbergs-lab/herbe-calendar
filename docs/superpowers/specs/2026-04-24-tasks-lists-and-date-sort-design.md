# Tasks Sidebar — List Grouping + Date-Bucketed Sort

**Date:** 2026-04-24
**Scope:** UI-layer enhancement of the Tasks sidebar in the Calendar app.
**Status:** Design approved; ready for implementation plan.

## Goal

Two user-facing improvements to the Tasks sidebar:

1. **Surface the native "list" concept of each task source.** Outlook To Do lists, Google Tasks lists, and ERP connections are each a valid way users organize their tasks. Today the sidebar has source-level tabs (ERP / Outlook / Google) and list names appear only as a small pill per row — they don't group or filter anything.
2. **Order tasks by urgency.** Overdue first (red), today next (green), then no-date, then future. So the user can glance at the sidebar and see what needs attention.

## Non-Goals

- No changes to how tasks are fetched from ERP, Outlook, or Google.
- No changes to the `Task` data shape — `listName` and `sourceConnectionId` are already populated.
- No filter controls, search, or list-selection tabs. Grouping only.
- No date-bucket headers ("Overdue" / "Today" labels) inside lists. The pill colors carry the urgency signal.

## Current State

- **Data model** (`types/task.ts`): `Task` carries `listName?: string` (Outlook list display name / Google list title / ERP connection name) and `sourceConnectionId?: string` (ERP connection id).
- **Aggregator** (`app/api/tasks/route.ts`): returns a flat `Task[]` from all configured sources, unsorted.
- **Components:**
  - `TasksSidebar.tsx` — source-level tabs (All / ERP / Outlook / Google), error banners, loading spinner, scrolls `TasksList`.
  - `TasksList.tsx` — renders a `SourceSection` per source (or just one in a single-source tab). Each section has a header with source label + count + "+ New task" button, then open tasks, then a collapsible "N completed".
  - `TaskRow.tsx` — checkbox, title, small date pill (colored red via `.overdue` class when past), small list-name pill, action buttons. Left border uses the source brand color.

## Design

### Architecture

Purely UI/view layer. No changes to aggregators, source libs, or the `Task` shape. Two new pure helpers + updates to three presentational files + a small CSS addition.

### New helpers

**`lib/tasks/urgency.ts`** — pure classification and sort.

```ts
export type Urgency = 'overdue' | 'today' | 'none' | 'future'

export function classifyUrgency(
  dueDate: string | undefined,
  done: boolean,
  now: Date,
): Urgency
```

Rules:
- `done === true` → `'none'` (urgency is for open work only).
- no `dueDate` → `'none'`.
- `dueDate < todayISO` → `'overdue'`.
- `dueDate === todayISO` → `'today'`.
- `dueDate > todayISO` → `'future'`.

`todayISO` is `YYYY-MM-DD` derived from `now` in the browser's local timezone (not UTC — the current `isOverdue` in `TaskRow.tsx` uses UTC, which drifts; we fix that in passing since it falls out of the refactor).

```ts
export function urgencyRank(u: Urgency): 0 | 1 | 2 | 3
// overdue=0, today=1, none=2, future=3

export function compareForSidebar(a: Task, b: Task, now: Date): number
```

Sort order within a list:
1. By `urgencyRank(classifyUrgency(…))` ascending.
2. Tie-breaker by `dueDate` ascending (oldest overdue first; soonest future first).
3. For `'none'` (no date), tie-break by `title` ascending, case-insensitive.
4. Stable for equal keys.

**`lib/tasks/grouping.ts`** — pure grouping.

```ts
export interface ListGroup {
  /** null means suppress the list sub-header (single-list source). */
  listName: string | null
  tasks: Task[]
}

export interface SourceGroup {
  source: TaskSource
  lists: ListGroup[]
}

export function groupBySourceAndList(
  tasks: Task[],
  sources: TaskSource[],
  now: Date,
): SourceGroup[]
```

Behavior:
- Filters `tasks` to only those whose `source` is in `sources` **and where `done === false`** (done tasks are handled by the source-level "N completed" collapsible, not by grouping). Preserves order of `sources`.
- Within each source, groups by `listName` (treats `undefined`/empty as `"(untitled)"`).
- If a source ends up with exactly one distinct `listName` (including `"(untitled)"` as a single case), that group's `listName` is returned as `null` — signal to the renderer to skip the sub-header.
- List groups are ordered by `listName` ascending (locale-compare), except `"(untitled)"` sorts last.
- Within each list, tasks are sorted via `compareForSidebar`.
- A source with zero open tasks yields a `SourceGroup` with `lists: []` — the renderer shows "No open tasks." as it does today.

### Component changes

**`components/TasksList.tsx`**
- `SourceSection` computes its `SourceGroup` via `groupBySourceAndList(sourceTasks, [source], now)`. Open-task rendering is driven entirely off `sourceGroup.lists`.
- Completed tasks are derived separately with `sourceTasks.filter(t => t.done)` (grouping drops done tasks internally).
- Iterates `sourceGroup.lists`. For each `ListGroup`:
  - If `listName !== null`, render a sub-header: `<h4 class="task-list-hdr">{listName} <span>{openCount}</span></h4>`.
  - Render open tasks as `TaskRow`, passing `urgency={classifyUrgency(task.dueDate, task.done, now)}`.
- Empty state: if `sourceGroup.lists.length === 0`, render the existing `"No open tasks."`.
- The "N completed" collapsible stays at the source level (not per-list), rendered below all open groups.

**`components/TaskRow.tsx`**
- Accepts a new required prop: `urgency: Urgency`.
- Sets className to `task-row ${task.done ? 'done' : ''} urgency-${urgency}`.
- Deletes the local `isOverdue` function; the red pill now comes from the `.urgency-overdue .task-due` CSS rule.
- Keeps the source-color left border (no change).

**`components/TasksSidebar.tsx`**
- No behavioral change. Instantiates `const now = new Date()` on render and passes it through to `TasksList`. (Re-running on every render keeps "today" honest if the page stays open across midnight.)

### Visual treatment (CSS, `app/design.css`)

```css
/* Date pill — existing neutral treatment stays for 'none' and 'future'. */
.task-due { /* existing */ }

.urgency-overdue .task-due {
  background: var(--color-red-subtle);
  color: var(--color-red-strong);
}

.urgency-today .task-due {
  background: var(--color-green-subtle);
  color: var(--color-green-strong);
}

.task-list-hdr {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin: 0.75rem 0 0.25rem;
  padding-left: 0.25rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
```

Token names above are placeholders — during implementation we pick whichever red/green/muted variables already exist in `design.css` so we stay on-system. No new design tokens are introduced.

### Edge cases

- **Empty list:** omitted entirely (grouping helper drops lists with zero tasks).
- **ERP task with a missing connection name:** falls back to `"(untitled)"` as the list label so it doesn't silently merge into unlabeled rows.
- **"Today" crossing midnight while the page is open:** urgency is recomputed from a fresh `Date.now()` on every render. No timer. Acceptable latency — at worst the sidebar is a few minutes stale until the next render, which happens on any interaction.
- **Completed tasks:** not included in the open-tasks sort or grouping. They live in the existing source-level "N completed" collapsible, rendered flat in whatever order the aggregator returned them.
- **Single-source single-list:** no sub-header (e.g., user has one Outlook list called "Tasks" — we just show the tasks). Uniform with multi-source sections.

## Testing

Unit tests for the new pure helpers (no UI regressions visible from Vitest):

**`__tests__/lib/tasks/urgency.test.ts`**
- Table-driven over the rules, with a fixed `now = 2026-04-24T12:00:00`:
  - `done=true` always → `'none'`.
  - `dueDate` undefined → `'none'`.
  - `2026-04-23` → `'overdue'`.
  - `2026-04-24` → `'today'`.
  - `2026-04-25` → `'future'`.
- `urgencyRank` returns the fixed ordering.
- `compareForSidebar`:
  - Overdue before today before none before future.
  - Within overdue: oldest dueDate first.
  - Within future: soonest dueDate first.
  - Within none: title ascending, case-insensitive.
  - Stable for equal keys.

**`__tests__/lib/tasks/grouping.test.ts`**
- Source order follows the `sources` argument.
- Single distinct `listName` → `listName: null` in the group.
- Multiple `listName`s → sorted ascending, `"(untitled)"` last.
- Tasks with missing `listName` fall into `"(untitled)"`.
- Empty lists are dropped.
- Within each list, order matches `compareForSidebar` (spot-check, not a full re-test).

No new tests needed for the three source libs (`lib/outlook/tasks.ts`, `lib/google/tasks.ts`, `lib/herbe/taskRecordUtils.ts`) — they don't change.

## Files Touched

**New:**
- `lib/tasks/urgency.ts`
- `lib/tasks/grouping.ts`
- `__tests__/lib/tasks/urgency.test.ts`
- `__tests__/lib/tasks/grouping.test.ts`

**Modified:**
- `components/TasksList.tsx` — iterate list groups, render optional sub-headers.
- `components/TaskRow.tsx` — accept `urgency` prop, set class, drop local `isOverdue`.
- `components/TasksSidebar.tsx` — instantiate `now`, pass through.
- `app/design.css` — urgency pill colors + `.task-list-hdr` rule.

## Out of Scope (explicitly deferred)

- Date-bucket headers (`Overdue` / `Today` / `No date` / `Upcoming`) within lists.
- List-level tabs, filter dropdown, or per-list "+ New task".
- Per-user list-visibility preferences (hide noisy lists).
- Server-side sorting or urgency stamping.
- Recomputing `now` on a timer.
