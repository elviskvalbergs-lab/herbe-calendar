# Tasks Sidebar — List Grouping + Urgency Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group tasks in the sidebar by their source's native list concept, and sort open tasks by urgency (overdue → today → no-date → future) with red/green pills on the date badge.

**Architecture:** Purely UI-layer change. Two new pure helpers (`lib/tasks/urgency.ts`, `lib/tasks/grouping.ts`) drive grouping and sort in the existing `TasksList` / `TaskRow` components. No changes to the aggregator or source libs — `Task.listName` is already populated by all three sources.

**Tech Stack:** TypeScript, React (client components), Jest + ts-jest (not Vitest — this codebase uses Jest; see `jest.config.ts`). Run tests with `npm test`.

**Spec:** `docs/superpowers/specs/2026-04-24-tasks-lists-and-date-sort-design.md`

---

## File Structure

**New:**
- `lib/tasks/urgency.ts` — `Urgency` type, `classifyUrgency()`, `urgencyRank()`, `compareForSidebar()`.
- `lib/tasks/grouping.ts` — `ListGroup`, `SourceGroup` types, `groupBySourceAndList()`.
- `__tests__/lib/tasks/urgency.test.ts` — classification + comparator tests.
- `__tests__/lib/tasks/grouping.test.ts` — source/list grouping tests.

**Modified:**
- `components/TaskRow.tsx` — accept `urgency: Urgency` prop; drop local `isOverdue`; className becomes `task-row ${done ? 'done' : ''} urgency-${urgency}`.
- `components/TasksList.tsx` — `SourceSection` drives rendering off `groupBySourceAndList`; renders list sub-headers conditionally; passes computed urgency to each `TaskRow`. Accepts `now: Date` prop.
- `components/TasksSidebar.tsx` — instantiate `const now = new Date()` on render, pass to `TasksList`.
- `app/design.css` — replace `.task-due.overdue` with `.urgency-overdue .task-due`; add `.urgency-today .task-due`; add `.task-list-hdr`.

---

### Task 1: `classifyUrgency` — pure classifier

**Files:**
- Create: `lib/tasks/urgency.ts`
- Test: `__tests__/lib/tasks/urgency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/tasks/urgency.test.ts`:

```typescript
import { classifyUrgency } from '@/lib/tasks/urgency'

// Fixed "now" at local noon on 2026-04-24.
const NOW = new Date(2026, 3, 24, 12, 0, 0)

describe('classifyUrgency', () => {
  it('returns "none" when task is done (regardless of date)', () => {
    expect(classifyUrgency('2026-04-22', true, NOW)).toBe('none')
    expect(classifyUrgency(undefined, true, NOW)).toBe('none')
    expect(classifyUrgency('2026-04-30', true, NOW)).toBe('none')
  })

  it('returns "none" when there is no due date', () => {
    expect(classifyUrgency(undefined, false, NOW)).toBe('none')
  })

  it('returns "overdue" when due date is before today (local)', () => {
    expect(classifyUrgency('2026-04-23', false, NOW)).toBe('overdue')
    expect(classifyUrgency('2025-12-01', false, NOW)).toBe('overdue')
  })

  it('returns "today" when due date matches today (local)', () => {
    expect(classifyUrgency('2026-04-24', false, NOW)).toBe('today')
  })

  it('returns "future" when due date is after today (local)', () => {
    expect(classifyUrgency('2026-04-25', false, NOW)).toBe('future')
    expect(classifyUrgency('2027-01-01', false, NOW)).toBe('future')
  })

  it('uses local timezone for "today", not UTC', () => {
    // Local midnight on 2026-04-24 is still "2026-04-24" locally; a task due
    // that date must not read as "future" because UTC has already ticked over.
    const localMidnight = new Date(2026, 3, 24, 0, 0, 0)
    expect(classifyUrgency('2026-04-24', false, localMidnight)).toBe('today')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/tasks/urgency.test.ts`
Expected: FAIL with `Cannot find module '@/lib/tasks/urgency'`.

