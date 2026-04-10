import { computeAvailableSlots, type BusyBlock } from '@/lib/availability'
import type { AvailabilityWindow } from '@/types'

// Monday = 1
const WEEKDAY_WINDOW: AvailabilityWindow = {
  days: [1, 2, 3, 4, 5], // Mon-Fri
  startTime: '09:00',
  endTime: '17:00',
}

describe('computeAvailableSlots', () => {
  it('returns correct number of 30-min slots on a free weekday', () => {
    // 2026-04-06 is a Monday
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], [], 30, 0)
    // 09:00-17:00 = 8 hours = 16 half-hour slots
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ start: '09:00', end: '09:30' })
    expect(slots[15]).toEqual({ start: '16:30', end: '17:00' })
  })

  it('removes slots overlapping a busy block', () => {
    const busy: BusyBlock[] = [{ start: '12:00', end: '13:00' }]
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 0)
    // 2 slots removed: 12:00-12:30, 12:30-13:00
    expect(slots).toHaveLength(14)
    expect(slots.find((s) => s.start === '12:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:30')).toBeUndefined()
  })

  it('expands busy blocks by buffer minutes', () => {
    const busy: BusyBlock[] = [{ start: '12:00', end: '13:00' }]
    // 15 min buffer: busy becomes 11:45-13:15
    // Overlapping 30-min slots: 11:30-12:00 (end > 11:45), 12:00-12:30, 12:30-13:00, 13:00-13:30 (start < 13:15)
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 15)
    expect(slots.find((s) => s.start === '11:30')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:30')).toBeUndefined()
    expect(slots.find((s) => s.start === '13:00')).toBeUndefined()
    // 16 - 4 = 12
    expect(slots).toHaveLength(12)
  })

  it('returns empty for a weekend when only weekdays configured', () => {
    // 2026-04-11 is a Saturday
    const slots = computeAvailableSlots('2026-04-11', [WEEKDAY_WINDOW], [], 30, 0)
    expect(slots).toHaveLength(0)
  })

  it('returns correct slots for 1-hour duration', () => {
    // 09:00-17:00 with 60-min duration at 30-min steps:
    // 09:00, 09:30, 10:00, ..., 16:00 => last slot at 16:00 (16:00+60=17:00)
    // That's 15 slots
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], [], 60, 0)
    expect(slots).toHaveLength(15)
    expect(slots[0]).toEqual({ start: '09:00', end: '10:00' })
    expect(slots[14]).toEqual({ start: '16:00', end: '17:00' })
  })

  it('merges multiple windows on the same day correctly', () => {
    const morningWindow: AvailabilityWindow = {
      days: [1],
      startTime: '09:00',
      endTime: '12:00',
    }
    const afternoonWindow: AvailabilityWindow = {
      days: [1],
      startTime: '14:00',
      endTime: '17:00',
    }
    // Non-overlapping: 09:00-12:00 (6 slots) + 14:00-17:00 (6 slots) = 12
    const slots = computeAvailableSlots('2026-04-06', [morningWindow, afternoonWindow], [], 30, 0)
    expect(slots).toHaveLength(12)
    expect(slots[0]).toEqual({ start: '09:00', end: '09:30' })
    expect(slots[5]).toEqual({ start: '11:30', end: '12:00' })
    expect(slots[6]).toEqual({ start: '14:00', end: '14:30' })
    expect(slots[11]).toEqual({ start: '16:30', end: '17:00' })
  })

  it('merges overlapping windows into a single range', () => {
    const window1: AvailabilityWindow = {
      days: [1],
      startTime: '09:00',
      endTime: '13:00',
    }
    const window2: AvailabilityWindow = {
      days: [1],
      startTime: '11:00',
      endTime: '15:00',
    }
    // Merged: 09:00-15:00 = 6 hours = 12 slots
    const slots = computeAvailableSlots('2026-04-06', [window1, window2], [], 30, 0)
    expect(slots).toHaveLength(12)
    expect(slots[0]).toEqual({ start: '09:00', end: '09:30' })
    expect(slots[11]).toEqual({ start: '14:30', end: '15:00' })
  })

  it('returns empty for zero-duration slot', () => {
    // Window where start equals end — no room for any slot
    const zeroWindow: AvailabilityWindow = {
      days: [1],
      startTime: '10:00',
      endTime: '10:00',
    }
    const slots = computeAvailableSlots('2026-04-06', [zeroWindow], [], 30, 0)
    expect(slots).toHaveLength(0)
  })

  it('removes a slot when busy block exactly matches it', () => {
    const busy: BusyBlock[] = [{ start: '10:00', end: '10:30' }]
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 0)
    // Exactly the 10:00-10:30 slot removed, 16 - 1 = 15
    expect(slots).toHaveLength(15)
    expect(slots.find((s) => s.start === '10:00')).toBeUndefined()
    // Adjacent slots remain
    expect(slots.find((s) => s.start === '09:30')).toBeDefined()
    expect(slots.find((s) => s.start === '10:30')).toBeDefined()
  })

  it('adjacent busy blocks merge correctly and remove all overlapping slots', () => {
    // Two adjacent busy blocks that together cover 11:00-13:00
    const busy: BusyBlock[] = [
      { start: '11:00', end: '12:00' },
      { start: '12:00', end: '13:00' },
    ]
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 0)
    // 4 slots removed: 11:00, 11:30, 12:00, 12:30
    expect(slots).toHaveLength(12)
    expect(slots.find((s) => s.start === '11:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '11:30')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:30')).toBeUndefined()
  })

  it('returns empty when busy block spans the entire window', () => {
    const busy: BusyBlock[] = [{ start: '09:00', end: '17:00' }]
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 0)
    expect(slots).toHaveLength(0)
  })

  it('handles a very early morning window (06:00-08:00)', () => {
    const earlyWindow: AvailabilityWindow = {
      days: [1], // Monday
      startTime: '06:00',
      endTime: '08:00',
    }
    const slots = computeAvailableSlots('2026-04-06', [earlyWindow], [], 30, 0)
    // 2 hours = 4 slots
    expect(slots).toHaveLength(4)
    expect(slots[0]).toEqual({ start: '06:00', end: '06:30' })
    expect(slots[3]).toEqual({ start: '07:30', end: '08:00' })
  })

  it('removes all slots when buffer is larger than slot duration', () => {
    // Single busy block at 12:00-12:30, buffer of 60 min
    // Expanded busy: 11:00-13:30
    // Overlapping 30-min slots: 11:00, 11:30, 12:00, 12:30, 13:00 = 5 removed
    const busy: BusyBlock[] = [{ start: '12:00', end: '12:30' }]
    const slots = computeAvailableSlots('2026-04-06', [WEEKDAY_WINDOW], busy, 30, 60)
    expect(slots).toHaveLength(11) // 16 - 5
    expect(slots.find((s) => s.start === '11:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '11:30')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:00')).toBeUndefined()
    expect(slots.find((s) => s.start === '12:30')).toBeUndefined()
    expect(slots.find((s) => s.start === '13:00')).toBeUndefined()
    // Slots just outside the expanded range should remain
    expect(slots.find((s) => s.start === '10:30')).toBeDefined()
    expect(slots.find((s) => s.start === '13:30')).toBeDefined()
  })
})
