import ICAL from 'ical.js'
import { parseISO, isWithinInterval, startOfDay, endOfDay, addDays, format } from 'date-fns'

const TIMEZONE = 'Europe/Riga'

/** Format a Date as 'YYYY-MM-DD' in Europe/Riga timezone */
function rigaDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE }) // sv-SE gives YYYY-MM-DD
}

/** Format a Date as 'HH:mm' in Europe/Riga timezone */
function rigaTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
}

export async function fetchIcsEvents(url: string, code: string, dateFrom: string, dateTo: string): Promise<any[]> {
  try {
    const res = await fetch(url)
    const icsText = await res.text()
    const jcalData = ICAL.parse(icsText)
    const vcalendar = new ICAL.Component(jcalData)
    const vevents = vcalendar.getAllSubcomponents('vevent')

    const rangeStart = startOfDay(parseISO(dateFrom))
    const rangeEnd = endOfDay(parseISO(dateTo))

    console.log(`[outlook/ics] Parsing ${vevents.length} VEVENT components for ${code}, range ${dateFrom}–${dateTo}`)
    const events: any[] = []
    for (const comp of vevents) {
      const event = new ICAL.Event(comp)
      // Expand recurring events
      if (event.isRecurring()) {
        try {
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
              const dateStr = rigaDate(occStart)
              const timeFromStr = rigaTime(occStart)
              const timeToStr = rigaTime(occEnd)
              let joinUrl: string | undefined
              const skypeData = comp.getFirstPropertyValue('x-microsoft-skypeteamsdata')
              if (skypeData) {
                try { const parsed = JSON.parse(String(skypeData)); if (parsed.joinUrl) joinUrl = parsed.joinUrl } catch {}
              }
              if (!joinUrl) {
                const desc = event.description || ''
                const teamsMatch = desc.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<"]+/)
                if (teamsMatch) joinUrl = teamsMatch[0]
              }
              events.push({
                id: `ics-${event.uid}-${dateStr}`,
                source: 'outlook' as const,
                isExternal: true,
                personCode: code,
                description: event.summary || '',
                date: dateStr,
                timeFrom: timeFromStr,
                timeTo: timeToStr,
                isOrganizer: false,
                location: event.location || undefined,
                bodyPreview: event.description || '',
                joinUrl,
                webLink: '',
                rsvpStatus: undefined,
              })
            }
            next = iter.next()
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

        // Extract Teams join URL from ICS properties
        let joinUrl: string | undefined
        const skypeData = comp.getFirstPropertyValue('x-microsoft-skypeteamsdata')
        if (skypeData) {
          try {
            const parsed = JSON.parse(String(skypeData))
            if (parsed.joinUrl) joinUrl = parsed.joinUrl
          } catch {}
        }
        if (!joinUrl) {
          const desc = event.description || ''
          const teamsMatch = desc.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<"]+/)
          if (teamsMatch) joinUrl = teamsMatch[0]
        }

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
            date: rigaDate(start),
            timeFrom: rigaTime(start),
            timeTo: rigaTime(end),
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
    return events
  } catch (e) {
    console.error(`[outlook] ICS fetch/parse failed for ${url}:`, e)
    return []
  }
}