- [ ] **Step 3: Implement `classifyUrgency`**

Create `lib/tasks/urgency.ts`:

```typescript
export type Urgency = 'overdue' | 'today' | 'none' | 'future'

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function classifyUrgency(
  dueDate: string | undefined,
  done: boolean,
  now: Date,
): Urgency {
  if (done) return 'none'
  if (!dueDate) return 'none'
  const today = localISO(now)
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'future'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/tasks/urgency.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/urgency.ts __tests__/lib/tasks/urgency.test.ts
git commit -m "feat(tasks): classifyUrgency — overdue/today/none/future classifier"
```

---

### Task 2: `urgencyRank` + `compareForSidebar` — comparator

**Files:**
- Modify: `lib/tasks/urgency.ts`
- Modify: `__tests__/lib/tasks/urgency.test.ts`

- [ ] **Step 1: Add failing tests for the comparator**

Append to `__tests__/lib/tasks/urgency.test.ts`:

```typescript
import { urgencyRank, compareForSidebar } from '@/lib/tasks/urgency'
import type { Task } from '@/types/task'

function t(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'herbe:x',
    source: overrides.source ?? 'herbe',
    title: overrides.title ?? 'Task',
    done: overrides.done ?? false,
    dueDate: overrides.dueDate,
    listName: overrides.listName,
  }
}

describe('urgencyRank', () => {
  it('orders overdue < today < none < future', () => {
    expect(urgencyRank('overdue')).toBe(0)
    expect(urgencyRank('today')).toBe(1)
    expect(urgencyRank('none')).toBe(2)
    expect(urgencyRank('future')).toBe(3)
  })
})

describe('compareForSidebar', () => {
  const NOW = new Date(2026, 3, 24, 12, 0, 0)

  it('sorts by urgency bucket first', () => {
    const overdue = t({ id: '1', dueDate: '2026-04-20' })
    const today = t({ id: '2', dueDate: '2026-04-24' })
    const none = t({ id: '3', dueDate: undefined })
    const future = t({ id: '4', dueDate: '2026-05-01' })
    const sorted = [future, none, today, overdue].sort((a, b) => compareForSidebar(a, b, NOW))
    expect(sorted.map(x => x.id)).toEqual(['1', '2', '3', '4'])
  })

  it('within overdue: oldest dueDate first', () => {
    const a = t({ id: 'a', dueDate: '2026-04-10' })
    const b = t({ id: 'b', dueDate: '2026-04-22' })
    const sorted = [b, a].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('within future: soonest dueDate first', () => {
    const soon = t({ id: 'soon', dueDate: '2026-04-26' })
    const later = t({ id: 'later', dueDate: '2026-06-01' })
    const sorted = [later, soon].sort((a, b) => compareForSidebar(a, b, NOW))
    expect(sorted.map(x => x.id)).toEqual(['soon', 'later'])
  })

  it('within none: title ascending, case-insensitive', () => {
    const a = t({ id: 'a', title: 'banana' })
    const b = t({ id: 'b', title: 'Apple' })
    const sorted = [a, b].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['b', 'a'])
  })

  it('is stable for equal keys', () => {
    const a = t({ id: 'a', dueDate: '2026-04-24' })
    const b = t({ id: 'b', dueDate: '2026-04-24' })
    const sorted = [a, b].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/tasks/urgency.test.ts`
Expected: FAIL — `urgencyRank is not a function` / `compareForSidebar is not a function`.

- [ ] **Step 3: Implement the comparator**

Append to `lib/tasks/urgency.ts`:

