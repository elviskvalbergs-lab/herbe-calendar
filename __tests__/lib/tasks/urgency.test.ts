import { classifyUrgency } from '@/lib/tasks/urgency'

// Fixed "now" at local noon on 2026-04-24.
const NOW = new Date(2026, 3, 24, 12, 0, 0)

describe('classifyUrgency', () => {
  it('returns "none" when task is done (regardless of date)', () => {
    expect(classifyUrgency('2026-04-22', true, NOW)).toBe('none')
    expect(classifyUrgency(undefined, true, NOW)).toBe('none')
    expect(classifyUrgency('2026-04-30', true, NOW)).toBe('none')
  })

  it('returns "none" when there is no due date', () => {
    expect(classifyUrgency(undefined, false, NOW)).toBe('none')
  })

  it('returns "overdue" when due date is before today (local)', () => {
    expect(classifyUrgency('2026-04-23', false, NOW)).toBe('overdue')
    expect(classifyUrgency('2025-12-01', false, NOW)).toBe('overdue')
  })

  it('returns "today" when due date matches today (local)', () => {
    expect(classifyUrgency('2026-04-24', false, NOW)).toBe('today')
  })

  it('returns "future" when due date is after today (local)', () => {
    expect(classifyUrgency('2026-04-25', false, NOW)).toBe('future')
    expect(classifyUrgency('2027-01-01', false, NOW)).toBe('future')
  })

  it('uses local timezone for "today", not UTC', () => {
    // Local midnight on 2026-04-24 is still "2026-04-24" locally; a task due
    // that date must not read as "future" because UTC has already ticked over.
    const localMidnight = new Date(2026, 3, 24, 0, 0, 0)
    expect(classifyUrgency('2026-04-24', false, localMidnight)).toBe('today')
  })
})
