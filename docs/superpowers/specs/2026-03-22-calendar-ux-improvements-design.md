# Calendar UX Improvements — Design Spec
**Date:** 2026-03-22

## Problem Statement

In real-life usage with busy days (many back-to-back activities), the calendar has three visual problems:

1. **Overlap layout bug** — sequential activities are squeezed to 50% width even when they don't overlap, making blocks unnecessarily narrow and text unreadable.
2. **Herbe/Outlook distinction** — difficult to tell which activities come from Herbe vs Outlook at a glance.
3. **Dense short blocks** — 15–30 min activities produce blocks too small to show useful text.

## Design Decisions

### 1. Overlap Layout Fix

**Current behavior:** `PersonColumn` divides all activities into sub-columns and gives every activity an equal fractional width based on the maximum number of concurrent lanes for the *entire day*. Result: if any two activities overlap at any point in the day, all activities in that column get squeezed.

**New behavior:** Use a two-pass *collision group + lane* algorithm. Group only activities that actually overlap each other in time into collision groups. Each collision group is laid out independently with its own lanes. Activities outside a collision group get 100% of the sub-column width.

**Overlap definition:** Two activities overlap if `timeToMinutes(a.timeTo) > timeToMinutes(b.timeFrom)` (strictly greater than). Back-to-back activities that merely touch (end time equals start time) are **not** considered overlapping and fall into separate collision groups.

**Algorithm (two passes):**

Pass 1 — Build collision groups (clusters of mutually overlapping activities):
1. Sort activities by `timeFrom`.
2. Sweep in order; maintain the current group's maximum end time.
3. If an activity's start time is strictly less than the current group's max end time (`timeToMinutes(act.timeFrom) < currentGroupMaxEnd`), it overlaps — add it to the current group and update `currentGroupMaxEnd`.
4. Otherwise, start a new collision group.

Pass 2 — Assign lanes within each collision group:
5. For each collision group, run the existing greedy lane-placement logic (find a lane whose last activity ends at or before this activity's start; if none, open a new lane).
6. Render each activity with `left = laneIndex / laneCount` and `right = (laneCount - laneIndex - 1) / laneCount`, expressed as percentages of the sub-column container.

### 2. Herbe / Outlook Dynamic Split

**Decision:** Dynamic split layout. Within each person's column:

- **Herbe only** (no Outlook events that day for this person): Herbe activities occupy 100% of the column width.
- **Outlook only** (no Herbe events): Outlook activities occupy 100% of the column width.
- **Both present:** Herbe sub-column on the left (60% width), Outlook sub-column on the right (40% width), with a thin visual separator.

**Source detection:** Determined at render time by inspecting `activity.source` in the `activities` prop. If all activities have `source === 'herbe'` → single Herbe column. If all have `source === 'outlook'` → single Outlook column. If both sources are present → split layout.

**Container structure:** Each sub-column must be rendered as a distinct `position: relative` container element (`width: 60%` / `width: 40%`). Collision group lane percentages from §1 are calculated relative to the sub-column container, not the outer person column. This ensures activity `left`/`right` arithmetic is always within the correct coordinate space.

**Slot clicks in the Outlook sub-column:** The Outlook sub-column background has `pointer-events: none`. Only Outlook activity blocks themselves have `pointer-events: auto`. This suppresses empty-slot clicks in the Outlook area — new activities can only be created by clicking the Herbe side, since Outlook events cannot be created from this app.

**Hour grid DOM structure:** The hour-row `<div>` elements (currently the shared background) move inside the Herbe sub-column's `position: relative` container. The Herbe sub-column therefore acts as the grid host: it holds the hour rows, the `handleSlotClick` handler, and the Herbe activity blocks. The Outlook sub-column is a sibling container holding only the Outlook activity blocks (with `pointer-events: none` on the container background). In single-source mode the existing structure is used unchanged with a single full-width container. This ensures `handleSlotClick`'s `offsetY` / `rect.height` calculation remains correct without modification.

The existing Outlook dashed border style is kept as a secondary signal.

The collision group algorithm (§1) applies independently within each sub-column.

### 3. Compact Blocks for Short Activities

**Decision:** When a block's computed pixel height is below **28px**, collapse to single-line layout:
- Show title (truncated, `flex-1`) and start time (right-aligned, `shrink-0`) on one row.
- Remove the second line (`timeFrom–timeTo · customerName`).
- Maintain the existing 20px minimum height (`Math.max(..., 20)` in current code).

**Threshold:** `height < 28` → compact single-line mode.

**Resize handle in compact mode:** When `height < 28`, reduce the resize handle from `h-2` (8px) to `h-1` (4px). This prevents the handle from occupying the majority of the block's tappable area at minimum height.

**Implementation:** `ActivityBlock` receives `height` as an explicit prop (currently computed internally via `Math.max(durationToPx(...), 20)`). The parent (`PersonColumn`) computes height when building activity display data and passes it down. When a drag is in progress, the parent uses the dragged `currentFrom`/`currentTo` to compute the display height, consistent with how `displayActivity` already overrides `timeFrom`/`timeTo` during drag. Derive `isCompact = height < 28` inside `ActivityBlock` and conditionally render the subtitle and handle size.

### 4. Activity Colors

**Decision:** Keep coloring by Herbe class group (current system). Fix the palette so class groups get perceptually distinct colors.

**Root cause:** `HERBE_COLOR_NAMES` maps "Sky Blue" → `#00ABCE` (cyan) and "Deep Forest" → `#4db89a` (teal) — both blue-green and hard to distinguish.

**Specific change:** In `lib/activityColors.ts`:
- Update `HERBE_COLOR_NAMES['Deep Forest']` from `#4db89a` to `#22c55e` (lime-green — clearly distinct from cyan).
- In `BRAND_PALETTE`, swap index 2 (`#4db89a` teal) with index 5 (`#22c55e` green), so the first 8 palette entries are: cyan → red → green → orange → violet → amber → blue → pink. This affects fallback color assignment for class groups with numeric `CalColNr` or unknown groups.

Note: `getActivityColor` uses `HERBE_COLOR_NAMES` for string-typed `CalColNr` values and `BRAND_PALETTE[idx]` only as a fallback for numeric `CalColNr` or overflow groups. The `HERBE_COLOR_NAMES` update is the primary change that affects real Herbe activity rendering.

Outlook activities keep `#6264a7` (Teams purple) — source is now also identified spatially by the right sub-column position.

## Files Affected

| File | Change |
|---|---|
| `components/PersonColumn.tsx` | Herbe/Outlook split sub-columns + two-pass collision group + lane algorithm |
| `components/ActivityBlock.tsx` | Compact single-line mode when `height < 28`; resize handle `h-1` in compact mode; accept explicit `height` prop |
| `lib/activityColors.ts` | Update `HERBE_COLOR_NAMES['Deep Forest']`; swap `BRAND_PALETTE` indices 2 and 5 |

## Non-Goals

- No changes to the time grid, row heights, or drag-and-drop logic.
- No new API endpoints.
- No changes to Outlook activity data fetching.
- Color customization UI (`ColorSettings`) remains as-is.

## Success Criteria

- Sequential activities (no time overlap) render at full sub-column width.
- On a day with both Herbe and Outlook events, Herbe is always on the left and Outlook on the right.
- 15-minute blocks are legible: title visible on a single line, resize handle does not dominate the block.
- Different class groups are visually distinguishable by color at a glance.
- Clicking an empty slot in the Outlook sub-column does not open the new-activity form.