```typescript
import type { Task } from '@/types/task'

export function urgencyRank(u: Urgency): 0 | 1 | 2 | 3 {
  switch (u) {
    case 'overdue': return 0
    case 'today':   return 1
    case 'none':    return 2
    case 'future':  return 3
  }
}

export function compareForSidebar(a: Task, b: Task, now: Date): number {
  const ua = classifyUrgency(a.dueDate, a.done, now)
  const ub = classifyUrgency(b.dueDate, b.done, now)
  const ra = urgencyRank(ua)
  const rb = urgencyRank(ub)
  if (ra !== rb) return ra - rb

  if (ua === 'none') {
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  }
  // overdue/today/future: tie-break by dueDate ascending (oldest first for
  // overdue, soonest first for future). 'today' has identical dueDate so the
  // comparator returns 0, leaving the input order — Array.prototype.sort is
  // stable in modern engines.
  const da = a.dueDate ?? ''
  const db = b.dueDate ?? ''
  if (da < db) return -1
  if (da > db) return 1
  return 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/tasks/urgency.test.ts`
Expected: PASS — all classifier + comparator tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/urgency.ts __tests__/lib/tasks/urgency.test.ts
git commit -m "feat(tasks): urgencyRank + compareForSidebar comparator"
```

---

### Task 3: `groupBySourceAndList` — grouping helper

**Files:**
- Create: `lib/tasks/grouping.ts`
- Test: `__tests__/lib/tasks/grouping.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/tasks/grouping.test.ts`:

```typescript
import { groupBySourceAndList } from '@/lib/tasks/grouping'
import type { Task, TaskSource } from '@/types/task'

const NOW = new Date(2026, 3, 24, 12, 0, 0)

function t(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? 'x',
    source: partial.source ?? 'outlook',
    title: partial.title ?? 'Task',
    done: partial.done ?? false,
    dueDate: partial.dueDate,
    listName: partial.listName,
  }
}

