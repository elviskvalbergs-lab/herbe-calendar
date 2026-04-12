# Month View Design Spec

## Goal

Add a full Apple Calendar-style month grid view as a new view mode. Shows colored event blocks per day cell with multi-day events spanning across cells. Available for single-person view. Tapping a day drills down to day view.

## Constraints

- Only shown when one person is selected (if multiple persons, the view selector doesn't offer "month" or auto-selects the first person)
- Must work on mobile (portrait) — compact day cells
- Data: fetches all activities for the visible month (reuse existing fetch patterns)
- No new API endpoints needed — the existing `/api/activities`, `/api/outlook`, `/api/google` endpoints already accept `dateFrom`/`dateTo` ranges

## View Mode

Add `'month'` to the `CalendarState.view` union type: `'day' | '3day' | '5day' | '7day' | 'month'`

The view selector dropdown in `CalendarHeader.tsx` shows "Month" as an option. When selected, `state.date` anchors to the first day of the month.

## Layout

### Grid Structure

```
┌──────────────────────────────────────────────────┐
│  Mon    Tue    Wed    Thu    Fri    Sat    Sun    │  ← day headers
├──────────────────────────────────────────────────┤
│ [multi-day event bar spanning across cells]       │  ← multi-day event rows
├──────────────────────────────────────────────────┤
│  1       2      3      4      5      6      7    │
│ ┌─────┐                    ┌─────┐               │
│ │ Mtg │        ┌───┐       │ 1:1 │               │  ← timed events
│ └─────┘        │Wk │       └─────┘               │
│                └───┘                              │
├──────────────────────────────────────────────────┤
│  8       9     10     11     12     13     14    │
│ ...                                               │
└──────────────────────────────────────────────────┘
```

### Day Cell

Each day cell shows:
1. Day number (top-left, bold for current month, muted for adjacent months)
2. Up to 3-4 event snippets (colored dot + truncated title)
3. "+N more" if there are more events than fit
4. Holiday background (reuse existing holiday data)
5. Weekend background (subtle, like existing views)
6. Today: highlighted border or background

### Multi-Day Events

Events where `isAllDay === true` or that span multiple days render as horizontal bars at the top of the week row, above the timed events. They span across day cells with the event title in the first cell. Color matches the source color.

Multi-day bars are laid out in rows — if multiple multi-day events overlap, they stack vertically.

### Event Appearance

- Each event snippet: small colored dot (source color) + event title truncated to fit
- Font: text-[10px] or text-[9px] depending on space
- "Busy" events (from shared calendars): show as gray blocks
- Compact — maximize information density

## Navigation

- Month/year shown in header (same format as MonthNavigator)
- Left/right arrows navigate by month
- The MonthNavigator overlay is hidden when in month view (redundant)
- Week numbers column on the left (like MonthNavigator) — clicking a week number switches to 7-day view for that week

## Data Fetching

When view is `'month'`:
- `dateFrom` = first day of month (or first Monday of the grid, to include partial prev month)
- `dateTo` = last day of month (or last Sunday of the grid)
- Fetch from all three sources (ERP, Outlook, Google) using the same parallel pattern as other views
- Progressive loading works the same way

## Interaction

- Tap a day cell → switch to `'day'` view for that date
- Tap an event → open activity preview (same as other views)
- Swipe left/right → navigate months (same gesture pattern as other views)
- Week number click → switch to 7-day view starting on that Monday

## Component Structure

### New: `components/MonthView.tsx`

The main month grid component. Receives:
- `activities: Activity[]` — all activities for the visible date range
- `date: string` — the anchor date (first of month)
- `holidays: HolidayData`
- `onSelectDate: (date: string) => void` — drill to day view
- `onSelectWeek: (monday: string) => void` — drill to 7-day view
- `getActivityColor: (activity: Activity) => string`

### Modified: `types/index.ts`

Add `'month'` to `CalendarState.view`.

### Modified: `components/CalendarShell.tsx`

- When view is `'month'`, render `MonthView` instead of `CalendarGrid`
- Adjust `fetchActivities` date range for month view
- Hide MonthNavigator when in month view

### Modified: `components/CalendarHeader.tsx`

- Add "Month" to view selector dropdown
- When month view is active, person selector limits to 1 person (or shows a note)

### Modified: `components/CalendarGrid.tsx`

No changes — month view uses a different component entirely.

## Edge Cases

- Person with 0 activities in a month: show empty grid with day numbers
- Very busy days (10+ events): show first 3-4, then "+N more"
- Multi-day events crossing month boundaries: show the portion visible in the current grid
- Adjacent month days (grayed out): still show events but with reduced opacity
