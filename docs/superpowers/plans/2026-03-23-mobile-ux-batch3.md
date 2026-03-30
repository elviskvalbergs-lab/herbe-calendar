# Mobile UX Batch 3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 10 UX improvements: 5-day view, mobile hamburger menu, FAB, tighter time fields, clear buttons, swipe-down dismiss, smart start-time fixes, clock button, recent activity type chips, and recent persons ordering.

**Architecture:** All changes are client-side. New `lib/recentItems.ts` holds localStorage helpers shared by ActivityForm. No new API endpoints. Each task is independently deployable.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Tailwind v4, localStorage.

**Spec:** `docs/superpowers/specs/2026-03-23-mobile-ux-batch3-design.md`

**No automated test suite** — verification is manual browser testing on `npm run dev`.

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `types/index.ts` | Modify | Add `'5day'` to view union |
| `lib/recentItems.ts` | **Create** | localStorage helpers for recent types + persons |
| `components/CalendarHeader.tsx` | Modify | 5-day button, hamburger menu |
| `components/CalendarGrid.tsx` | Modify | `'5day'` dates array |
| `components/CalendarShell.tsx` | Modify | FAB, `'5day'` step/dateTo in 3 places |
| `components/ActivityForm.tsx` | Modify | Features 4–10 |

---

## Task 1: 5-Day View — Types + Grid + Header + Shell

**Files:**
- Modify: `types/index.ts:55`
- Modify: `components/CalendarGrid.tsx:40-44`
- Modify: `components/CalendarHeader.tsx:49-57`
- Modify: `components/CalendarShell.tsx:105,218-223,293-300`

- [ ] **Step 1: Add `'5day'` to the view union in `types/index.ts`**

  Current line 55:
  ```ts
  view: 'day' | '3day'
  ```
  Change to:
  ```ts
  view: 'day' | '3day' | '5day'
  ```

- [ ] **Step 2: Handle `'5day'` in CalendarGrid dates array**

  In `components/CalendarGrid.tsx`, the dates block (around line 40) currently reads:
  ```ts
  const dates = state.view === 'day'
    ? [state.date]
    : Array.from({ length: 3 }, (_, i) =>
        format(addDays(parseISO(state.date), i), 'yyyy-MM-dd')
      )
  ```
  Change to:
  ```ts
  const viewDays = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
  const dates = viewDays === 1
    ? [state.date]
    : Array.from({ length: viewDays }, (_, i) =>
        format(addDays(parseISO(state.date), i), 'yyyy-MM-dd')
      )
  ```

- [ ] **Step 3: Add 5-day button to CalendarHeader view toggle**

  In `components/CalendarHeader.tsx`, change the toggle array and label (around line 49):
  ```tsx
  {(['day', '3day', '5day'] as const).map(v => (
    <button
      key={v}
      onClick={() => onStateChange({ ...state, view: v })}
      className={`px-3 py-1 ${state.view === v ? 'bg-primary text-white' : 'text-text-muted'}`}
    >
      {v === 'day' ? 'Day' : v === '3day' ? '3 Day' : '5 Day'}
    </button>
  ))}
  ```

- [ ] **Step 4: Update all three `=== '3day'` step calculations in CalendarShell**

  Search `components/CalendarShell.tsx` for all three occurrences of `state.view === '3day'`:

  **Occurrence 1** — keyboard shortcut step (around line 105):
  ```ts
  // Before:
  const step = state.view === '3day' ? 3 : 1
  // After:
  const step = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
  ```

  **Occurrence 2** — `fetchActivities` dateTo (around line 218):
  ```ts
  // Before:
  const dateTo = state.view === '3day'
    ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
    : state.date
  // After:
  const dateTo = state.view === '5day'
    ? format(addDays(parseISO(state.date), 4), 'yyyy-MM-dd')
    : state.view === '3day'
    ? format(addDays(parseISO(state.date), 2), 'yyyy-MM-dd')
    : state.date
  ```

  **Occurrence 3** — `onNavigate` prop handler (around line 293):
  ```ts
  // Before:
  const step = state.view === '3day' ? 3 : 1
  // After:
  const step = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
  ```

