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

import { urgencyRank, compareForSidebar } from '@/lib/tasks/urgency'
import type { Task } from '@/types/task'

function t(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'herbe:x',
    source: overrides.source ?? 'herbe',
    title: overrides.title ?? 'Task',
    done: overrides.done ?? false,
    dueDate: overrides.dueDate,
    listName: overrides.listName,
  }
}

describe('urgencyRank', () => {
  it('orders overdue < today < none < future', () => {
    expect(urgencyRank('overdue')).toBe(0)
    expect(urgencyRank('today')).toBe(1)
    expect(urgencyRank('none')).toBe(2)
    expect(urgencyRank('future')).toBe(3)
  })
})

describe('compareForSidebar', () => {
  const NOW = new Date(2026, 3, 24, 12, 0, 0)

  it('sorts by urgency bucket first', () => {
    const overdue = t({ id: '1', dueDate: '2026-04-20' })
    const today = t({ id: '2', dueDate: '2026-04-24' })
    const none = t({ id: '3', dueDate: undefined })
    const future = t({ id: '4', dueDate: '2026-05-01' })
    const sorted = [future, none, today, overdue].sort((a, b) => compareForSidebar(a, b, NOW))
    expect(sorted.map(x => x.id)).toEqual(['1', '2', '3', '4'])
  })

  it('within overdue: oldest dueDate first', () => {
    const a = t({ id: 'a', dueDate: '2026-04-10' })
    const b = t({ id: 'b', dueDate: '2026-04-22' })
    const sorted = [b, a].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('within future: soonest dueDate first', () => {
    const soon = t({ id: 'soon', dueDate: '2026-04-26' })
    const later = t({ id: 'later', dueDate: '2026-06-01' })
    const sorted = [later, soon].sort((a, b) => compareForSidebar(a, b, NOW))
    expect(sorted.map(x => x.id)).toEqual(['soon', 'later'])
  })

  it('within none: title ascending, case-insensitive', () => {
    const a = t({ id: 'a', title: 'banana' })
    const b = t({ id: 'b', title: 'Apple' })
    const sorted = [a, b].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['b', 'a'])
  })

  it('is stable for equal keys', () => {
    const a = t({ id: 'a', dueDate: '2026-04-24' })
    const b = t({ id: 'b', dueDate: '2026-04-24' })
    const sorted = [a, b].sort((x, y) => compareForSidebar(x, y, NOW))
    expect(sorted.map(x => x.id)).toEqual(['a', 'b'])
  })
})
