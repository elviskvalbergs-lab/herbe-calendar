# UX Improvements: Zoom, ICS Co-fetch, Light Mode Contrast

**Date**: 2026-03-30
**Branch**: feature/calendar-ux-improvements

## 1. Zoom Toggle

### Problem
Short activities (5–15 min) are nearly impossible to tap on mobile or click on desktop when stacked. The fixed 56px/hour grid leaves no room to interact with them.

### Design
Two zoom states: **Normal (1x, 56px/hour)** and **Zoomed (2x, 112px/hour)**.

**State management**:
- Stored in `localStorage('calendarZoom')` as `1` or `2`
- Read on mount, default to `1`
- Passed as `scale` factor through the component tree

**lib/time.ts changes**:
- Export a `scaledPxPerHour(scale)` helper, or accept `scale` as parameter to `timeToTopPx`, `durationToPx`, `pxToMinutes`
- Keep `PX_PER_HOUR = 56` as the base constant

**Component changes**:
- `CalendarShell.tsx`: Own the `zoom` state, read/write localStorage, pass down as prop
- `CalendarHeader.tsx`: Add zoom toggle button (magnifier icon) on desktop. Hotkey: `Z`
- `TimeColumn.tsx`: Replace `h-14` with inline `style={{ height: 56 * scale }}`
- `PersonColumn.tsx`: Same — replace `h-14` with dynamic height. Pass scale to `durationToPx` calls
- `ActivityBlock.tsx`: Receives already-computed height, no changes needed
- **Mobile**: Add zoom toggle button next to the floating "+" (Add new) button in CalendarShell

**Scroll preservation**: After toggling zoom, maintain the user's scroll position proportionally (multiply scrollTop by the scale ratio).

## 2. Fix ICS + Outlook Co-fetching

### Problem
In `/api/outlook/route.ts`, when an ICS subscription exists for a person, the code returns early and skips the Graph API. This means:
- User EKS added an ICS subscription for themselves — their Outlook events disappeared
- Both ICS and Outlook events should show for the same person

### Design
For each person code in the request:
1. Look up ICS subscription (`user_calendars` table)
2. Look up Graph API email (`emailForCode`)
3. Run both fetches in parallel (`Promise.all`)
4. Merge results, dedup by time+title if needed (ICS and Outlook may overlap for the same calendar)
5. Return combined array

The ICS subscription check changes from an `if/else` (either ICS or Graph) to a `Promise.all` (both).

### BKS visibility
ICS subscriptions are scoped by `user_email` — only the user who added the subscription sees those events. This is correct behavior. Debug if BKS events aren't showing: check date filtering in `fetchIcsEvents`, timezone handling, and whether the ICS URL is actually returning events for the requested date range.

## 3. Light Mode Contrast

### Problem
Activity block fills use low-opacity hex suffixes (`'1a'` = 10%, `'33'` = 20%) that are designed for dark backgrounds. On light backgrounds they wash out, making text hard to read.

### Design
Detect light mode in `ActivityBlock.tsx` and apply stronger opacity values:

| Property | Dark mode | Light mode |
|----------|-----------|------------|
| Block fill (normal) | `color + '33'` (20%) | `color + '55'` (33%) |
| Block fill (planned) | `color + '1a'` (10%) | `color + '33'` (20%) |
| Block fill (CC) | `color + '0a'` (4%) | `color + '1a'` (10%) |
| Border left | `3px solid ${color}` | `3px solid ${color}` (unchanged) |
| Text color | `color` (direct) | `color` with darker fallback if luminance > 0.7 |

**Detection method**: Read `document.documentElement.dataset.theme === 'light'` or pass `isLightMode` prop from CalendarShell (which already tracks theme state).

Dark mode stays completely unchanged.

## Files to Modify

| File | Change |
|------|--------|
| `lib/time.ts` | Add scale parameter to pixel conversion functions |
| `components/CalendarShell.tsx` | Zoom state management, localStorage, pass scale + theme props |
| `components/CalendarHeader.tsx` | Zoom toggle button, `Z` hotkey |
| `components/CalendarGrid.tsx` | Pass scale through to TimeColumn and PersonColumn |
| `components/TimeColumn.tsx` | Dynamic hour row height |
| `components/PersonColumn.tsx` | Dynamic hour row height, pass scale to px calculations |
| `components/ActivityBlock.tsx` | Light mode contrast adjustments |
| `app/api/outlook/route.ts` | Parallel ICS + Graph API fetching |