- [ ] **Step 5: Verify in browser**

  Run `npm run dev`, open the app, confirm:
  - "5 Day" button appears in the view toggle
  - Clicking it shows 5 columns of days
  - Arrow keys advance/retreat 5 days at a time
  - Activities fetch covers the full 5-day range

- [ ] **Step 6: Commit**
  ```bash
  git add types/index.ts components/CalendarGrid.tsx components/CalendarHeader.tsx components/CalendarShell.tsx
  git commit -m "feat: add 5-day calendar view"
  ```

---

## Task 2: Hamburger Menu on Mobile

**Files:**
- Modify: `components/CalendarHeader.tsx`

The hamburger replaces the `?` and color-palette buttons on mobile only. On desktop (`hidden sm:flex`) the original buttons stay.

- [ ] **Step 1: Add hamburger state to CalendarHeader**

  At the top of the `CalendarHeader` component, add a state variable alongside the existing `selectorOpen`:
  ```tsx
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  ```

- [ ] **Step 2: Replace the mobile buttons with the hamburger**

  The existing `?` button and color-palette button currently have no responsive class — they show on all screen sizes. Wrap them each in `hidden sm:block` so they only show on desktop:
  ```tsx
  {/* Keyboard shortcuts — desktop only */}
  <button
    onClick={onShortcuts}
    className="hidden sm:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm font-bold"
    title="Keyboard shortcuts (?)"
  >
    ?
  </button>

  {/* Color settings — desktop only */}
  <button
    onClick={onColorSettings}
    className="hidden sm:block text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
    title="Activity colors &amp; theme"
  >
    <svg ...existing svg.../>
  </button>
  ```

- [ ] **Step 3: Add hamburger button + dropdown for mobile**

  Immediately after the color-palette button, add:
  ```tsx
  {/* Hamburger — mobile only */}
  <div className="relative sm:hidden">
    <button
      onClick={() => setHamburgerOpen(o => !o)}
      className="text-text-muted px-2 py-1.5 rounded-lg hover:bg-border text-sm"
      title="Menu"
    >
      ☰
    </button>
    {hamburgerOpen && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setHamburgerOpen(false)} />
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
          <button
            onClick={() => { setHamburgerOpen(false); onColorSettings() }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-border"
          >
            🎨 Color settings
          </button>
          <button
            onClick={() => { setHamburgerOpen(false); onShortcuts() }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-border"
          >
            ⌨️ Keyboard shortcuts
          </button>
        </div>
      </>
    )}
  </div>
  ```

- [ ] **Step 4: Verify in browser**

  At mobile width (≤640px):
  - `?` and palette buttons are hidden
  - `☰` button is visible
  - Tapping it opens the dropdown with both options
  - Tapping an option closes the dropdown and opens the correct modal
  - Tapping outside closes the dropdown

  At desktop width (>640px):
  - `?` and palette buttons are visible
  - `☰` is hidden

- [ ] **Step 5: Commit**
  ```bash
  git add components/CalendarHeader.tsx
  git commit -m "feat: hamburger menu for mobile (replaces separate palette/shortcuts buttons)"
  ```

---

## Task 3: Floating Action Button (FAB)

**Files:**
- Modify: `components/CalendarShell.tsx`

- [ ] **Step 1: Add FAB to CalendarShell JSX**

  In `components/CalendarShell.tsx`, inside the outermost `<div className="flex flex-col h-screen...">`, add the FAB just before the closing `</div>`. Place it after all modals:
  ```tsx
  {/* FAB — mobile only, hidden when form is open */}
  {!formState.open && (
    <button
      onClick={() => setFormState({ open: true, initial: { date: state.date } })}
      className="fixed bottom-5 right-5 z-50 sm:hidden bg-primary text-white font-bold px-4 py-3 rounded-2xl shadow-lg text-sm"
      title="New activity (⌃⌘N)"
    >
      + New
    </button>
  )}
  ```

- [ ] **Step 2: Verify in browser**

  At mobile width:
  - FAB is visible in bottom-right corner
  - Tapping it opens the New Activity form
  - FAB disappears while form is open
  - FAB reappears after form closes

  At desktop width:
  - FAB is not visible

- [ ] **Step 3: Commit**
  ```bash
  git add components/CalendarShell.tsx
  git commit -m "feat: floating action button for new activity on mobile"
  ```

---

