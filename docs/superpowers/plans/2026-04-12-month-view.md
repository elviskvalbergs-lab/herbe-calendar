# Month View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apple Calendar-style month grid view as a new view mode with colored event blocks, multi-day event bars, and drill-down navigation.

**Architecture:** New `MonthView.tsx` component renders a 7-column grid with week rows. Each day cell shows up to 3 event snippets + "+N more". Multi-day/all-day events render as spanning bars. Tapping a day drills to day view, tapping a week number drills to 7-day view. Data uses existing fetch infrastructure with wider date range.

**Tech Stack:** Next.js App Router, React, date-fns, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-12-month-view-design.md`

---

## File Structure

### New files
| File | Purpose |
|------|---------|
| `components/MonthView.tsx` | Full month grid component with day cells, event snippets, multi-day bars |

### Modified files
| File | Change |
|------|--------|
| `types/index.ts` | Add `'month'` to `CalendarState.view` union |
| `components/CalendarHeader.tsx` | Add "Month" option to view selector, month navigation when in month view |
| `components/CalendarShell.tsx` | Render MonthView when view is 'month', adjust date range for month fetch |

---

### Task 1: Add month to view type

**Files:**
- Modify: `types/index.ts`
- Modify: `components/CalendarHeader.tsx`

- [ ] **Step 1: Add 'month' to CalendarState.view**

In `types/index.ts`, change:
```typescript
view: 'day' | '3day' | '5day' | '7day'
```
to:
```typescript
view: 'day' | '3day' | '5day' | '7day' | 'month'
```

- [ ] **Step 2: Add Month option to view selector**

In `components/CalendarHeader.tsx`, after the `<option value="7day">7 days</option>` line (~93), add:
```tsx
<option value="month">Month</option>
```

- [ ] **Step 3: Adjust navigation for month view**

In `components/CalendarHeader.tsx`, the `viewStep` calculation (~line 43) and `navigate` function need to handle month. Change:
```typescript
const viewStep = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
```
to:
```typescript
const viewStep = state.view === 'month' ? 0 : state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
```

For month view, the « » buttons should navigate by month instead of days. Update the navigate function to handle month:
```typescript
function navigate(days: number) {
  if (state.view === 'month') {
    const current = parseISO(state.date)
    const newDate = days > 0 ? addMonths(current, 1) : subMonths(current, 1)
    onStateChange({ ...state, date: format(startOfMonth(newDate), 'yyyy-MM-dd') })
  } else {
    onStateChange({ ...state, date: format(addDays(parseISO(state.date), days), 'yyyy-MM-dd') })
  }
}
```

Import `addMonths`, `subMonths`, `startOfMonth` from date-fns.

The single-step ‹ › buttons should be hidden or also navigate by month. Simplest: hide ‹ › when in month view, only show « ».

- [ ] **Step 4: Snap date to first of month when switching to month view**

In `CalendarHeader.tsx`, when the view selector changes to 'month', snap the date:
```typescript
onChange={e => {
  const newView = e.target.value as CalendarState['view']
  if (newView === 'month') {
    onStateChange({ ...state, view: newView, date: format(startOfMonth(parseISO(state.date)), 'yyyy-MM-dd') })
  } else {
    onStateChange({ ...state, view: newView })
  }
}}
```

- [ ] **Step 5: Commit**

```bash
git add types/index.ts components/CalendarHeader.tsx
git commit -m "feat: add month to view type and selector with month navigation"
```

---

### Task 2: Create MonthView component

**Files:**
- Create: `components/MonthView.tsx`

- [ ] **Step 1: Create the MonthView component**

```typescript
'use client'
import { useMemo } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, getISOWeek,
} from 'date-fns'
import type { Activity } from '@/types'

interface HolidayData {
  dates: Record<string, { name: string; country: string }[]>
  personCountries: Record<string, string>
}

interface Props {
  activities: Activity[]
  date: string // first of month (YYYY-MM-DD)
  holidays: HolidayData
  personCode: string
  getActivityColor: (activity: Activity) => string
  onSelectDate: (date: string) => void
  onSelectWeek: (monday: string) => void
  onActivityClick: (activity: Activity) => void
}

const MAX_VISIBLE_EVENTS = 3

