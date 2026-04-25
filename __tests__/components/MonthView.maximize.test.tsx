/**
 * @jest-environment jsdom
 *
 * Accessibility regression for the tasks-panel maximize toggle:
 * - When maximized, the panel must expose dialog semantics so screen readers
 *   announce it as a modal (role=dialog, aria-modal=true, aria-label).
 * - Esc must exit the maximized panel (delegates to the existing toggle).
 * - Closing must restore focus to the maximize button so keyboard users
 *   are returned to a sensible spot.
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, act } from '@testing-library/react'
import MonthView from '@/components/MonthView'
import type { Activity } from '@/types'

// jsdom does not implement ResizeObserver; MonthView constructs one for the
// chip-fit calculation. Stub a no-op shim.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO

const baseProps = {
  activities: [] as Activity[],
  date: '2026-04-25',
  holidays: { dates: {}, personCountries: {} },
  personCode: 'EK',
  getActivityColor: () => '#888',
  onSelectDate: () => {},
  onSelectWeek: () => {},
  // Tasks panel inputs — empty list is fine for a11y assertions.
  tasks: [],
  taskSources: { herbe: true, outlook: false, google: false },
  taskErrors: [],
  tasksTab: 'all' as const,
}

it('maximize toggle exposes dialog semantics, Esc closes, focus returns to button', () => {
  render(<MonthView {...baseProps} />)
  // Open the tasks panel first — agenda is the default right-side mode.
  fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
  const maxBtn = screen.getByRole('button', { name: 'Maximize tasks' })
  expect(maxBtn).toHaveAttribute('aria-pressed', 'false')

  // Click maximize — panel should now be a dialog.
  fireEvent.click(maxBtn)
  const dialog = screen.getByRole('dialog', { name: 'Tasks' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')

  // The maximize button label flips, and aria-pressed reflects the new state.
  const exitBtn = screen.getByRole('button', { name: 'Exit fullscreen' })
  expect(exitBtn).toHaveAttribute('aria-pressed', 'true')

  // Esc closes — and focus returns to the (now-relabelled) max button.
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' })
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Maximize tasks' }))
})
