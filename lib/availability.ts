import { getDay, parseISO } from 'date-fns'
import { herbeFetchAll } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { fetchIcsForPerson } from '@/lib/icsUtils'
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

/** Convert "HH:mm" to total minutes since midnight */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert total minutes since midnight to "HH:mm" */
export function fromMinutes(mins: number): string {
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

/**
 * Collect all busy blocks for a set of person codes on a given date range.
 * Fetches from ERP, Outlook, ICS, and Google Calendar.
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

  // ERP activities
  if (!hiddenCalendars?.has('herbe'))
  try {
    const connections = await getErpConnections(accountId)
    for (const conn of connections) {
      try {
        const raw = await herbeFetchAll(REGISTERS.activities, {
          sort: 'TransDate', range: `${dateFrom}:${dateTo}`,
        }, 100, conn)
        for (const record of raw) {
          const r = record as Record<string, unknown>
          if (!isCalendarRecord(r)) continue
          const { main, cc } = parsePersons(r)
          if ([...main, ...cc].some(p => personSet.has(p))) {
            const date = String(r['TransDate'] ?? '')
            const start = toTime(String(r['StartTime'] ?? ''))
            const end = toTime(String(r['EndTime'] ?? ''))
            if (date && start && end) addBusy(date, { start, end })
          }
        }
      } catch (e) {
        console.warn(`[availability] ERP "${conn.name}" busy fetch failed:`, String(e))
      }
    }
  } catch (e) {
    console.warn('[availability] ERP connections lookup failed:', String(e))
  }

  // Outlook + ICS + Google per person
  for (const code of personCodes) {
    try {
      const email = await emailForCode(code, accountId)
      if (!email) continue

      // Outlook Graph
      if (!hiddenCalendars?.has('outlook'))
      try {
        const azureConfig = await getAzureConfig(accountId)
        if (azureConfig) {
          const startDt = `${dateFrom}T00:00:00`
          const endDt = `${dateTo}T23:59:59`
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$select=start,end`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of data.value ?? []) {
              const startStr = (ev.start as { dateTime?: string })?.dateTime ?? ''
              const endStr = (ev.end as { dateTime?: string })?.dateTime ?? ''
              const date = startStr.slice(0, 10)
              const startTime = startStr.slice(11, 16)
              const endTime = endStr.slice(11, 16)
              if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
            }
          }
        }
      } catch (e) {
        console.warn(`[availability] Outlook busy fetch failed for ${code}:`, String(e))
      }

      // ICS feeds
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

      // Google Calendar
      if (!hiddenCalendars?.has('google'))
      try {
        const googleConfig = await getGoogleConfig(accountId)
        if (googleConfig) {
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${dateFrom}T00:00:00+03:00`,
            timeMax: `${dateTo}T23:59:59+03:00`,
            timeZone: 'Europe/Riga',
            singleEvents: true,
            fields: 'items(start,end)',
          })
          const googleItems = res.data.items ?? []
          for (const ev of googleItems) {
            const startStr = ev.start?.dateTime ?? ''
            const endStr = ev.end?.dateTime ?? ''
            if (!startStr || !endStr) continue
            const date = startStr.slice(0, 10)
            const startTime = startStr.slice(11, 16)
            const endTime = endStr.slice(11, 16)
            console.error(`[availability] Google busy: ${date} ${startTime}-${endTime} (raw: ${startStr} to ${endStr})`)
            if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
          }
        } else {
          console.error(`[availability] Google not configured for account ${accountId}`)
        }
      } catch (e) {
        console.error(`[availability] Google busy fetch failed for ${code}:`, String(e))
      }
    } catch (e) {
      console.warn(`[availability] Busy fetch failed for ${code}:`, String(e))
    }
  }

  // Per-user Google OAuth calendars (owner's connected accounts)
  try {
    const { getUserGoogleAccounts, getValidAccessToken } = await import('@/lib/google/userOAuth')
    const { getOAuthCalendarClient } = await import('@/lib/google/client')
    const userAccounts = await getUserGoogleAccounts(ownerEmail, accountId)
    for (const account of userAccounts) {
      const enabledCals = account.calendars.filter(c => c.enabled)
      if (enabledCals.length === 0) continue
      const accessToken = await getValidAccessToken(account.id)
      if (!accessToken) {
        console.warn(`[availability] Per-user Google (${account.googleEmail}): token expired`)
        continue
      }
      const oauthCal = getOAuthCalendarClient(accessToken)
      for (const cal of enabledCals) {
        try {
          const res = await oauthCal.events.list({
            calendarId: cal.calendarId,
            timeMin: `${dateFrom}T00:00:00+03:00`,
            timeMax: `${dateTo}T23:59:59+03:00`,
            timeZone: 'Europe/Riga',
            singleEvents: true,
            fields: 'items(start,end)',
          })
          const items = res.data.items ?? []
          for (const ev of items) {
            const startStr = ev.start?.dateTime ?? ''
            const endStr = ev.end?.dateTime ?? ''
            if (!startStr || !endStr) continue
            const date = startStr.slice(0, 10)
            const startTime = startStr.slice(11, 16)
            const endTime = endStr.slice(11, 16)
            if (date && startTime && endTime) addBusy(date, { start: startTime, end: endTime })
          }
        } catch (e) {
          console.warn(`[availability] Per-user Google (${account.googleEmail}) "${cal.name}" failed:`, String(e))
        }
      }
    }
  } catch (e) {
    console.warn('[availability] Per-user Google lookup failed:', String(e))
  }

  return busyByDate
}
