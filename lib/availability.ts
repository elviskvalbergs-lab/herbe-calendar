import { getDay, parseISO } from 'date-fns'
import { herbeFetchAll } from '@/lib/herbe/client'
import { getErpConnections } from '@/lib/accountConfig'
import { REGISTERS } from '@/lib/herbe/constants'
import { fetchIcsForPerson } from '@/lib/icsUtils'
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { toTime, isCalendarRecord, parsePersons } from '@/lib/herbe/recordUtils'
import { emailForCode } from '@/lib/emailForCode'
import type { AvailabilityWindow } from '@/types'

export interface BusyBlock {
  start: string // HH:mm
  end: string   // HH:mm
}

export interface TimeSlot {
  start: string // HH:mm
  end: string   // HH:mm
}

/** Convert "HH:mm" to total minutes since midnight. Returns NaN on malformed input. */
export function toMinutes(time: string): number {
  const parts = time.split(':')
  if (parts.length < 2) return NaN
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
  return h * 60 + m
}

/** Convert total minutes since midnight to "HH:mm" */
export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Compute every candidate slot for a date, flagging which are busy.
 * Used to render unavailable times as disabled in the booking UI.
 */
export function computeAllSlots(
  date: string,
  windows: AvailabilityWindow[],
  busy: BusyBlock[],
  durationMinutes: number,
  bufferMinutes: number = 0,
): { start: string; end: string; available: boolean }[] {
  const dayOfWeek = getDay(parseISO(date))
  const applicableWindows = windows.filter((w) => w.days.includes(dayOfWeek))
  if (applicableWindows.length === 0) return []

  const ranges = applicableWindows
    .map((w) => ({ start: toMinutes(w.startTime), end: toMinutes(w.endTime) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
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

  const expandedBusy = busy
    .map((b) => ({
      start: toMinutes(b.start) - bufferMinutes,
      end: toMinutes(b.end) + bufferMinutes,
    }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))

  const STEP = 30
  const out: { start: string; end: string; available: boolean }[] = []

  for (const window of merged) {
    for (let start = window.start; start + durationMinutes <= window.end; start += STEP) {
      const end = start + durationMinutes
      const overlaps = expandedBusy.some((b) => start < b.end && end > b.start)
      out.push({ start: fromMinutes(start), end: fromMinutes(end), available: !overlaps })
    }
  }

  return out
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
  return computeAllSlots(date, windows, busy, durationMinutes, bufferMinutes)
    .filter((s) => s.available)
    .map(({ start, end }) => ({ start, end }))
}

/**
 * Collect all busy blocks for a set of person codes on a given date range.
 * Fetches from ERP, Outlook, ICS, and Google Calendar in parallel.
 */
export async function collectBusyBlocks(
  personCodes: string[],
  ownerEmail: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  hiddenCalendars?: Set<string>,
): Promise<Map<string, BusyBlock[]>> {
  const busyByDate = new Map<string, BusyBlock[]>()

  function addBusy(date: string, block: BusyBlock) {
    const existing = busyByDate.get(date)
    if (existing) existing.push(block)
    else busyByDate.set(date, [block])
  }

  const personSet = new Set(personCodes)

  // ERP activities — parallel across connections
  const erpTask = (async () => {
    if (hiddenCalendars?.has('herbe')) return
    try {
      const connections = await getErpConnections(accountId)
      await Promise.all(connections.map(async (conn) => {
        try {
          const raw = await herbeFetchAll(REGISTERS.activities, {
            sort: 'TransDate', range: `${dateFrom}:${dateTo}`,
          }, 100, conn)
          for (const record of raw) {
            const r = record as Record<string, unknown>
            if (!isCalendarRecord(r)) continue
            const { main, cc } = parsePersons(r)
            if ([...main, ...cc].some((p) => personSet.has(p))) {
              const date = String(r['TransDate'] ?? '')
              const start = toTime(String(r['StartTime'] ?? ''))
              const end = toTime(String(r['EndTime'] ?? ''))
              if (date && start && end) addBusy(date, { start, end })
            }
          }
        } catch (e) {
          console.warn(`[availability] ERP "${conn.name}" busy fetch failed:`, String(e))
        }
      }))
    } catch (e) {
      console.warn('[availability] ERP connections lookup failed:', String(e))
    }
  })()

  // Per-person: Outlook + ICS + Google in parallel (both across persons and across sources)
  const perPersonTask = Promise.all(personCodes.map(async (code) => {
    let email: string | null
    try {
      email = await emailForCode(code, accountId)
    } catch (e) {
      console.warn(`[availability] emailForCode failed for ${code}:`, String(e))
      return
    }
    if (!email) return

    const outlookTask = hiddenCalendars?.has('outlook') ? Promise.resolve() : (async () => {
      try {
        const outlookEvents = await fetchOutlookEventsForPerson(email!, accountId, dateFrom, dateTo)
        if (!outlookEvents) return
        for (const ev of outlookEvents) {
          const startStr = ev.start?.dateTime ?? ''
          const endStr = ev.end?.dateTime ?? ''
          const date = startStr.slice(0, 10)
          const startTime = startStr.slice(11, 16)
          const endTime = endStr.slice(11, 16)
          if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
        }
      } catch (e) {
        console.warn(`[availability] Outlook busy fetch failed for ${code}:`, String(e))
      }
    })()

    const icsTask = (async () => {
      try {
        const icsResult = await fetchIcsForPerson(ownerEmail, code, accountId, dateFrom, dateTo)
        for (const ev of icsResult.events) {
          const start = String(ev.timeFrom ?? '')
          const end = String(ev.timeTo ?? '')
          const date = String(ev.date ?? '')
          if (date && start && end) addBusy(date, { start, end })
        }
      } catch (e) {
        console.warn(`[availability] ICS busy fetch failed for ${code}:`, String(e))
      }
    })()

    const googleTask = hiddenCalendars?.has('google') ? Promise.resolve() : (async () => {
      try {
        const googleItems = await fetchGoogleEventsForPerson(email!, accountId, dateFrom, dateTo, 'items(start,end)')
        if (!googleItems) return
        for (const ev of googleItems) {
          const startStr = ev.start?.dateTime ?? ''
          const endStr = ev.end?.dateTime ?? ''
          if (!startStr || !endStr) continue
          const date = startStr.slice(0, 10)
          const startTime = startStr.slice(11, 16)
          const endTime = endStr.slice(11, 16)
          if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
        }
      } catch (e) {
        console.error(`[availability] Google busy fetch failed for ${code}:`, String(e))
      }
    })()

    await Promise.all([outlookTask, icsTask, googleTask])
  }))

  // Per-user Google OAuth calendars (owner's connected accounts)
  const perUserGoogleTask = (async () => {
    try {
      const { events: perUserEvents, warnings } = await fetchPerUserGoogleEvents(
        ownerEmail, accountId, dateFrom, dateTo, 'items(start,end)',
      )
      for (const w of warnings) {
        console.warn(`[availability] ${w}`)
      }
      for (const { event: ev } of perUserEvents) {
        const startStr = ev.start?.dateTime ?? ''
        const endStr = ev.end?.dateTime ?? ''
        if (!startStr || !endStr) continue
        const date = startStr.slice(0, 10)
        const startTime = startStr.slice(11, 16)
        const endTime = endStr.slice(11, 16)
        if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
      }
    } catch (e) {
      console.warn('[availability] Per-user Google lookup failed:', String(e))
    }
  })()

  // Shared calendars from other users (busy+ sharing levels)
  const sharedTask = (async () => {
    try {
      const { fetchSharedCalendarEvents } = await import('@/lib/sharedCalendars')
      const shared = await fetchSharedCalendarEvents(personCodes, ownerEmail, accountId, dateFrom, dateTo, hiddenCalendars)
      for (const [date, blocks] of shared.busyBlocks) {
        for (const block of blocks) addBusy(date, block)
      }
    } catch (e) {
      console.warn('[availability] Shared calendar fetch failed:', String(e))
    }
  })()

  await Promise.all([erpTask, perPersonTask, perUserGoogleTask, sharedTask])

  return busyByDate
}
