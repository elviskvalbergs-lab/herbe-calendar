# Calendar UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three calendar UX problems: activity blocks squeezed when they shouldn't overlap, Herbe/Outlook hard to distinguish, short blocks unreadable.

**Architecture:** Three independent changes applied in order of complexity. The collision-group algorithm is extracted to a pure function in `lib/layout.ts` for testability, then consumed by `PersonColumn.tsx`. `ActivityBlock.tsx` gains a `height` prop for compact mode. `lib/activityColors.ts` gets two targeted color fixes.

**Tech Stack:** Next.js 15, React, TypeScript, Jest + ts-jest for unit tests (run with `npm test`).

**Spec:** `docs/superpowers/specs/2026-03-22-calendar-ux-improvements-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/activityColors.ts` | Fix "Deep Forest" color; swap palette indices 2 & 5 |
| Create | `__tests__/lib/activityColors.test.ts` | Unit tests for color lookups |
| Create | `lib/layout.ts` | Pure collision-group + lane algorithm |
| Create | `__tests__/lib/layout.test.ts` | Unit tests for layout algorithm |
| Modify | `components/ActivityBlock.tsx` | Accept `height` prop; compact single-line mode |
| Modify | `components/PersonColumn.tsx` | Herbe/Outlook split sub-columns; use `lib/layout.ts` |

---

## Task 1: Fix Activity Colors

**Files:**
- Modify: `lib/activityColors.ts`
- Create: `__tests__/lib/activityColors.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/activityColors.test.ts`:

```typescript
import { BRAND_PALETTE, HERBE_COLOR_NAMES, calColNrToColor } from '@/lib/activityColors'

describe('HERBE_COLOR_NAMES', () => {
  it('Deep Forest maps to lime-green, not teal', () => {
    expect(HERBE_COLOR_NAMES['Deep Forest']).toBe('#22c55e')
  })
  it('Sky Blue is still cyan', () => {
    expect(HERBE_COLOR_NAMES['Sky Blue']).toBe('#00ABCE')
  })
  it('Green is still #22c55e', () => {
    expect(HERBE_COLOR_NAMES['Green']).toBe('#22c55e')
  })
})

describe('BRAND_PALETTE order', () => {
  it('index 2 is green #22c55e (swapped from teal)', () => {
    expect(BRAND_PALETTE[2]).toBe('#22c55e')
  })
  it('index 5 is teal #4db89a (swapped from green)', () => {
    expect(BRAND_PALETTE[5]).toBe('#4db89a')
  })
})

describe('calColNrToColor', () => {
  it('resolves "Deep Forest" to lime-green after fix', () => {
    expect(calColNrToColor('Deep Forest')).toBe('#22c55e')
  })
  it('resolves numeric 2 to palette index 2', () => {
    expect(calColNrToColor(2)).toBe(BRAND_PALETTE[2])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=activityColors
```

Expected: FAIL — `Deep Forest` returns `#4db89a`, `BRAND_PALETTE[2]` is `#4db89a`.

- [ ] **Step 3: Apply the three fixes in `lib/activityColors.ts`**

1. Add `export` to `HERBE_COLOR_NAMES` (it is currently unexported — the test imports it directly):
   Change `const HERBE_COLOR_NAMES` → `export const HERBE_COLOR_NAMES`

2. Change `'Deep Forest': '#4db89a'` → `'Deep Forest': '#22c55e'`

3. Swap `BRAND_PALETTE` indices 2 and 5:
   - Index 2: change `'#4db89a', // 2  teal` → `'#22c55e', // 2  green`
   - Index 5: change `'#22c55e', // 5  green` → `'#4db89a', // 5  teal`

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=activityColors
```

Expected: PASS (3 describe blocks, 6 tests).

- [ ] **Step 5: Run full test suite to check no regressions**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/activityColors.ts __tests__/lib/activityColors.test.ts
git commit -m "fix: improve palette contrast — Deep Forest to lime-green, swap palette indices 2 & 5"
```

---

## Task 2: Compact Blocks in ActivityBlock

**Files:**
- Modify: `components/ActivityBlock.tsx`

No unit test for this component (requires jsdom + React Testing Library not yet set up). Visual verification in the browser is the test.

- [ ] **Step 1: Add `height` to the Props interface**

In `components/ActivityBlock.tsx`, change:

```typescript
interface Props {
  activity: Activity
  color: string
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  style?: React.CSSProperties
}
```

