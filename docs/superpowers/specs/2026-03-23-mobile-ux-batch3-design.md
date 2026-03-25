# Mobile UX Batch 3 — Implementation Design

**Goal:** Ten incremental UX improvements covering mobile layout, gesture interaction, smart defaults, and recently-used shortcuts.

**Architecture:** All changes are client-side only. Persistence via `localStorage`. No new API endpoints. Touches `types/index.ts`, `components/CalendarHeader.tsx`, `components/CalendarGrid.tsx`, `components/CalendarShell.tsx`, and `components/ActivityForm.tsx`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Tailwind v4, localStorage.

---

## Feature 1 — 5-Day View

Add `'5day'` to the `CalendarState['view']` union in `types/index.ts`.

In `CalendarGrid`, extend the dates array: `'5day'` generates 5 consecutive dates from the anchor date (same pattern as `'3day'` which generates 3).

In `CalendarHeader`, extend the view toggle array from `(['day', '3day'] as const)` to `(['day', '3day', '5day'] as const)` and update the label expression:
```ts
v === 'day' ? 'Day' : v === '3day' ? '3 Day' : '5 Day'
```

In `CalendarShell`, search for **all** occurrences of `=== '3day'` (there are three: the keyboard shortcut handler, the `fetchActivities` `dateTo` calculation, and the `onNavigate` prop inline handler) and update each to also handle `'5day'` (step = 5, dateTo = anchor + 4 days).

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
- **Item Code** — clears `itemCode`. Note: the Item Code field only renders when `currentGroup?.forceItem || itemCode`. Clearing via `×` when `!forceItem` will unmount the field immediately — this is acceptable; the field was optional and the user explicitly cleared it.
- **Additional Text** — clears `textInMatrix`

Implementation: wrap each input in `relative`. For fields **without** a spinner (description, activity type, item code): render the `×` button as `absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs`, and add `pr-7` to the input.

For fields **with** a spinner (project, customer): the `×` button is only shown when **not** actively searching (`!searchingProjects` / `!searchingCustomers`). When shown, it uses the same `absolute right-2 top-1/2 -translate-y-1/2` position — the spinner and the `×` are mutually exclusive so no padding change is needed beyond the existing `pr-8`.

**Exception:** The Additional Text field uses a `<textarea>` (not `<input>`). For this field, position the `×` button `absolute right-2 top-2` (top-aligned, not vertically centred) to avoid it floating in the middle of a multi-line field.

---

## Feature 6 — Swipe-Down Drag-to-Dismiss Modal

Replace the current horizontal-only swipe tracking with a full drag-to-dismiss gesture.

**State:** Replace `swipeX` ref with `swipeStart = { x, y }` ref. Add a `dragY` state (number, 0 by default) that drives a CSS transform on the modal container.

**State:** Add:
- `dragY` React state (number, default 0) — drives the CSS transform for rendering
- `dragYRef` ref (`useRef(0)`) — mirrors `dragY` and is updated synchronously in `onTouchMove` alongside the state setter. Read this ref (not the state) in `onTouchEnd` to avoid stale closure issues with React 18 batched state updates.
- `dismissing` ref (`useRef(false)`) — set to `true` when the dismiss threshold is crossed, enables the slide-out transition.
- `snappingBack` ref (`useRef(false)`) — set to `true` in `onTouchEnd` before calling `setDragY(0)`, enables the spring-back transition from the very first frame. Cleared in `onTransitionEnd`.

**Interaction:**
- `onTouchStart`: record `{ x: touches[0].clientX, y: touches[0].clientY }`. Reset `dismissing.current = false`.
- `onTouchMove`: compute `dy = currentY - startY`. If `dy > 0` (downward), update both `dragYRef.current = dy` and `setDragY(dy)`. The backdrop uses `style={{ opacity: Math.max(0, 0.6 - dy / 400) }}` (inline style on the backdrop div, replacing the `bg-black/60` Tailwind class so the entire alpha is controlled — use `background: 'rgb(0 0 0 / ' + Math.max(0, 0.6 - dy / 400) + ')'`).
- `onTouchEnd`:
  - Read `dragYRef.current` (not `dragY` state — avoid stale closure). If `dragYRef.current > 80`: set `dismissing.current = true`, call `setDragY(window.innerHeight)` (triggers slide-out transition), then call `onCloseRef.current()` after 220ms via `setTimeout`. Use `onCloseRef.current` (the existing stable ref), not the `onClose` prop directly, to avoid a stale closure in the timeout callback.
  - Otherwise: set `snappingBack.current = true`, set `dragYRef.current = 0`, call `setDragY(0)`.
- Horizontal left-swipe (existing behaviour) remains — if `|dx| > |dy|` and `dx < -80`, close.

Add a third boolean ref: `snappingBack = useRef(false)`. Do **not** infer the spring-back state from `dragY === 0` — that condition would be true one render too late, causing a visible jump on the first frame. Instead, set `snappingBack.current` explicitly in `onTouchEnd` before calling `setDragY(0)`.

**Modal div style:**
```ts
style={{
  transform: `translateY(${dragY}px)`,
  transition: dismissing.current || snappingBack.current ? 'transform 0.22s' : 'none',
  willChange: 'transform',
}}
onTransitionEnd={() => { snappingBack.current = false; dismissing.current = false }}
```
This ensures: (a) live drag has no transition (smooth tracking), (b) spring-back animates cleanly from the first frame, (c) dismiss slide-out animates. `willChange: 'transform'` promotes the element to its own compositor layer so drag remains smooth despite per-pixel React re-renders from `setDragY`.

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

Update `resetToCreate` to accept an optional second parameter `hint?: string`, and pass `savedActivity?.timeTo` from the "Create blank" button call site:

```ts
function resetToCreate(copy: Partial<Activity> | null, hint?: string) { ... }
// in the success screen:
onClick={() => resetToCreate(null, savedActivity?.timeTo ?? undefined)}
```

Inside `resetToCreate`, the `hint` is only used in the `else` branch (blank create). The `copy` branch always sets `setTimeFrom('')` and is unaffected. Concretely:
```ts
} else {
  setTimeFrom(smartDefaultStart(hint))  // hint only here, not in the copy branch
  setTimeTo('')
}
```

---

## Feature 8 — Clock Button Next to "From" Label

Add a small `⏱` icon button inline with the "From" label, visible only in create mode (`!isEdit`).

Clicking it calls `setTimeFrom(smartDefaultStart())` at click time (recalculates from current `todayActivities`).

Tooltip: `"Set to end of last activity"`. Styling: `text-text-muted hover:text-primary text-xs`, no border, `tabIndex={-1}`.

---

## Feature 9 — Recent Activity Types as Shortcut Chips

**Storage:** `localStorage` key `recentActivityTypes` — JSON array of up to 6 activity type codes, newest first.

**Update on save:** In `handleSave`, before calling `onSaved()`, if `activityTypeCode` is non-empty, prepend it to the stored array, deduplicate, and slice to 6.

**Display:** This chip row is rendered inside the existing `source === 'herbe'` guard (activity types are Herbe-only). Place it below the "Activity Type" label, above the text input. Show chips for each recent code that exists in `activityTypes`. Show only when `activityTypeName` is empty **and** `activityTypeResults.length === 0` (i.e. no committed type and dropdown is not open). This prevents chips overlapping with the search dropdown during typing. Each chip shows the code, colored with `getTypeColor`, and on click sets `activityTypeCode`, `activityTypeName`, `currentGroup`, and clears results — identical to selecting from the dropdown.

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
