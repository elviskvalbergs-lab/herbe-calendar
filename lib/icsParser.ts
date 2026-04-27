import ICAL from 'ical.js'
import { parseISO, isWithinInterval, startOfDay, endOfDay, addDays, format } from 'date-fns'
import { isValidTimezone } from '@/lib/timezone'

const FETCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory cache: URL → { text, fetchedAt }
const icsCache = new Map<string, { text: string; fetchedAt: number }>()

/** Format a Date as 'YYYY-MM-DD' in the supplied timezone */
function formatDateInTz(d: Date, tz: string): string {
  return d.toLocaleDateString('sv-SE', { timeZone: tz })
}

/** Format a Date as 'HH:mm' in the supplied timezone */
function formatTimeInTz(d: Date, tz: string): string {
  return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
}

async function fetchIcsText(url: string, bustCache: boolean): Promise<string> {
  const cached = icsCache.get(url)
  if (!bustCache && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  const text = await res.text()
  icsCache.set(url, { text, fetchedAt: Date.now() })
  return text
}

/** Clear all cached ICS data (used for manual sync). */
export function clearIcsCache() {
  icsCache.clear()
}

function extractJoinUrl(comp: ICAL.Component, event: ICAL.Event): string | undefined {
  const skypeData = comp.getFirstPropertyValue('x-microsoft-skypeteamsdata')
  if (skypeData) {
    try { const parsed = JSON.parse(String(skypeData)); if (parsed.joinUrl) return parsed.joinUrl } catch {}
  }
  const desc = event.description || ''
  const teamsMatch = desc.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<"]+/)
  return teamsMatch?.[0]
}

export interface IcsResult {
  events: any[]
  error?: string
}

export async function fetchIcsEvents(
  url: string,
  code: string,
  dateFrom: string,
  dateTo: string,
  bustCache = false,
  timezone?: string,
): Promise<IcsResult> {
  const tz = isValidTimezone(timezone) ? timezone : 'Europe/Riga'
  try {
    const rawText = await fetchIcsText(url, bustCache)
    // Sanitize: remove lines that aren't valid ICS (no property name with : or ;)
    // This handles malformed feeds that break ICAL.parse
    const icsText = rawText.split(/\r?\n/).filter(line => {
      // Keep empty lines, continuation lines (start with space/tab), and valid property lines
      if (line === '') return true
      if (line.startsWith(' ') || line.startsWith('\t')) return true
      if (line.includes(':') || line.includes(';')) return true
      // Skip malformed lines
      return false
    }).join('\r\n')
    const jcalData = ICAL.parse(icsText)
    const vcalendar = new ICAL.Component(jcalData)
    const vevents = vcalendar.getAllSubcomponents('vevent')

    const rangeStart = startOfDay(parseISO(dateFrom))
    const rangeEnd = endOfDay(parseISO(dateTo))

    console.log(`[outlook/ics] Parsing ${vevents.length} VEVENT components for ${code}, range ${dateFrom}–${dateTo}${bustCache ? ' (cache busted)' : ''}`)
    const events: any[] = []
    for (const comp of vevents) {
      const event = new ICAL.Event(comp)
      // Expand recurring events
      if (event.isRecurring()) {
        try {
          const isAllDay = event.startDate.isDate === true
          const iter = event.iterator()
          let next = iter.next()
          let count = 0
          while (next && count < 200) {
            count++
            const occStart = next.toJSDate()
            if (occStart > rangeEnd) break
            const duration = event.duration
            const occEnd = new Date(occStart.getTime() + (duration?.toSeconds() ?? 3600) * 1000)
            if (occStart >= rangeStart || occEnd >= rangeStart) {
              const dateStr = formatDateInTz(occStart, tz)
              const joinUrl = extractJoinUrl(comp, event)

              if (isAllDay) {
                events.push({
                  id: `ics-${event.uid}-${dateStr}`,
                  source: 'outlook' as const,
                  isExternal: true,
                  isAllDay: true,
                  personCode: code,
                  description: event.summary || '',
                  date: dateStr,
                  timeFrom: '00:00',
                  timeTo: '23:59',
                  isOrganizer: false,
                  location: event.location || undefined,
                  bodyPreview: event.description || '',
                  joinUrl,
                  webLink: '',
                  rsvpStatus: undefined,
                })
              } else {
                events.push({
                  id: `ics-${event.uid}-${dateStr}`,
                  source: 'outlook' as const,
                  isExternal: true,
                  personCode: code,
                  description: event.summary || '',
                  date: dateStr,
                  timeFrom: formatTimeInTz(occStart, tz),
                  timeTo: formatTimeInTz(occEnd, tz),
                  isOrganizer: false,
                  location: event.location || undefined,
                  bodyPreview: event.description || '',
                  joinUrl,
                  webLink: '',
                  rsvpStatus: undefined,
                })
              }
            }
            next = iter.next()
          }
          if (count >= 200) {
            console.warn(`[icsParser] Recurring event expansion capped at 200 for "${event.summary}" — some occurrences may be missing`)
          }
        } catch (e) {
          console.warn(`[outlook/ics] Failed to expand recurring event ${event.uid}:`, e)
        }
        continue
      }
      const start = event.startDate.toJSDate()
      const end = event.endDate.toJSDate()
      if (!start || !end) continue

      // Detect all-day events (VALUE=DATE in ICS)
      const isAllDay = event.startDate.isDate === true

      // Simple overlap check
      if (isWithinInterval(start, { start: rangeStart, end: rangeEnd }) ||
          isWithinInterval(end, { start: rangeStart, end: rangeEnd }) ||
          (start < rangeStart && end > rangeEnd)) {

        const joinUrl = extractJoinUrl(comp, event)

        if (isAllDay) {
          // All-day/multi-day: create one entry per visible day
          const eventStart = startOfDay(start)
          const eventEnd = startOfDay(end) // DTEND is exclusive for all-day events
          let cursor = eventStart < rangeStart ? rangeStart : eventStart
          const lastDay = eventEnd > rangeEnd ? rangeEnd : eventEnd
          const totalDays = Math.round((eventEnd.getTime() - eventStart.getTime()) / (24 * 60 * 60 * 1000))
          let dayIndex = Math.round((cursor.getTime() - eventStart.getTime()) / (24 * 60 * 60 * 1000))
          while (cursor < lastDay) {
            dayIndex++
            const dateStr = format(cursor, 'yyyy-MM-dd')
            events.push({
              id: `ics-${event.uid}-${dateStr}`,
              source: 'outlook' as const,
              isExternal: true,
              isAllDay: true,
              personCode: code,
              description: totalDays > 1
                ? `${event.summary || ''} (day ${dayIndex}/${totalDays})`
                : (event.summary || ''),
              date: dateStr,
              timeFrom: '00:00',
              timeTo: '23:59',
              isOrganizer: false,
              location: event.location || undefined,
              bodyPreview: event.description || '',
              joinUrl,
              webLink: '',
              rsvpStatus: undefined,
            })
            cursor = addDays(cursor, 1)
          }
        } else {
          events.push({
            id: `ics-${event.uid}`,
            source: 'outlook' as const,
            isExternal: true,
            personCode: code,
            description: event.summary || '',
            date: formatDateInTz(start, tz),
            timeFrom: formatTimeInTz(start, tz),
            timeTo: formatTimeInTz(end, tz),
            isOrganizer: false,
            location: event.location || undefined,
            bodyPreview: event.description || '',
            joinUrl,
            webLink: '',
            rsvpStatus: undefined,
          })
        }
      }
    }
    return { events }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[outlook] ICS fetch/parse failed for ${url}:`, msg)
    return { events: [], error: msg }
  }
}

/** Build a dedup key for an event (date|timeFrom|timeTo|description) */
function eventDedupKey(e: { date?: string; timeFrom?: string; timeTo?: string; description?: string }): string {
  return `${e.date ?? ''}|${e.timeFrom ?? ''}|${e.timeTo ?? ''}|${String(e.description ?? '').toLowerCase()}`
}

/** Remove ICS events that duplicate Graph events (same date+time+subject) */
export function deduplicateIcsAgainstGraph<G extends Record<string, unknown>, I extends Record<string, unknown>>(graphEvents: G[], icsEvents: I[]): I[] {
  const graphKeys = new Set(graphEvents.map(e => eventDedupKey(e as Record<string, unknown>)))
  return icsEvents.filter(e => !graphKeys.has(eventDedupKey(e as Record<string, unknown>)))
}