export default function MonthView({
  activities, date, holidays, personCode, getActivityColor,
  onSelectDate, onSelectWeek, onActivityClick,
}: Props) {
  const monthStart = startOfMonth(parseISO(date))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Group activities by date
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const a of activities) {
      if (!a.date) continue
      const existing = map.get(a.date) ?? []
      existing.push(a)
      map.set(a.date, existing)
    }
    return map
  }, [activities])

  // Build weeks (rows of 7 days)
  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-[2rem_repeat(7,1fr)] border-b border-border bg-surface shrink-0">
        <div className="text-center text-[9px] text-text-muted/50 font-medium py-1 border-r border-border/50">W</div>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] text-text-muted font-bold py-1">{d}</div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0])
          const monday = format(week[0], 'yyyy-MM-dd')
          return (
            <div key={wi} className="grid grid-cols-[2rem_repeat(7,1fr)] border-b border-border/30 min-h-[5rem]">
              {/* Week number */}
              <button
                onClick={() => onSelectWeek(monday)}
                className="text-[9px] text-text-muted/40 hover:text-primary font-medium text-center pt-1 border-r border-border/50"
                title={`Week ${weekNum} → 7-day view`}
              >
                {weekNum}
              </button>

              {/* Day cells */}
              {week.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const inMonth = isSameMonth(day, monthStart)
                const dayActivities = activitiesByDate.get(dateStr) ?? []
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const dateHolidays = holidays.dates?.[dateStr]
                const isHoliday = dateHolidays && dateHolidays.length > 0
                const allDay = dayActivities.filter(a => a.isAllDay)
                const timed = dayActivities.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
                const sorted = [...allDay, ...timed]
                const visible = sorted.slice(0, MAX_VISIBLE_EVENTS)
                const moreCount = sorted.length - visible.length

                return (
                  <div
                    key={dateStr}
                    className={`border-r border-border/20 last:border-r-0 px-0.5 pt-0.5 pb-1 cursor-pointer hover:bg-border/20 transition-colors ${
                      !inMonth ? 'opacity-30' :
                      isHoliday ? 'bg-red-500/5' :
                      isWeekend ? 'bg-border/10' : ''
                    }`}
                    onClick={() => onSelectDate(dateStr)}
                  >
                    {/* Day number */}
                    <div className={`text-[10px] font-bold mb-0.5 px-0.5 ${
                      isToday(day) ? 'text-primary' :
                      !inMonth ? 'text-text-muted' : 'text-text'
                    }`}>
                      {format(day, 'd')}
                      {isToday(day) && <span className="ml-0.5 text-[8px] font-normal text-primary">today</span>}
                    </div>

                    {/* Event snippets */}
                    {visible.map(act => (
                      <button
                        key={act.id}
                        onClick={(e) => { e.stopPropagation(); onActivityClick(act) }}
                        className="w-full text-left flex items-center gap-0.5 rounded px-0.5 py-px hover:bg-border/30 truncate"
                        title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: getActivityColor(act) }}
                        />
                        <span className="text-[9px] truncate text-text-muted">
                          {act.isAllDay ? act.description : `${act.timeFrom} ${act.description}`}
                        </span>
                      </button>
                    ))}
                    {moreCount > 0 && (
                      <div className="text-[8px] text-text-muted/60 px-0.5">+{moreCount} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MonthView.tsx
git commit -m "feat: MonthView component with day cells, event snippets, week numbers"
```

---

### Task 3: Wire MonthView into CalendarShell

**Files:**
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Import MonthView**

Add at the top of CalendarShell.tsx:
```typescript
import MonthView from './MonthView'
```

- [ ] **Step 2: Adjust fetchActivities date range for month view**

In `fetchActivities`, the `dateTo` calculation (~line 572-578) needs a month case. Add before the existing ternary:
```typescript
const dateTo = state.view === 'month'
  ? format(endOfMonth(parseISO(state.date)), 'yyyy-MM-dd')
  : state.view === '7day'
  ? format(addDays(parseISO(state.date), 6), 'yyyy-MM-dd')
  : state.view === '5day'
  ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
  : state.view === '3day'
  ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
  : state.date
```

Also adjust `dateFrom` for month view to include the grid start (Monday of the first week):
```typescript
const dateFrom = state.view === 'month'
  ? format(startOfWeek(parseISO(state.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  : state.date
```

Import `endOfMonth`, `startOfWeek` from date-fns if not already imported.

- [ ] **Step 3: Render MonthView when view is 'month'**

Replace the `<CalendarGrid ... />` section (~line 800) with a conditional:

```tsx
{state.view === 'month' ? (
  <MonthView
    activities={visibleActivities}
    date={state.date}
    holidays={holidays}
    personCode={state.selectedPersons[0]?.code ?? userCode}
    getActivityColor={colorForActivity}
    onSelectDate={(date) => setState(s => ({ ...s, view: 'day', date }))}
    onSelectWeek={(monday) => setState(s => ({ ...s, view: '7day', date: monday }))}
    onActivityClick={(activity) =>
      setFormState({
        open: true,
        initial: activity,
        editId: activity.id,
        canEdit: canEditActivity(activity)
      })
    }
  />
) : (
  <CalendarGrid
    ... (existing props)
  />
)}
```

- [ ] **Step 4: Adjust navigation step for month view**

In the `onNavigate` handler (~line 812), add month handling:
```typescript
onNavigate={(dir) => {
  if (state.view === 'month') {
    setState(s => ({
      ...s,
      date: format(
        dir === 'next' ? addMonths(parseISO(s.date), 1) : subMonths(parseISO(s.date), 1),
        'yyyy-MM-dd'
      ),
    }))
  } else {
    const step = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
    setState(s => ({
      ...s,
      date: format(
        dir === 'next' ? addDays(parseISO(s.date), step) : subDays(parseISO(s.date), step),
        'yyyy-MM-dd'
      ),
    }))
  }
}}
```

- [ ] **Step 5: Adjust prefetch for month view**

In the prefetch section (~line 720), skip prefetching for month view (the date range is already large):
```typescript
if (state.view !== 'month') {
  // existing prefetch logic
}
```

- [ ] **Step 6: Hide MonthNavigator overlay when in month view**

The MonthNavigator overlay would be redundant. In CalendarHeader.tsx or wherever MonthNavigator opens, don't open it when view is 'month'.

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v __tests__ | head -20
git add components/CalendarShell.tsx components/CalendarHeader.tsx
git commit -m "feat: wire MonthView into CalendarShell with month date range and navigation"
```

---

### Task 4: Deploy & Test

- [ ] **Step 1: Deploy to preview**

```bash
git checkout preview && git merge main --no-edit
vercel deploy
vercel alias set <url> herbe-calendar-test.vercel.app
git checkout main
```

- [ ] **Step 2: Test**

1. View selector shows "Month" option
2. Switching to Month shows full grid with day cells and events
3. Event snippets show colored dots + time + title
4. Clicking a day drills to day view
5. Clicking a week number drills to 7-day view
6. « » buttons navigate by month
7. Today is highlighted
8. Holidays show reddish background
9. Weekends show subtle background
10. Adjacent month days are dimmed
