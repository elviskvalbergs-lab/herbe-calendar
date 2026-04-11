# Month Navigator & 7-Day View Design

## Summary

Replace the native date picker with a month calendar overlay that serves as a navigation tool. Add 7-day view to the existing 1/3/5-day selector. The month overlay shows source-colored dots (mobile) or event titles (desktop) and allows quick navigation by date or week number. A new lightweight summary API aggregates activity presence per day for fast rendering.

## Decisions

- **Month view is a navigator, not a separate view.** It opens as an overlay and returns you to a day-based view (1/3/5/7).
- **Multi-person in month overlay:** Shows combined data for all selected people (dots/titles from all sources).
- **Activity dots on mobile:** One colored dot per source that has events on that day (max ~4 dots: ERP, Outlook, Google, ICS).
- **Desktop:** Show compact event titles stacked per day (like Apple Calendar month view).
- **Week numbers:** Shown on the left side. Clicking a week number navigates to that week in 7-day view.
- **Performance:** New summary endpoint returns dates + sources only, cached server-side.

## View Selector Changes

Current: dropdown with `1 day`, `3 days`, `5 days`
New: dropdown with `1 day`, `3 days`, `5 days`, `7 days`

The 7-day view uses the same person-column grid as 3/5-day — just wider. Week starts on Monday (consistent with existing behavior). The `state.view` type extends from `'day' | '3day' | '5day'` to include `'7day'`.

## Month Calendar Overlay

### Trigger

Clicking the date display in CalendarHeader (currently opens native date picker) opens the month overlay instead.

### Layout

```
┌──────────────────────────────────┐
│  ‹  April 2026  ›    [Year ▾]   │
├──────────────────────────────────┤
│  W  │ Mo Tu We Th Fr Sa Su      │
├─────┼────────────────────────────┤
│ 14  │  .  .  .  .  .  .  .      │
│ 15  │  .  .  .  .  .  .  .      │
│ 16  │  .  .  .  .  .  .  .      │
│ 17  │  .  .  .  .  .  .  .      │
│ 18  │  .  .  .  .  .  .  .      │
└─────┴────────────────────────────┘
```

- **Month/year navigation:** `‹` and `›` arrows cycle months. Year dropdown for quick jumps.
- **Week numbers (W column):** Clickable — navigates to that week in 7-day view.
- **Date cells:**
  - **Mobile:** Show colored dots below the date number (one per source with events).
  - **Desktop:** Show 1-3 truncated event titles with source colors, "+N more" if overflow.
  - **Today** highlighted (ring/background).
  - **Selected date range** highlighted (the current N-day view range).
  - Click a date → close overlay, navigate to that date in current view.
- **Outside-month dates:** Shown dimmed (for grid completeness).

### Behavior

- Opens as a modal/overlay (not a full page).
- ESC or click outside closes it.
- Swipe left/right changes month (mobile).
- Closing without selecting preserves current date.
- When navigating months, the summary data is fetched/cached per month.

## Summary API

### `GET /api/activities/summary`

Returns a lightweight map of dates → active sources for a given month and person set.

**Query params:**
- `persons` — comma-separated person codes
- `month` — `YYYY-MM` format
- `accountId` — (derived from session)

**Response:**
```json
{
  "2026-04-01": { "sources": ["herbe", "outlook"], "count": 5 },
  "2026-04-02": { "sources": ["herbe"], "count": 2 },
  "2026-04-10": { "sources": ["herbe", "outlook", "google"], "count": 8 }
}
```

Only dates with activities are included (sparse map). `count` is total event count for the day. `sources` is the deduplicated list of sources that have events.

**Implementation:**
- Fetches from all configured sources for the full month range (1st to last day).
- For ERP: uses existing `fetchErpActivities` but only extracts date + source.
- For Outlook/Google: fetches calendar views but only extracts date + source.
- For per-user Google: includes those too.
- Caches the result in-memory per `(persons, month, accountId)` with 5-minute TTL.

**Desktop enhancement:** For the desktop month view (which shows event titles), the overlay fetches full activity data for the visible month. This reuses the existing `/api/activities`, `/api/outlook`, `/api/google` endpoints. The summary endpoint is used only for the dots on mobile.

## Component Structure

### `MonthNavigator` (new component)

```
components/MonthNavigator.tsx
```

Props:
- `open: boolean`
- `currentDate: string` — currently selected date (YYYY-MM-DD)
- `currentView: '1day' | '3day' | '5day' | '7day'`
- `persons: string[]` — selected person codes
- `onSelectDate: (date: string) => void` — click date
- `onSelectWeek: (mondayDate: string) => void` — click week number
- `onClose: () => void`

Internal state:
- `displayMonth: string` — YYYY-MM being shown
- `summary: Record<string, { sources: string[]; count: number }>` — fetched data
- `loading: boolean`

### CalendarHeader changes

- Remove the hidden `<input type="date">` and `dateInputRef`
- Date button onClick: toggle `MonthNavigator` open state
- Add `MonthNavigator` component with appropriate props

### CalendarShell changes

- Add `'7day'` to the view type
- Update date range calculation for 7-day view (Monday to Sunday)
- Pass `onSelectWeek` handler that sets view to `'7day'` and date to the Monday

## Keyboard Shortcuts

Extend existing keyboard shortcuts:
- `7` key → switch to 7-day view (following existing `1`, `3`, `5` pattern)
- Arrow keys in month overlay → navigate dates (if implemented, optional)

## Scope

### In scope
- 7-day view (extends existing grid)
- Month calendar overlay (navigation tool)
- Summary API with caching
- Source-colored dots (mobile)
- Event title previews (desktop)
- Week number navigation
- Month/year quick navigation
- ESC/click-outside to close
- Keyboard shortcut for 7-day view

### Out of scope
- Month as a standalone view (with person columns)
- Multi-month view
- Drag-and-drop in month overlay
- Activity creation from month overlay
- Push-based cache invalidation (polling/TTL only)
