import {
  findTimeConflicts,
  formatTimeConflictMessage,
  isTimeConflictError,
} from '@/lib/herbe/timeConflict'
import type { Activity } from '@/types'

function act(partial: Partial<Activity>): Activity {
  return {
    id: 'a1',
    source: 'herbe',
    personCode: 'P1',
    description: 'Test event',
    date: '2026-04-27',
    timeFrom: '09:00',
    timeTo: '10:00',
    ...partial,
  } as Activity
}

describe('isTimeConflictError', () => {
  it('matches code 1547', () => {
    expect(isTimeConflictError([{ field: 'StartTime', label: 'Start time', code: '1547' }], [])).toBe(true)
  })

  it('matches StartTime/EndTime field error without code', () => {
    expect(isTimeConflictError([{ field: 'StartTime', label: 'Start time', code: '' }], [])).toBe(true)
    expect(isTimeConflictError([{ field: 'EndTime', label: 'End time', code: '' }], [])).toBe(true)
  })

  it('matches TimeFromHHMM/TimeToHHMM field errors', () => {
    expect(isTimeConflictError([{ field: 'TimeFromHHMM', label: 'Start time', code: '' }], [])).toBe(true)
  })

  it('matches when an error message mentions the conflict text', () => {
    expect(isTimeConflictError(undefined, ['Start time: Time conflict — bla'])).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isTimeConflictError([{ field: 'ActType', label: 'Activity type', code: '1058' }], ['Activity type is required'])).toBe(false)
  })
})

describe('findTimeConflicts', () => {
  const proposed = {
    date: '2026-04-27',
    timeFrom: '09:30',
    timeTo: '10:30',
    personCodes: ['P1'],
  }

  it('finds an overlapping ERP event for the same person', () => {
    const activities = [act({ id: 'x1', timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts(proposed, activities).map(a => a.id)).toEqual(['x1'])
  })

  it('ignores back-to-back events (end == start)', () => {
    const activities = [act({ id: 'x1', timeFrom: '08:00', timeTo: '09:30' })]
    expect(findTimeConflicts(proposed, activities)).toEqual([])
  })

  it('ignores events on a different date', () => {
    const activities = [act({ id: 'x1', date: '2026-04-28', timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts(proposed, activities)).toEqual([])
  })

  it('ignores events without any matching person', () => {
    const activities = [act({ id: 'x1', personCode: 'P9', mainPersons: ['P9'], timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts(proposed, activities)).toEqual([])
  })

  it('matches via mainPersons when personCode differs', () => {
    const activities = [act({ id: 'x1', personCode: 'P9', mainPersons: ['P9', 'P1'], timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts(proposed, activities).map(a => a.id)).toEqual(['x1'])
  })

  it('ignores non-ERP sources (Outlook/Google) — ERP-side conflict only checks ERP', () => {
    const activities = [
      act({ id: 'x1', source: 'outlook', timeFrom: '09:00', timeTo: '10:00' }),
      act({ id: 'x2', source: 'google', timeFrom: '09:00', timeTo: '10:00' }),
    ]
    expect(findTimeConflicts(proposed, activities)).toEqual([])
  })

  it('excludes the activity being edited', () => {
    const activities = [act({ id: 'edit-me', timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts({ ...proposed, editId: 'edit-me' }, activities)).toEqual([])
  })

  it('respects connectionId when supplied', () => {
    const activities = [act({ id: 'x1', erpConnectionId: 'conn-B', timeFrom: '09:00', timeTo: '10:00' })]
    expect(findTimeConflicts({ ...proposed, connectionId: 'conn-A' }, activities)).toEqual([])
  })

  it('returns multiple distinct conflicts when both sides overlap different events', () => {
    const activities = [
      act({ id: 'x1', timeFrom: '09:00', timeTo: '10:00' }),
      act({ id: 'x2', timeFrom: '10:15', timeTo: '11:00' }),
    ]
    expect(findTimeConflicts(proposed, activities).map(a => a.id).sort()).toEqual(['x1', 'x2'])
  })
})

describe('formatTimeConflictMessage', () => {
  const proposed = {
    date: '2026-04-27',
    timeFrom: '09:30',
    timeTo: '10:30',
    personCodes: ['P1'],
  }

  it('returns null when no conflicts', () => {
    expect(formatTimeConflictMessage(proposed, [])).toBeNull()
  })

  it('reports "starts at" when proposed end runs into existing start', () => {
    const conflict = act({ description: 'Standup', timeFrom: '10:00', timeTo: '11:00' })
    expect(formatTimeConflictMessage(proposed, [conflict])).toContain('which starts at 10:00')
    expect(formatTimeConflictMessage(proposed, [conflict])).toContain('Standup')
  })

  it('reports "ends at" when proposed start runs into existing end', () => {
    const conflict = act({ description: 'Email triage', timeFrom: '09:00', timeTo: '10:00' })
    expect(formatTimeConflictMessage(proposed, [conflict])).toContain('which ends at 10:00')
  })

  it('reports a range when proposed is fully inside the existing event', () => {
    const conflict = act({ description: 'Workshop', timeFrom: '09:00', timeTo: '11:00' })
    expect(formatTimeConflictMessage(proposed, [conflict])).toContain('runs 09:00–11:00')
  })

  it('lists each conflict on multi-conflict overlap', () => {
    const conflicts = [
      act({ id: 'x1', description: 'A', timeFrom: '09:00', timeTo: '10:00' }),
      act({ id: 'x2', description: 'B', timeFrom: '10:15', timeTo: '11:00' }),
    ]
    const msg = formatTimeConflictMessage(proposed, conflicts) ?? ''
    expect(msg).toContain('"A" (09:00–10:00)')
    expect(msg).toContain('"B" (10:15–11:00)')
  })
})