to:

```typescript
interface Props {
  activity: Activity
  color: string
  height: number
  onClick: (a: Activity) => void
  onDragStart?: (e: React.PointerEvent<HTMLDivElement>, a: Activity, type: 'move' | 'resize') => void
  canEdit: boolean
  style?: React.CSSProperties
}
```

- [ ] **Step 2: Update the component signature and remove internal height computation**

Change:

```typescript
export default function ActivityBlock({ activity, color, onClick, onDragStart, canEdit, style }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const height = Math.max(durationToPx(activity.timeFrom, activity.timeTo), 20)
  const isOutlook = activity.source === 'outlook'
```

to:

```typescript
export default function ActivityBlock({ activity, color, height, onClick, onDragStart, canEdit, style }: Props) {
  const top = timeToTopPx(activity.timeFrom)
  const isCompact = height < 28
  const isOutlook = activity.source === 'outlook'
```

Also remove the unused `durationToPx` from the import (keep `timeToTopPx`):

```typescript
import { timeToTopPx } from '@/lib/time'
```

- [ ] **Step 3: Update the JSX to use compact mode**

Replace the inner content div:

```tsx
<div className="px-1.5 py-0.5">
  <div className="flex items-start justify-between gap-1">
    <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
      {isOutlook && '📅 '}{activity.description || '(no title)'}
    </p>
    {activity.joinUrl && (
      <a
        href={activity.joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded"
        style={{ background: '#464EB8', color: '#fff', lineHeight: 1.2 }}
      >
        Join
      </a>
    )}
  </div>
  <p className="text-[9px] text-text-muted truncate">
    {activity.timeFrom}–{activity.timeTo}
    {activity.customerName ? ` · ${activity.customerName}` : ''}
  </p>
</div>
```

with:

```tsx
{isCompact ? (
  <div className="px-1.5 flex items-center gap-1 h-full overflow-hidden">
    <p className="text-[9px] font-bold truncate flex-1" style={{ color }}>
      {isOutlook && '📅 '}{activity.description || '(no title)'}
    </p>
    <span className="text-[8px] text-text-muted shrink-0 whitespace-nowrap">{activity.timeFrom}</span>
  </div>
) : (
  <div className="px-1.5 py-0.5">
    <div className="flex items-start justify-between gap-1">
      <p className="text-[10px] font-bold truncate flex-1" style={{ color }}>
        {isOutlook && '📅 '}{activity.description || '(no title)'}
      </p>
      {activity.joinUrl && (
        <a
          href={activity.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          className="shrink-0 text-[8px] font-bold px-1 py-0.5 rounded"
          style={{ background: '#464EB8', color: '#fff', lineHeight: 1.2 }}
        >
          Join
        </a>
      )}
    </div>
    <p className="text-[9px] text-text-muted truncate">
      {activity.timeFrom}–{activity.timeTo}
      {activity.customerName ? ` · ${activity.customerName}` : ''}
    </p>
  </div>
)}
```

- [ ] **Step 4: Shrink the resize handle in compact mode**

Change:

```tsx
{canEdit && (
  <div
    className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize"
    onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
  />
)}
```

to:

```tsx
{canEdit && (
  <div
    className={`absolute bottom-0 left-0 right-0 cursor-s-resize ${isCompact ? 'h-1' : 'h-2'}`}
    onPointerDown={(e) => { e.stopPropagation(); onDragStart?.(e, activity, 'resize') }}
  />
)}
```

- [ ] **Step 5: Fix the TypeScript error — `PersonColumn` must pass `height`**

`PersonColumn.tsx` currently renders `<ActivityBlock>` without a `height` prop. TypeScript will fail to compile. Open `components/PersonColumn.tsx` and find every `<ActivityBlock` render. There are two: one for normal render, one for the dragging state.

For each, compute height alongside `displayActivity` and pass it as a prop. In the block that builds `displayActivity` (around line 168):

```typescript
const displayActivity = isDragging
  ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
  : act
const actHeight = Math.max(durationToPx(displayActivity.timeFrom, displayActivity.timeTo), 20)
```

Then add `height={actHeight}` to `<ActivityBlock>`. Update the `@/lib/time` import in `PersonColumn.tsx` to include `durationToPx`. The full import line should be:

```typescript
import { GRID_START_HOUR, GRID_END_HOUR, minutesToTime, timeToMinutes, snapToQuarter, pxToMinutes, timeToTopPx, durationToPx } from '@/lib/time'
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/ActivityBlock.tsx components/PersonColumn.tsx
git commit -m "feat: compact single-line mode for short activity blocks (height < 28px)"
```

---

## Task 3: Collision-Group Layout Algorithm

**Files:**
- Create: `lib/layout.ts`
- Create: `__tests__/lib/layout.test.ts`

- [ ] **Step 1: Write tests in `__tests__/lib/layout.test.ts`**

```typescript
import { buildLanedActivities, LanedActivity, LayoutActivity } from '@/lib/layout'

function act(id: string, timeFrom: string, timeTo: string): LayoutActivity {
  return { id, timeFrom, timeTo }
}

function lanes(results: LanedActivity<LayoutActivity>[]) {
  return Object.fromEntries(results.map(r => [r.activity.id, { lane: r.laneIndex, count: r.laneCount }]))
}

describe('buildLanedActivities', () => {
  it('returns empty for no activities', () => {
    expect(buildLanedActivities([])).toEqual([])
  })

  it('single activity gets lane 0 of 1', () => {
    const result = lanes(buildLanedActivities([act('A', '09:00', '10:00')]))
    expect(result).toEqual({ A: { lane: 0, count: 1 } })
  })

  it('back-to-back activities (end == start) do NOT overlap — each gets full lane', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '10:00', '11:00'),
    ]))
    expect(result.A).toEqual({ lane: 0, count: 1 })
    expect(result.B).toEqual({ lane: 0, count: 1 })
  })

  it('truly overlapping activities share a collision group', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.A.lane).not.toBe(result.B.lane)
  })

  it('three sequential activities — each full width (laneCount === 1)', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '10:00', '11:00'),
      act('C', '11:00', '12:00'),
    ]))
    // laneCount 1 means left=0%, right=0% → full sub-column width
    expect(result.A).toEqual({ lane: 0, count: 1 })
    expect(result.B).toEqual({ lane: 0, count: 1 })
    expect(result.C).toEqual({ lane: 0, count: 1 })
  })

  it('transitive chain A-B overlap, B-C overlap → all in one group of 2 lanes', () => {
    // A(9-10), B(9:30-10:30), C(10:00-11:00)
    // A and C touch but don't overlap; B connects them transitively
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
      act('C', '10:00', '11:00'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.C.count).toBe(2)
    // A and C can share a lane (C starts exactly when A ends — allowed)
    expect(result.A.lane).toBe(result.C.lane)
    expect(result.B.lane).not.toBe(result.A.lane)
  })

  it('mix: one overlap pair, then independent activity', () => {
    const result = lanes(buildLanedActivities([
      act('A', '09:00', '10:00'),
      act('B', '09:30', '10:30'),
      act('C', '11:00', '12:00'),
    ]))
    expect(result.A.count).toBe(2)
    expect(result.B.count).toBe(2)
    expect(result.C).toEqual({ lane: 0, count: 1 })
  })
})
```

- [ ] **Step 2: Create `lib/layout.ts` with the pure algorithm**

