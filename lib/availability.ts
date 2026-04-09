import { getDay, parseISO } from 'date-fns'
import type { AvailabilityWindow } from '@/types'

export interface BusyBlock {
  start: string // HH:mm
  end: string   // HH:mm
}

export interface TimeSlot {
  start: string // HH:mm
  end: string   // HH:mm
}

/** Convert "HH:mm" to total minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert total minutes since midnight to "HH:mm" */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Compute available booking slots for a given date.
 *
 * @param date        ISO date string (e.g. "2026-04-08")
 * @param windows     Availability windows defining working hours per day-of-week
 * @param busy        Busy blocks already occupied on this date
 * @param durationMinutes  Required slot duration in minutes
 * @param bufferMinutes    Buffer to add before and after each busy block
 * @returns           Array of available time slots
 */
export function computeAvailableSlots(
  date: string,
  windows: AvailabilityWindow[],
  busy: BusyBlock[],
  durationMinutes: number,
  bufferMinutes: number = 0,
): TimeSlot[] {
  const dayOfWeek = getDay(parseISO(date))

  // Find windows that apply to this day of week
  const applicableWindows = windows.filter((w) => w.days.includes(dayOfWeek))
  if (applicableWindows.length === 0) return []

  // Merge overlapping windows into unified ranges
  const ranges = applicableWindows
    .map((w) => ({ start: toMinutes(w.startTime), end: toMinutes(w.endTime) }))
    .sort((a, b) => a.start - b.start)

  const merged: { start: number; end: number }[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  // Expand busy blocks by buffer
  const expandedBusy = busy.map((b) => ({
    start: toMinutes(b.start) - bufferMinutes,
    end: toMinutes(b.end) + bufferMinutes,
  }))

  // Generate candidate slots at 30-min step intervals within merged windows
  const STEP = 30
  const slots: TimeSlot[] = []

  for (const window of merged) {
    for (let start = window.start; start + durationMinutes <= window.end; start += STEP) {
      const end = start + durationMinutes

      // Check if this candidate overlaps any expanded busy block
      const overlaps = expandedBusy.some(
        (b) => start < b.end && end > b.start,
      )

      if (!overlaps) {
        slots.push({ start: fromMinutes(start), end: fromMinutes(end) })
      }
    }
  }

  return slots
}