## Task 4: Tighter Time Fields on Mobile

**Files:**
- Modify: `components/ActivityForm.tsx:543-585`

- [ ] **Step 1: Tighten the Date/From/To grid**

  In `components/ActivityForm.tsx`, find the `{/* Date + Time From + Time To */}` section (around line 542). The three `<div>` label + input blocks need tighter mobile classes.

  Change the outer grid div:
  ```tsx
  // Before:
  <div className="grid grid-cols-3 gap-1">
  // After:
  <div className="grid grid-cols-3 gap-1">
  ```
  (no change to outer div)

  Change **each label** inside the three columns from:
  ```tsx
  <label className="text-xs text-text-muted uppercase tracking-wide mb-1 block">
  ```
  to:
  ```tsx
  <label className="text-[10px] sm:text-xs text-text-muted uppercase tracking-wide mb-1 block">
  ```

  Change **each input** (date, timeFrom, timeTo) from:
  ```tsx
  className="w-full bg-bg border border-border rounded-lg px-1.5 sm:px-2 py-2 text-sm focus:outline-none focus:border-primary"
  ```
  to:
  ```tsx
  className="w-full bg-bg border border-border rounded-lg px-1 py-1.5 text-xs sm:px-2 sm:py-2 sm:text-sm focus:outline-none focus:border-primary"
  ```

- [ ] **Step 2: Verify in browser at mobile width**

  At ≤640px: all three fields (Date, From, To) fit in one row without overlap. Inputs are legible.

- [ ] **Step 3: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "fix: tighter date/time fields on mobile to prevent overlap"
  ```

---

## Task 5: X Clear Buttons on Text Inputs

**Files:**
- Modify: `components/ActivityForm.tsx`

For each field: wrap the input in a `relative` div (if not already), add a `×` button that appears when the value is non-empty, and clear the associated state on click.

- [ ] **Step 1: Add X button to Description field**

  Find the Description input (around line 532). Change the `<input>` to be inside a `relative` wrapper and add the clear button:
  ```tsx
  <div className="relative">
    <input
      ref={descInputRef}
      value={description}
      onChange={e => setDescription(e.target.value)}
      autoFocus={!isEdit && !initial?.timeFrom}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:border-primary"
      placeholder="What are you working on?"
    />
    {description && (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setDescription('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs hover:text-text"
      >
        ×
      </button>
    )}
  </div>
  ```

- [ ] **Step 2: Add X button to Activity Type field**

  Find the activity type input (around line 649). The input already has a wrapper `<div>` but no `relative`. Add `relative` to that wrapper and the clear button after the input (before the results dropdown):
  ```tsx
  <div className="relative">
    <input
      value={activityTypeName}
      onChange={...existing...}
      onFocus={...existing...}
      onKeyDown={...existing...}
      enterKeyHint="search"
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:border-primary"
      placeholder="Type code or name…"
    />
    {activityTypeName && (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          setActivityTypeName('')
          setActivityTypeCode('')
          setCurrentGroup(undefined)
          setActivityTypeResults([])
          setFocusedTypeIdx(-1)
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs hover:text-text"
      >
        ×
      </button>
    )}
  </div>
  ```

- [ ] **Step 3: Add X button to Project field**

  The project input already has `<div className="relative">` and a spinner. The `×` only shows when `!searchingProjects`. Insert inside that existing `relative` div, after the `<input>`:
  ```tsx
  {projectName && !searchingProjects && (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        setProjectName('')
        setProjectCode('')
        setProjectResults([])
        setProjectSearchMsg(null)
        setFocusedProjectIdx(-1)
      }}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs hover:text-text"
    >
      ×
    </button>
  )}
  ```

- [ ] **Step 4: Add X button to Customer field**

  Same pattern as project, inside the existing `relative` div:
  ```tsx
  {customerName && !searchingCustomers && (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        setCustomerName('')
        setCustomerCode('')
        setCustomerResults([])
        setCustomerSearchMsg(null)
        setFocusedCustomerIdx(-1)
      }}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs hover:text-text"
    >
      ×
    </button>
  )}
  ```

- [ ] **Step 5: Add X button to Item Code field**

  The item code input has no `relative` wrapper. Wrap it and add the button (add `pr-7` to input):
  ```tsx
  <div className="relative">
    <input
      value={itemCode}
      onChange={e => setItemCode(e.target.value)}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:border-primary font-mono"
      placeholder="Item code"
    />
    {itemCode && (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setItemCode('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs hover:text-text"
      >
        ×
      </button>
    )}
  </div>
  ```

- [ ] **Step 6: Add X button to Additional Text (textarea)**

  The textarea has no wrapper. Wrap it (add `pr-7` to textarea), and position the button `top-2` (not centred, since it's a textarea):
  ```tsx
  <div className="relative">
    <textarea
      value={textInMatrix}
      onChange={e => setTextInMatrix(e.target.value)}
      rows={2}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 pr-7 text-sm focus:outline-none focus:border-primary resize-none"
      placeholder="Optional additional description…"
    />
    {textInMatrix && (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setTextInMatrix('')}
        className="absolute right-2 top-2 text-text-muted text-xs hover:text-text"
      >
        ×
      </button>
    )}
  </div>
  ```

- [ ] **Step 7: Verify in browser**

  Open "New Activity". Type something into each field. Confirm `×` appears when value is non-empty and clears the field (and its code) when clicked. Confirm `×` does not show when field is empty.

- [ ] **Step 8: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "feat: × clear buttons on all ActivityForm text inputs"
  ```

