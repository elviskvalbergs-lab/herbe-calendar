# Mobile UX Batch 3 — Implementation Design

**Goal:** Ten incremental UX improvements covering mobile layout, gesture interaction, smart defaults, and recently-used shortcuts.

**Architecture:** All changes are client-side only. Persistence via `localStorage`. No new API endpoints. Touches `types/index.ts`, `components/CalendarHeader.tsx`, `components/CalendarGrid.tsx`, `components/CalendarShell.tsx`, and `components/ActivityForm.tsx`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind v4, localStorage.

---

## Feature 1 — 5-Day View

Add `'5day'` to the `CalendarState['view']` union in `types/index.ts`.

In `CalendarGrid`, extend the dates array: `'5day'` generates 5 consecutive dates from the anchor date (same pattern as `'3day'` which generates 3).

In `CalendarHeader`, add a "5 Day" button to the existing view toggle group alongside "Day" and "3 Day".

In `CalendarShell`, wherever `state.view === '3day'` is used to calculate `step` or `dateTo`, also handle `'5day'` (step = 5, dateTo = anchor + 4 days).

---

## Feature 2 — Hamburger Menu on Mobile (Palette + Shortcuts)

On mobile (`sm:hidden`), replace the standalone `?` (shortcuts) and color-palette icon buttons in `CalendarHeader` with a single `☰` hamburger button.

Clicking it opens a small dropdown anchored below the button containing two items:
- "🎨 Color settings" → calls `onColorSettings()`
- "⌨️ Keyboard shortcuts" → calls `onShortcuts()`

The dropdown closes on outside click (use a `useEffect` click listener or an invisible backdrop div). On desktop (`hidden sm:flex`), the original individual buttons remain unchanged.

---

## Feature 3 — Floating Action Button (FAB)

Add a `fixed bottom-5 right-5 z-50` FAB button in `CalendarShell`, visible only on mobile (`sm:hidden`).

The button shows `+ New`, uses the same `bg-primary text-white` styling as the header button, with a larger touch target (`px-4 py-3 rounded-2xl shadow-lg`).

Hidden (via conditional render) when `formState.open` is true so it doesn't overlap the modal. Calls `onNewActivity` / `setFormState` the same way as the header button.

---

## Feature 4 — Time Fields Tighter on Mobile

The existing `grid grid-cols-3 gap-1` row with Date / From / To inputs stays as a single row on all screen sizes.

Reduce mobile padding and font size:
- Inputs: `px-1 py-1.5 text-xs sm:px-2 sm:py-2 sm:text-sm`
- Labels: `text-[10px] sm:text-xs`

This recovers enough horizontal space that all three fields are readable without wrapping.

---

## Feature 5 — X Clear Buttons on Text Inputs

For every text input that has an associated clearable value, show a small `×` button inside the field on the right when the value is non-empty.

Fields covered:
- **Description** — clears `description`
- **Activity Type** — clears `activityTypeName` + `activityTypeCode` + `currentGroup` + `activityTypeResults`
- **Project** — clears `projectName` + `projectCode` + `projectResults`
- **Customer** — clears `customerName` + `customerCode` + `customerResults`
- **Item Code** — clears `itemCode`
- **Additional Text** — clears `textInMatrix`

Implementation: wrap each input in `relative`, render a `×` button with `absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs`. For fields that already use `pr-8` (for the spinner), the `×` replaces/sits left of it, or conditionally appears only when not searching.

---

## Feature 6 — Swipe-Down Drag-to-Dismiss Modal

Replace the current horizontal-only swipe tracking with a full drag-to-dismiss gesture.

**State:** Replace `swipeX` ref with `swipeStart = { x, y }` ref. Add a `dragY` state (number, 0 by default) that drives a CSS transform on the modal container.