```typescript
import { timeToMinutes } from './time'

export interface LayoutActivity {
  id: string | number
  timeFrom: string
  timeTo: string
}

export interface LanedActivity<T extends LayoutActivity> {
  activity: T
  laneIndex: number
  laneCount: number
}

/**
 * Two-pass layout algorithm.
 *
 * Pass 1: Build collision groups — clusters of activities where any two are
 * time-overlapping (strictly: timeTo > next timeFrom). Back-to-back activities
 * (end == start) are NOT overlapping and start a new group.
 *
 * Pass 2: Within each collision group, assign lanes greedily. A lane is reused
 * when its last activity ends at or before the new activity's start (<=).
 *
 * Returns every activity annotated with its laneIndex and laneCount so the
 * caller can compute left/right percentages within a sub-column container.
 */
export function buildLanedActivities<T extends LayoutActivity>(activities: T[]): LanedActivity<T>[] {
  if (activities.length === 0) return []

  // Sort by start time
  const sorted = [...activities].sort((a, b) => a.timeFrom.localeCompare(b.timeFrom))

  // Pass 1: build collision groups
  const collisionGroups: T[][] = []
  let currentGroup: T[] = [sorted[0]]
  let currentGroupMaxEnd = timeToMinutes(sorted[0].timeTo)

  for (let i = 1; i < sorted.length; i++) {
    const act = sorted[i]
    if (timeToMinutes(act.timeFrom) < currentGroupMaxEnd) {
      // Overlaps with current group
      currentGroup.push(act)
      currentGroupMaxEnd = Math.max(currentGroupMaxEnd, timeToMinutes(act.timeTo))
    } else {
      // No overlap — start new group
      collisionGroups.push(currentGroup)
      currentGroup = [act]
      currentGroupMaxEnd = timeToMinutes(act.timeTo)
    }
  }
  collisionGroups.push(currentGroup)

  // Pass 2: assign lanes within each collision group
  const result: LanedActivity<T>[] = []

  for (const group of collisionGroups) {
    // Each lane tracks the end time (in minutes) of its last activity
    const lanes: number[] = []

    for (const act of group) {
      const startMins = timeToMinutes(act.timeFrom)
      // Find first lane whose last activity ends at or before this start
      const laneIdx = lanes.findIndex(endMins => endMins <= startMins)
      if (laneIdx === -1) {
        // Need a new lane
        lanes.push(timeToMinutes(act.timeTo))
        result.push({ activity: act, laneIndex: lanes.length - 1, laneCount: -1 }) // laneCount patched below
      } else {
        lanes[laneIdx] = timeToMinutes(act.timeTo)
        result.push({ activity: act, laneIndex: laneIdx, laneCount: -1 })
      }
    }

    // Patch laneCount for all activities in this group
    const laneCount = lanes.length
    for (const item of result) {
      if (item.laneCount === -1 && group.includes(item.activity)) {
        item.laneCount = laneCount
      }
    }
  }

  return result
}
```

- [ ] **Step 3: Run tests again — they should now pass**

```bash
npm test -- --testPathPattern=layout
```

Expected: all 6 layout tests PASS.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/layout.ts __tests__/lib/layout.test.ts
git commit -m "feat: add collision-group lane layout algorithm with tests"
```

---

## Task 4: Herbe/Outlook Split + New Layout in PersonColumn

**Files:**
- Modify: `components/PersonColumn.tsx`

This is the biggest change. Read the current file in full before starting.

- [ ] **Step 1: Add imports**

At the top of `components/PersonColumn.tsx`, add:

```typescript
import { buildLanedActivities } from '@/lib/layout'
```

Also ensure `durationToPx` is in the `@/lib/time` import (added in Task 2 Step 5).

- [ ] **Step 2: Replace the old grouping logic with `buildLanedActivities`**

Remove the current block (lines 129–139):

```typescript
const sorted = [...activities].sort((a, b) => a.timeFrom.localeCompare(b.timeFrom))
const groups: Activity[][] = []
for (const act of sorted) {
  const col = groups.find(g => {
    const maxEndMins = Math.max(...g.map(a => timeToMinutes(a.timeTo)))
    return maxEndMins <= timeToMinutes(act.timeFrom)
  })
  if (col) col.push(act)
  else groups.push([act])
}
```

Replace with:

```typescript
const herbeActivities = activities.filter(a => a.source !== 'outlook')
const outlookActivities = activities.filter(a => a.source === 'outlook')
const hasBoth = herbeActivities.length > 0 && outlookActivities.length > 0