---

## Task 6: Swipe-Down Drag-to-Dismiss Modal

**Files:**
- Modify: `components/ActivityForm.tsx:43-88,361-370`

- [ ] **Step 1: Add new refs and state**

  In `components/ActivityForm.tsx`, in the existing refs block (around line 80), replace:
  ```ts
  const swipeX = useRef<number | null>(null)
  ```
  with:
  ```ts
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const dragYRef = useRef(0)
  const dismissing = useRef(false)
  const snappingBack = useRef(false)
  ```

  Also add `dragY` state near the other state declarations (around line 73):
  ```ts
  const [dragY, setDragY] = useState(0)
  ```

- [ ] **Step 2: Replace touch handlers on the modal container**

  The modal container `<div>` (around line 363) currently has:
  ```tsx
  onTouchStart={e => { swipeX.current = e.touches[0].clientX }}
  onTouchEnd={e => {
    if (swipeX.current !== null && e.changedTouches[0].clientX - swipeX.current < -80) onCloseRef.current()
    swipeX.current = null
  }}
  ```

  Replace with:
  ```tsx
  onTouchStart={e => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    dismissing.current = false
    dragYRef.current = 0
  }}
  onTouchMove={e => {
    if (!swipeStart.current) return
    const dy = e.touches[0].clientY - swipeStart.current.y
    if (dy > 0) {
      dragYRef.current = dy
      setDragY(dy)
    }
  }}
  onTouchEnd={e => {
    if (!swipeStart.current) return
    const dx = e.changedTouches[0].clientX - swipeStart.current.x
    const dy = dragYRef.current
    swipeStart.current = null
    if (Math.abs(dx) > Math.abs(dy) && dx < -80) {
      // Horizontal left-swipe — existing close behaviour
      onCloseRef.current()
      return
    }
    if (dy > 80) {
      dismissing.current = true
      setDragY(window.innerHeight)
      setTimeout(() => onCloseRef.current(), 220)
    } else {
      snappingBack.current = true
      dragYRef.current = 0
      setDragY(0)
    }
  }}
  onTransitionEnd={() => { snappingBack.current = false; dismissing.current = false }}
  ```

- [ ] **Step 3: Apply drag transform and animated backdrop to modal container**

  The modal container `<div className="relative bg-surface ...">` needs an inline style:
  ```tsx
  style={{
    transform: `translateY(${dragY}px)`,
    transition: dismissing.current || snappingBack.current ? 'transform 0.22s' : 'none',
    willChange: 'transform',
  }}
  ```

  The backdrop `<div className="absolute inset-0 bg-black/60" onClick={onClose} />` needs to become:
  ```tsx
  <div
    className="absolute inset-0"
    style={{ background: `rgb(0 0 0 / ${Math.max(0, 0.6 - dragY / 400)})` }}
    onClick={onClose}
  />
  ```