describe('groupBySourceAndList', () => {
  const ALL: TaskSource[] = ['herbe', 'outlook', 'google']

  it('preserves the source order supplied', () => {
    const tasks = [
      t({ id: 'o', source: 'outlook', listName: 'Tasks' }),
      t({ id: 'h', source: 'herbe',   listName: 'Burti' }),
      t({ id: 'g', source: 'google',  listName: 'My Tasks' }),
    ]
    const result = groupBySourceAndList(tasks, ALL, NOW)
    expect(result.map(g => g.source)).toEqual(['herbe', 'outlook', 'google'])
  })

  it('drops done tasks from grouping', () => {
    const tasks = [
      t({ id: 'open', source: 'outlook', listName: 'Tasks', done: false }),
      t({ id: 'done', source: 'outlook', listName: 'Tasks', done: true }),
    ]
    const result = groupBySourceAndList(tasks, ['outlook'], NOW)
    const outlook = result.find(r => r.source === 'outlook')!
    const ids = outlook.lists.flatMap(l => l.tasks.map(t => t.id))
    expect(ids).toEqual(['open'])
  })

  it('returns listName=null when a source has exactly one distinct list', () => {
    const tasks = [
      t({ id: '1', source: 'outlook', listName: 'Tasks' }),
      t({ id: '2', source: 'outlook', listName: 'Tasks' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists).toHaveLength(1)
    expect(outlook.lists[0].listName).toBeNull()
    expect(outlook.lists[0].tasks.map(x => x.id).sort()).toEqual(['1', '2'])
  })

  it('returns multiple list groups, sorted by name, (untitled) last', () => {
    const tasks = [
      t({ id: 'u', source: 'outlook', listName: undefined }),
      t({ id: 't', source: 'outlook', listName: 'Tasks' }),
      t({ id: 'b', source: 'outlook', listName: 'Books' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists.map(l => l.listName)).toEqual(['Books', 'Tasks', '(untitled)'])
  })

  it('within a list, orders tasks by urgency then date', () => {
    const tasks = [
      t({ id: 'future',  source: 'outlook', listName: 'Tasks', dueDate: '2026-05-01' }),
      t({ id: 'overdue', source: 'outlook', listName: 'Tasks', dueDate: '2026-04-10' }),
      t({ id: 'today',   source: 'outlook', listName: 'Tasks', dueDate: '2026-04-24' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists[0].tasks.map(t => t.id)).toEqual(['overdue', 'today', 'future'])
  })

  it('drops sources with no open tasks from the list array', () => {
    const tasks = [
      t({ id: 'done', source: 'outlook', listName: 'Tasks', done: true }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.source).toBe('outlook')
    expect(outlook.lists).toEqual([])
  })

  it('excludes sources not in the supplied sources argument', () => {
    const tasks = [
      t({ id: 'h', source: 'herbe', listName: 'Burti' }),
      t({ id: 'o', source: 'outlook', listName: 'Tasks' }),
    ]
    const result = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(result.map(r => r.source)).toEqual(['outlook'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/tasks/grouping.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tasks/grouping'`.

- [ ] **Step 3: Implement `groupBySourceAndList`**

Create `lib/tasks/grouping.ts`:

```typescript
import type { Task, TaskSource } from '@/types/task'
import { compareForSidebar } from '@/lib/tasks/urgency'

const UNTITLED = '(untitled)'

export interface ListGroup {
  /** null means render without a sub-header (single-list source). */
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
): SourceGroup[] {
  return sources.map(source => {
    const sourceTasks = tasks.filter(t => t.source === source && !t.done)

    const byList = new Map<string, Task[]>()
    for (const task of sourceTasks) {
      const key = (task.listName && task.listName.trim()) || UNTITLED
      const bucket = byList.get(key) ?? []
      bucket.push(task)
      byList.set(key, bucket)
    }

    const distinctLists = [...byList.keys()]
    const singleList = distinctLists.length === 1

    const lists: ListGroup[] = distinctLists
      .sort((a, b) => {
        if (a === UNTITLED) return 1
        if (b === UNTITLED) return -1
        return a.localeCompare(b)
      })
      .map(name => ({
        listName: singleList ? null : name,
        tasks: (byList.get(name) ?? []).slice().sort((x, y) => compareForSidebar(x, y, now)),
      }))

    return { source, lists }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/tasks/grouping.test.ts`
Expected: PASS — all 7 grouping tests.

Run the full task-helper suite to make sure nothing else broke:
`npx jest __tests__/lib/tasks/`
Expected: PASS — urgency + grouping, all green.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/grouping.ts __tests__/lib/tasks/grouping.test.ts
git commit -m "feat(tasks): groupBySourceAndList — per-source, per-list sorted view"
```

---

### Task 4: Wire `TaskRow` to accept the `urgency` prop

**Files:**
- Modify: `components/TaskRow.tsx`

This task has no dedicated test (TaskRow is a thin presentational component already covered implicitly by the behavior tests in earlier tasks). We verify by type-checking + a quick grep.

- [ ] **Step 1: Update `TaskRow.tsx`**

Replace the entire contents of `components/TaskRow.tsx`:

```tsx
'use client'
import type { Task } from '@/types/task'
import type { Urgency } from '@/lib/tasks/urgency'
import { format, parseISO } from 'date-fns'

const SOURCE_COLOR: Record<Task['source'], string> = {
  herbe: '#00AEE7',
  outlook: '#6264a7',
  google: '#4285f4',
}

function formatDueDate(iso: string): string {
  try {
    const d = parseISO(iso)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      ? format(d, 'd MMM')
      : format(d, 'd MMM yyyy')
  } catch {
    return iso
  }
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="14" height="17" rx="2" />
      <path d="M8 2h9a2 2 0 0 1 2 2v13" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

export function TaskRow(props: {
  task: Task
  urgency: Urgency
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
}) {
  const { task, urgency, onToggleDone, onEdit, onCopyToEvent } = props
  const rowClass = ['task-row']
  if (task.done) rowClass.push('done')
  rowClass.push(`urgency-${urgency}`)

  return (
    <div
      data-testid="task-row"
      className={rowClass.join(' ')}
      style={{ borderLeftColor: SOURCE_COLOR[task.source] }}
    >
      <input
        type="checkbox"
        className="task-check"
        checked={task.done}
        onChange={e => onToggleDone(task, e.currentTarget.checked)}
        aria-label="Mark done"
      />
      <div className="task-body" onClick={() => onEdit(task)}>
        <div className="task-title">{task.title}</div>
        {(task.dueDate || task.listName) && (
          <div className="task-meta">
            {task.dueDate && (
              <span data-testid="due-badge" className="task-due">
                {formatDueDate(task.dueDate)}
              </span>
            )}
            {task.listName && <span className="task-list">{task.listName}</span>}
          </div>
        )}
      </div>
      <div className="task-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Copy to calendar event"
          title="Copy to calendar"
          onClick={e => { e.stopPropagation(); onCopyToEvent(task) }}
        ><CopyIcon /></button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit"
          title="Edit task"
          onClick={e => { e.stopPropagation(); onEdit(task) }}
        ><EditIcon /></button>
      </div>
    </div>
  )
}
```

Changes vs the previous version:
- Removed `isOverdue` helper (urgency is computed upstream).
- Added `urgency: Urgency` required prop.
- `className` now includes `urgency-<bucket>`; removed the inline `.overdue` on the date pill (the CSS will scope via the row class).
- No import of `isOverdue` anywhere else to remove — verify below.

- [ ] **Step 2: Verify no other file referenced the removed helper**

Run: `grep -rn "isOverdue" /Users/elviskvalbergs/AI/herbe-calendar --include="*.ts" --include="*.tsx"`
Expected: no output (the function was only used inside `TaskRow.tsx`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `components/TasksList.tsx` about the missing `urgency` prop on `TaskRow`. That is intentional — Task 5 fixes it. Do **not** commit yet if tsc fails elsewhere; only `TasksList.tsx` call-sites should show errors.

(If unrelated type errors surface, fix them as a separate concern before continuing.)

- [ ] **Step 4: Do not commit yet**

This change alone breaks `TasksList.tsx`. We commit after Task 5 wires the prop through.

---

### Task 5: Wire `TasksList` + `TasksSidebar` to use grouping

**Files:**
- Modify: `components/TasksList.tsx`
- Modify: `components/TasksSidebar.tsx`

- [ ] **Step 1: Replace `components/TasksList.tsx`**

Replace the entire contents of `components/TasksList.tsx`:

```tsx
'use client'
import type { Task, TaskSource } from '@/types/task'
import { TaskRow } from './TaskRow'
import { groupBySourceAndList } from '@/lib/tasks/grouping'
import { classifyUrgency } from '@/lib/tasks/urgency'
import { useState } from 'react'

const SOURCE_LABEL: Record<TaskSource, string> = {
  herbe: 'ERP',
  outlook: 'Outlook',
  google: 'Google',
}

interface CommonHandlers {
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
  onCreate: (source: TaskSource) => void
}

function SourceSection(props: {
  source: TaskSource
  tasks: Task[]
  now: Date
  handlers: CommonHandlers
  showHeader: boolean
}) {
  const { source, tasks, now, handlers, showHeader } = props
  const [showCompleted, setShowCompleted] = useState(false)
  const [sourceGroup] = groupBySourceAndList(tasks, [source], now)
  const openCount = sourceGroup.lists.reduce((n, l) => n + l.tasks.length, 0)
  const completed = tasks.filter(t => t.done)

  return (
    <section className="task-section">
      {showHeader && (
        <header className="task-section-hdr">
          <span className="task-section-title">{SOURCE_LABEL[source]}</span>
          <span className="task-section-count">{openCount}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost task-new-btn"
            onClick={() => handlers.onCreate(source)}
          >
            <span aria-hidden="true">+</span> New task
          </button>
        </header>
      )}
      {sourceGroup.lists.length === 0 && (
        <p className="task-empty">No open tasks.</p>
      )}
      {sourceGroup.lists.map((list, idx) => (
        <div key={list.listName ?? `__single__${idx}`}>
          {list.listName !== null && (
            <h4 className="task-list-hdr">
              <span>{list.listName}</span>
              <span className="task-list-count">{list.tasks.length}</span>
            </h4>
          )}
          {list.tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              urgency={classifyUrgency(task.dueDate, task.done, now)}
              onToggleDone={handlers.onToggleDone}
              onEdit={handlers.onEdit}
              onCopyToEvent={handlers.onCopyToEvent}
            />
          ))}
        </div>
      ))}
      {completed.length > 0 && (
        <>
          <button
            type="button"
            className="task-done-toggle"
            onClick={() => setShowCompleted(s => !s)}
          >
            {showCompleted ? '▾' : '▸'} {completed.length} completed
          </button>
          {showCompleted && completed.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              urgency="none"
              onToggleDone={handlers.onToggleDone}
              onEdit={handlers.onEdit}
              onCopyToEvent={handlers.onCopyToEvent}
            />
          ))}
        </>
      )}
    </section>
  )
}

export function TasksList(props: {
  tab: 'all' | TaskSource
  tasks: Task[]
  now: Date
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  handlers: CommonHandlers
}) {
  const { tab, tasks, now, configured, handlers } = props
  if (tab === 'all') {
    const sources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
      .filter(s => configured[s])
    return (
      <div>
        {sources.map(s => (
          <SourceSection
            key={s}
            source={s}
            tasks={tasks.filter(t => t.source === s)}
            now={now}
            handlers={handlers}
            showHeader={true}
          />
        ))}
      </div>
    )
  }
  return (
    <SourceSection
      source={tab}
      tasks={tasks.filter(t => t.source === tab)}
      now={now}
      handlers={handlers}
      showHeader={true}
    />
  )
}
```

Key changes:
- `SourceSection` drives open-task rendering off `groupBySourceAndList`.
- List sub-header renders only when `list.listName !== null`.
- Each `TaskRow` receives `urgency` computed from `classifyUrgency`.
- Completed tasks still filtered separately from the raw `tasks` array; given `urgency="none"` (they're done — no urgency visual needed).
- `now` threads through from `TasksList` → `SourceSection`.

- [ ] **Step 2: Update `components/TasksSidebar.tsx`**

Modify `components/TasksSidebar.tsx`. Find the TasksList invocation block and add `now` to the render + prop:

```tsx
export function TasksSidebar(props: {
  tasks: Task[]
  loading?: boolean
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  errors: SourceError[]
  activeTab: 'all' | TaskSource
  onTabChange: (tab: 'all' | TaskSource) => void
  handlers: {
    onToggleDone: (task: Task, next: boolean) => void
    onEdit: (task: Task) => void
    onCopyToEvent: (task: Task) => void
    onCreate: (source: TaskSource) => void
  }
}) {
  const { tasks, loading, configured, errors, activeTab, onTabChange, handlers } = props
  const visibleSources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
    .filter(s => configured[s])
  const countBy = (s: TaskSource) => tasks.filter(t => t.source === s && !t.done).length
  const total = tasks.filter(t => !t.done).length
  const now = new Date()
```

(The single-line addition is `const now = new Date()` immediately after `total`.)

Then change the `<TasksList … />` invocation at the bottom to include `now={now}`:

```tsx
      <div className="tasks-scroll">
        <TasksList
          tab={activeTab}
          tasks={tasks}
          now={now}
          configured={configured}
          handlers={handlers}
        />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors related to TaskRow / TasksList / TasksSidebar).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS. All existing suites plus the two new task-helper suites.

- [ ] **Step 5: Commit TaskRow + TasksList + TasksSidebar together**

```bash
git add components/TaskRow.tsx components/TasksList.tsx components/TasksSidebar.tsx
git commit -m "feat(tasks): list-grouped sidebar with urgency-sorted rows"
```

---

### Task 6: Apply CSS — urgency pill colors + list sub-header

**Files:**
- Modify: `app/design.css`

The current `.task-due.overdue` rule uses `var(--app-accent)` (brand orange-red). We replace it with a row-scoped `.urgency-overdue .task-due` that uses `var(--app-danger)` (semantic red), and add a parallel `.urgency-today .task-due` using `var(--app-success)`. We also add the `.task-list-hdr` rule for the new per-list sub-header.

- [ ] **Step 1: Locate the existing `.task-due.overdue` block**

Run: `grep -n "task-due.overdue" /Users/elviskvalbergs/AI/herbe-calendar/app/design.css`
Expected: one match at around line 3145 (the exact line number will drift over time — use whatever the grep reports).

- [ ] **Step 2: Replace `.task-due.overdue` and add the new urgency + list-header rules**

Use Edit on `app/design.css` to replace exactly:

```css
.task-due.overdue {
  color: var(--app-accent);
  background: rgba(205,76,56,0.12);
}
```

With:

```css
.urgency-overdue .task-due {
  color: var(--app-danger);
  background: rgba(216,94,73,0.14);
}
.urgency-today .task-due {
  color: var(--app-success);
  background: rgba(111,173,111,0.14);
}
.task-list-hdr {
  display: flex; align-items: center; gap: 6px;
  margin: 6px 0 2px;
  padding: 4px 14px 2px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--app-fg-subtle);
}
.task-list-hdr > span:first-child { flex: 1; }
.task-list-count {
  font-size: 10.5px; color: var(--app-fg-faint); font-weight: 500;
}
```

Rationale for token choices:
- `--app-danger` (dark: `#D85E49`, light: `#B33E2C`) — semantic danger, matches what the rgba background evokes.
- `--app-success` (dark: `#6FAD6F`, light: `#4C8A4C`) — semantic success; rgba background derived from the dark-mode value at 14% opacity (mirrors the existing `.task-due.overdue` pattern).
- `.task-list-hdr` is visually subordinate to `.task-section-hdr` (smaller font, lower padding, `--app-fg-subtle` vs `--app-fg-muted`).

- [ ] **Step 3: Visual smoke test**

Run the dev server and check the tasks sidebar.

Run: `npm run dev`
Navigate to the calendar, open the tasks sidebar, and confirm:
1. Overdue tasks show a red-tinted date pill.
2. Tasks due today show a green-tinted pill.
3. Future tasks show the neutral pill.
4. If you have two+ Outlook lists (or two ERP connections, or two+ Google lists), sub-headers appear above each group. If you have only one, no sub-header.
5. Rows sort overdue → today → no-date → future within each list.

If you don't have data to cover all cases, note it and move on — unit tests cover the logic.

- [ ] **Step 4: Commit**

```bash
git add app/design.css
git commit -m "style(tasks): urgency pill colors + list sub-header in sidebar"
```

---

### Task 7: Final full-suite check

- [ ] **Step 1: Run everything once more**

Run: `npm test && npx tsc --noEmit`
Expected: PASS on both.

- [ ] **Step 2: Show what shipped**

Run: `git log --oneline -5`
Expected: four new commits (Task 1, Task 2, Task 3, Task 5 bundled, Task 6) on top of the spec commit.

- [ ] **Step 3: No extra commit — feature is complete.**

---

## Notes for the implementer

- **Why Jest, not Vitest**: this repo uses Jest via ts-jest. Don't introduce Vitest imports. `import` paths use the `@/…` alias configured in `jest.config.ts` (`moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }`).
- **Why `now` is not memoized**: `new Date()` is cheap and re-running per render keeps the "today" boundary honest without a timer. Memoizing would require invalidation on midnight — not worth it for a sidebar.
- **Why list name is `null` for single-list**: carrying the actual list name through and deciding at render time would duplicate the "single vs multi" logic between grouping and the view. The helper encodes the decision once.
- **Why done tasks get `urgency="none"`**: they don't participate in the urgency visual but `TaskRow` still expects a value. `none` leaves no special class styling applied; the existing `.done` class already handles the visual (strikethrough + opacity).

## Out of scope (from spec)

- Date-bucket headers inside lists.
- List-level tabs / filter dropdown / per-list create button.
- Per-user list-visibility preferences.
- Server-side sorting or urgency stamping.
- Timer-driven `now` refresh.