**Interaction:**
- `onTouchStart`: record `{ x: touches[0].clientX, y: touches[0].clientY }`
- `onTouchMove`: compute `dy = currentY - startY`. If `dy > 0` (downward), set `dragY = dy`. Apply `transform: translateY(${dragY}px)` and `transition: none` to the modal div. Fade the backdrop opacity proportionally: `opacity = max(0, 0.6 - dy / 400)`.
- `onTouchEnd`:
  - If `dy > 80`: set `dragY` to window height (slide out), then call `onClose` after 200ms.
  - Otherwise: reset `dragY` to 0 with `transition: transform 0.25s` (spring back).
- Horizontal left-swipe (existing behaviour) remains — if `|dx| > |dy|` and `dx < -80`, close.

The modal div gets `style={{ transform: \`translateY(${dragY}px)\`, transition: dragY === 0 ? 'transform 0.25s' : 'none' }}`.

---

## Feature 7 — Auto-Start Time: Exclude Planned + Check mainPersons

Update `smartDefaultStart()` in `ActivityForm`:

```ts
function smartDefaultStart(hint?: string): string {
  if (hint) return hint
  const todayForPerson = todayActivities
    .filter(a =>
      !a.planned &&
      (a.personCode === defaultPersonCode || a.mainPersons?.includes(defaultPersonCode))
    )
    .sort((a, b) => b.timeTo.localeCompare(a.timeTo))
  return todayForPerson[0]?.timeTo ?? '09:00'
}
```

Pass `savedActivity?.timeTo` as `hint` inside `resetToCreate(null)` so "Create blank" picks up the just-saved activity's end time immediately, without waiting for the activities refetch to complete.

---

## Feature 8 — Clock Button Next to "From" Label

Add a small `⏱` icon button inline with the "From" label, visible only in create mode (`!isEdit`).

Clicking it calls `setTimeFrom(smartDefaultStart())` at click time (recalculates from current `todayActivities`).

Tooltip: `"Set to end of last activity"`. Styling: `text-text-muted hover:text-primary text-xs`, no border, `tabIndex={-1}`.

---

## Feature 9 — Recent Activity Types as Shortcut Chips

**Storage:** `localStorage` key `recentActivityTypes` — JSON array of up to 6 activity type codes, newest first.

**Update on save:** In `handleSave`, before calling `onSaved()`, if `activityTypeCode` is non-empty, prepend it to the stored array, deduplicate, and slice to 6.

**Display:** Below the "Activity Type" label, above the text input, render a row of chip buttons (same style as duration chips) for each recent code that exists in `activityTypes`. Show only when `activityTypeName` is empty (i.e. no type committed yet). Each chip shows the code, colored with `getTypeColor`, and on click sets `activityTypeCode`, `activityTypeName`, `currentGroup`, and clears results — identical to selecting from the dropdown.

**Helper:** Extract `loadRecentActivityTypes(): string[]` and `saveRecentActivityTypes(codes: string[]): void` into `lib/recentItems.ts` (shared with Feature 10).

---

## Feature 10 — Recent Persons Reordered to Top

**Storage:** `localStorage` key `recentPersons` — JSON array of up to 6 person codes, newest first.

**Update on save:** In `handleSave`, prepend all `selectedPersonCodes` to the stored array, deduplicate, slice to 6.

**Display:** In the persons chip section, reorder the unselected persons list:
1. Recent persons (from `recentPersons`, filtered to those in `people` and not already selected)
2. Remaining people alphabetically by code

Selected chips are unaffected. No visual distinction between recent and non-recent unselected — they just appear first.

---

## Files Changed

| File | Change |
|------|--------|
| `types/index.ts` | Add `'5day'` to view union |
| `lib/recentItems.ts` | New: `loadRecent` / `saveRecent` helpers |
| `components/CalendarHeader.tsx` | 5-day button, hamburger menu on mobile |
| `components/CalendarGrid.tsx` | Handle `'5day'` dates array |
| `components/CalendarShell.tsx` | FAB, `'5day'` step/dateTo logic |
| `components/ActivityForm.tsx` | Features 4–10 |

---

## Out of Scope

- Server-side recent items storage
- Cross-device sync
- Animations beyond the swipe-down exit