- [ ] **Step 4: Verify in browser on mobile or DevTools mobile emulation**

  - Drag the modal down slowly: it follows the finger, backdrop fades
  - Release at < 80px drag: modal springs back with animation
  - Drag down past 80px and release: modal slides out, form closes
  - Left-swipe still closes the modal
  - Normal scrolling inside the form still works (vertical drag on the scrollable body should not dismiss — note: `onTouchMove` fires on the outer container, so only drags starting outside the scrollable area trigger this. If needed, stop propagation on the inner scroll div. Verify empirically.)

- [ ] **Step 5: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "feat: swipe-down drag-to-dismiss modal with spring-back animation"
  ```

---

## Task 7: Auto-Start Time Fixes + Clock Button

**Files:**
- Modify: `components/ActivityForm.tsx:145-150,322-358,554-556`

- [ ] **Step 1: Update `smartDefaultStart` to accept hint and exclude planned activities**

  Find `smartDefaultStart` (around line 145). Replace the entire function:
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

- [ ] **Step 2: Update `resetToCreate` signature and pass hint in blank branch**

  Find `resetToCreate` (around line 322). Change its signature and the time-setting in the `else` branch:
  ```ts
  function resetToCreate(copy: Partial<Activity> | null, hint?: string) {
    // ... existing body unchanged except the else branch time line:
    } else {
      setTimeFrom(smartDefaultStart(hint))  // was: smartDefaultStart()
      setTimeTo('')
    }
  ```

  Find the "Create blank" button in the success state (around line 430):
  ```tsx
  // Before:
  onClick={() => resetToCreate(null)}
  // After:
  onClick={() => resetToCreate(null, savedActivity?.timeTo ?? undefined)}
  ```

- [ ] **Step 3: Add clock button next to the "From" label**

  Find the From label (around line 555):
  ```tsx
  <label className="text-[10px] sm:text-xs text-text-muted uppercase tracking-wide mb-1 block">From</label>
  ```
  Change to:
  ```tsx
  <label className="text-[10px] sm:text-xs text-text-muted uppercase tracking-wide mb-1 flex items-center gap-1">
    From
    {!isEdit && (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setTimeFrom(smartDefaultStart())}
        title="Set to end of last activity"
        className="text-text-muted hover:text-primary transition-colors leading-none"
      >
        ⏱
      </button>
    )}
  </label>
  ```

- [ ] **Step 4: Verify in browser**

  1. Create an actual (non-planned) activity ending at e.g. 11:00.
  2. After save, click "Create blank" — From should prefill as 11:00.
  3. Manually clear the From field; click ⏱ button — should refill with 11:00.
  4. Create a *planned* activity; confirm its end time is NOT used as the default.

- [ ] **Step 5: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "feat: exclude planned activities from auto-start, add clock button, fix Create blank hint"
  ```

---

## Task 8: Recent Items Library

**Files:**
- Create: `lib/recentItems.ts`

- [ ] **Step 1: Create `lib/recentItems.ts`**

  ```ts
  const MAX_RECENT = 6

  export function loadRecent(key: string): string[] {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  export function saveRecent(key: string, codes: string[]): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(key, JSON.stringify(codes.slice(0, MAX_RECENT)))
    } catch {}
  }

  export function prependRecent(key: string, newCodes: string[]): void {
    const existing = loadRecent(key)
    const merged = [...newCodes, ...existing.filter(c => !newCodes.includes(c))].slice(0, MAX_RECENT)
    saveRecent(key, merged)
  }
  ```

- [ ] **Step 2: Verify the file compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors related to `lib/recentItems.ts`.

- [ ] **Step 3: Commit**
  ```bash
  git add lib/recentItems.ts
  git commit -m "feat: recentItems localStorage helpers (loadRecent, saveRecent, prependRecent)"
  ```

---

## Task 9: Recent Activity Types as Shortcut Chips

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Import and load recent types in ActivityForm**

  At the top of `components/ActivityForm.tsx`, add the import:
  ```ts
  import { loadRecent, prependRecent } from '@/lib/recentItems'
  ```

  Add a state variable near the other state declarations:
  ```ts
  const [recentTypeCodes, setRecentTypeCodes] = useState<string[]>(() => loadRecent('recentActivityTypes'))
  ```