const herbeLaned = buildLanedActivities(herbeActivities)
const outlookLaned = buildLanedActivities(outlookActivities)
```

- [ ] **Step 3: Rewrite the render return**

Replace everything from `return (` to the closing `</div>` of the component with:

```tsx
return (
  <div ref={columnRef} className={`flex-1 ${colMinW} border-r border-border relative last:border-r-0`}>
    {dragError && (
      <div className="absolute top-2 left-0 right-0 z-30 mx-2">
        <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
          {dragError}
        </div>
      </div>
    )}

    <div className="relative flex h-full">
      {/* Herbe sub-column (or full column when no Outlook) */}
      <div
        className="relative"
        style={{ width: hasBoth ? '60%' : '100%' }}
      >
        {/* Hour rows — always live in Herbe sub-column */}
        {hours.map(h => (
          <div
            key={h}
            className="h-14 border-b border-border/30 hover:bg-white/5 cursor-pointer relative"
            onClick={(e) => handleSlotClick(h, e)}
          >
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/20" />
          </div>
        ))}

        {/* Herbe activity blocks */}
        {herbeLaned.map(({ activity: act, laneIndex, laneCount }) => {
          const isDragging = drag?.activity.id === act.id
          const isSaving = isDragging && drag!.saving
          const displayActivity = isDragging
            ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
            : act
          const actHeight = Math.max(durationToPx(displayActivity.timeFrom, displayActivity.timeTo), 20)
          const actColor = getActivityColor(act)
          return (
            <div
              key={act.id}
              className="absolute pointer-events-none"
              style={{
                left: `${(laneIndex / laneCount) * 100}%`,
                right: `${((laneCount - laneIndex - 1) / laneCount) * 100}%`,
                top: 0,
                bottom: 0,
              }}
            >
              <ActivityBlock
                activity={displayActivity}
                color={actColor}
                height={actHeight}
                onClick={(a) => { if (!suppressClickRef.current) onActivityClick(a) }}
                onDragStart={handleDragStart}
                canEdit={canEdit(act)}
                style={isDragging
                  ? { opacity: isSaving ? 0.5 : 0.7, outline: `2px dashed ${actColor}` }
                  : undefined}
              />
              {isDragging && (
                <div
                  className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                  style={{ top: timeToTopPx(drag!.currentFrom) - 14, color: actColor }}
                >
                  {isSaving ? '⏳' : ''}{drag!.currentFrom}–{drag!.currentTo}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Outlook sub-column — only rendered when both sources present */}
      {hasBoth && (
        <div
          className="relative border-l border-border/40"
          style={{ width: '40%', pointerEvents: 'none' }}
        >
          {/* Placeholder hour rows to maintain height */}
          {hours.map(h => (
            <div key={h} className="h-14 border-b border-border/30" />
          ))}

          {/* Outlook activity blocks */}
          {outlookLaned.map(({ activity: act, laneIndex, laneCount }) => {
            const isDragging = drag?.activity.id === act.id
            const isSaving = isDragging && drag!.saving
            const displayActivity = isDragging
              ? { ...act, timeFrom: drag!.currentFrom, timeTo: drag!.currentTo }
              : act
            const actHeight = Math.max(durationToPx(displayActivity.timeFrom, displayActivity.timeTo), 20)
            const actColor = getActivityColor(act)
            return (
              <div
                key={act.id}
                className="absolute pointer-events-auto"
                style={{
                  left: `${(laneIndex / laneCount) * 100}%`,
                  right: `${((laneCount - laneIndex - 1) / laneCount) * 100}%`,
                  top: 0,
                  bottom: 0,
                }}
              >
                <ActivityBlock
                  activity={displayActivity}
                  color={actColor}
                  height={actHeight}
                  onClick={(a) => { if (!suppressClickRef.current) onActivityClick(a) }}
                  onDragStart={handleDragStart}
                  canEdit={canEdit(act)}
                  style={isDragging
                    ? { opacity: isSaving ? 0.5 : 0.7, outline: `2px dashed ${actColor}` }
                    : undefined}
                />
                {isDragging && (
                  <div
                    className="absolute left-1 text-[9px] font-bold pointer-events-none z-20"
                    style={{ top: timeToTopPx(drag!.currentFrom) - 14, color: actColor }}
                  >
                    {isSaving ? '⏳' : ''}{drag!.currentFrom}–{drag!.currentTo}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  </div>
)
```

- [ ] **Step 4: Remove unused imports**

`timeToMinutes` was used only by the old grouping loop. Check if it's still needed elsewhere in the file. If not, remove it from the `@/lib/time` import.

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Visual smoke test in the browser**

Start the dev server:

```bash
npm run dev
```

Open the app and verify:
1. A day with sequential Herbe activities (back-to-back) — blocks should be **full column width**, not squeezed.
2. A day with overlapping Herbe activities — blocks should be side-by-side within Herbe sub-column.
3. A day with both Herbe + Outlook events — Herbe on left (60%), Outlook on right (40%), thin separator visible.
4. A day with only Herbe or only Outlook — single full-width column.
5. A 15-minute or 30-minute block — single-line compact display (title + start time only).

- [ ] **Step 8: Commit**

```bash
git add components/PersonColumn.tsx
git commit -m "feat: Herbe/Outlook dynamic split + collision-group lane layout"
```

---

## Done

All four tasks complete. The implementation delivers:
- Sequential activities at full width (no more squeeze)
- Herbe left / Outlook right dynamic split
- Compact single-line blocks for short activities
- Distinct colors for activity class groups