- [ ] **Step 2: Save recent type on successful save**

  In `handleSave`, just before calling `onSaved()`:
  ```ts
  // Save recent activity type
  if (activityTypeCode) {
    prependRecent('recentActivityTypes', [activityTypeCode])
    setRecentTypeCodes(loadRecent('recentActivityTypes'))
  }
  onSaved()
  ```

- [ ] **Step 3: Render recent type chips above the activity type input**

  In the activity type section (inside `source === 'herbe'` guard, around line 644), add the chips row between the label and the input:
  ```tsx
  {/* Recent type chips — show only when no type selected and dropdown not open */}
  {!activityTypeName && activityTypeResults.length === 0 && recentTypeCodes.length > 0 && (
    <div className="flex flex-wrap gap-1 mb-1">
      {recentTypeCodes
        .map(code => activityTypes.find(t => t.code === code))
        .filter((t): t is ActivityType => !!t)
        .map(t => {
          const c = getTypeColor?.(t.code)
          return (
            <button
              key={t.code}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setActivityTypeCode(t.code)
                setActivityTypeName(t.name)
                setActivityTypeResults([])
                setFocusedTypeIdx(-1)
                setCurrentGroup(getTypeGroup?.(t.code))
              }}
              className="px-2 py-0.5 rounded-lg text-xs font-bold border border-border hover:border-primary/50 transition-colors"
              style={c ? { background: c + '22', borderColor: c + '55', color: c } : undefined}
              title={t.name}
            >
              {t.code}
            </button>
          )
        })
      }
    </div>
  )}
  ```

- [ ] **Step 4: Verify in browser**

  1. Open "New Activity", select an activity type (e.g. by typing), save.
  2. Open another "New Activity" — the saved type code should appear as a chip above the activity type input.
  3. Click the chip — the type should be selected instantly without typing.
  4. After selecting a type (chip or typed), the chips row hides.
  5. Up to 6 recent types appear; oldest falls off after 7th unique type is used.

- [ ] **Step 5: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "feat: recent activity types shown as shortcut chips in activity form"
  ```

---

## Task 10: Recent Persons Reordered to Top

**Files:**
- Modify: `components/ActivityForm.tsx`

- [ ] **Step 1: Load recent persons state**

  Add near the other state declarations (recentTypeCodes was added in Task 9):
  ```ts
  const [recentPersonCodes, setRecentPersonCodes] = useState<string[]>(() => loadRecent('recentPersons'))
  ```

- [ ] **Step 2: Save recent persons on successful save**

  In `handleSave`, alongside the recent types save (added in Task 9):
  ```ts
  // Save recent persons
  if (selectedPersonCodes.length) {
    prependRecent('recentPersons', selectedPersonCodes)
    setRecentPersonCodes(loadRecent('recentPersons'))
  }
  ```

- [ ] **Step 3: Reorder the unselected persons list**

  In the persons section of the form (around line 473), where `unselected` is computed:
  ```ts
  // Before:
  const unselected = people.filter(p => !selectedPersonCodes.includes(p.code))
  // After:
  const unselectedAll = people.filter(p => !selectedPersonCodes.includes(p.code))
  const unselected = [
    ...recentPersonCodes
      .map(code => unselectedAll.find(p => p.code === code))
      .filter((p): p is Person => !!p),
    ...unselectedAll.filter(p => !recentPersonCodes.includes(p.code)),
  ]
  ```

- [ ] **Step 4: Verify in browser**

  1. Open "New Activity", add person B and person C (not just the default), save.
  2. Open another "New Activity" — unselected person chips should show B and C first (before alphabetical others).
  3. The `+N more` and collapse behaviour should still work correctly.

- [ ] **Step 5: Commit**
  ```bash
  git add components/ActivityForm.tsx
  git commit -m "feat: recently used persons shown first in activity form person list"
  ```

---

## Final: Push and Deploy

- [ ] **Step 1: Verify everything builds cleanly**
  ```bash
  npx tsc --noEmit
  npm run build
  ```
  Expected: no TypeScript errors, build succeeds.

- [ ] **Step 2: Push to preview and then main**
  ```bash
  git push origin preview
  git push github preview
  # After verifying on preview:
  git checkout main
  git merge preview --no-ff -m "chore: merge mobile UX batch 3"
  git push origin main
  git push github main
  git checkout preview
  ```
