import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import type { Activity } from '@/types'
import ICAL from 'ical.js'
import { parseISO, isWithinInterval, startOfDay, endOfDay, addDays, format } from 'date-fns'
import { pool } from '@/lib/db'

async function fetchIcsEvents(url: string, code: string, dateFrom: string, dateTo: string): Promise<any[]> {
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
              const dtStr = occStart.toISOString()
              const endDtStr = occEnd.toISOString()
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
                id: `ics-${event.uid}-${dtStr.slice(0, 10)}`,
                source: 'outlook' as const,
                isExternal: true,
                personCode: code,
                description: event.summary || '',
                date: dtStr.slice(0, 10),
                timeFrom: dtStr.slice(11, 16),
                timeTo: endDtStr.slice(11, 16),
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
          const dtStr = start.toISOString()
          const endDtStr = end.toISOString()
          events.push({
            id: `ics-${event.uid}`,
            source: 'outlook' as const,
            isExternal: true,
            personCode: code,
            description: event.summary || '',
            date: dtStr.slice(0, 10),
            timeFrom: dtStr.slice(11, 16),
            timeTo: endDtStr.slice(11, 16),
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

// Cache the full user list with TTL (small list, rarely changes)
let userListCache: { data: Record<string, string>; ts: number } | null = null
const USER_LIST_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache || Date.now() - userListCache.ts > USER_LIST_CACHE_TTL) {
    try {
      const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
      const data = Object.fromEntries(
        (users as Record<string, unknown>[])
          .filter(u => u['Code'] && (u['emailAddr'] || u['LoginEmailAddr']))
          .map(u => [u['Code'] as string, (u['emailAddr'] || u['LoginEmailAddr']) as string])
      )
      userListCache = { data, ts: Date.now() }
    } catch (e) {
      console.warn('[outlook] UserVc unavailable, skipping Outlook calendar:', String(e))
      userListCache = { data: {}, ts: Date.now() }
    }
  }
  return userListCache.data[code] ?? null
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const dateStr = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? dateStr
  const dateTo = searchParams.get('dateTo') ?? dateStr

  if (!persons || !dateFrom || !dateTo) return NextResponse.json({ error: 'persons and dates required' }, { status: 400 })

  const personList = persons.split(',').map(p => p.trim())
  const sessionEmail = session.email

  try {
    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code)
      if (!email) return []

      // --- ICS feeds (DB-backed) — fetched in parallel with Graph ---
      let icsEventsPromise: Promise<any[]> = Promise.resolve([])
      try {
        const { rows: icsRows } = await pool.query(
          'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2',
          [session.email, code]
        )
        if (icsRows.length > 0) {
          console.log(`[outlook] Found ${icsRows.length} ICS feed(s) for ${code}`)
          icsEventsPromise = Promise.all(
            icsRows.map(async row => {
              const events = await fetchIcsEvents(row.ics_url as string, code, dateFrom, dateTo)
              return events.map(ev => ({
                ...ev,
                ...(row.color ? { icsColor: row.color } : {}),
                icsCalendarName: row.name,
              }))
            })
          ).then(results => results.flat())
        }
      } catch (e) {
        console.warn(`[outlook] DB lookup for ICS failed for ${code}:`, e)
      }

      // calendarView expands recurring events automatically; no type filter needed
      const startDt = `${dateFrom}T00:00:00`
      const endDt = `${dateTo}T23:59:59`
      const calendarViewParams = `startDateTime=${startDt}&endDateTime=${endDt}&$top=100`
      
      let res = await graphFetch(
        `/users/${email}/calendarView?${calendarViewParams}`,
        { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } }
      )

      if (!res.ok && res.status === 404) {
        // Fallback: If 404, this user isn't in the tenant. 
        // Search the logged-in user's own shared calendars list for a match.
        try {
          if (sessionEmail) {
            const listRes = await graphFetch(`/users/${sessionEmail}/calendars?$select=id,owner`)
            if (listRes.ok) {
              const listData = await listRes.json()
              const cals = listData.value as any[]
              console.log(`[outlook] Fallback for ${email}: searching ${cals?.length ?? 0} calendars of ${sessionEmail}`)
              const sharedCal = cals?.find(c => 
                c.owner?.address?.toLowerCase() === email.toLowerCase()
              )
              if (sharedCal) {
                console.log(`[outlook] Fallback found calendar ID ${sharedCal.id} for ${email}`)
                res = await graphFetch(
                  `/users/${sessionEmail}/calendars/${sharedCal.id}/calendarView?${calendarViewParams}`,
                  { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } }
                )
              } else {
                console.log(`[outlook] Fallback: No calendar owned by ${email} found in ${sessionEmail}'s list`)
              }
            } else {
              const listErr = await listRes.text()
              console.warn(`[outlook] Fallback lookup failed for ${sessionEmail}: ${listRes.status} ${listErr}`)
            }
          }
        } catch (e) {
          console.warn('[outlook] Fallback shared calendar search failed:', String(e))
        }
      }

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Graph calendarView failed for ${email}: ${res.status} ${errText}`)
        // Graph failed — still return any ICS events for this person
        return icsEventsPromise
      }
      const data = await res.json()
      const icsEvents = await icsEventsPromise
      const graphEvents = (data.value ?? []).map((ev: Record<string, unknown>) => {
        const start = (ev['start'] as Record<string, string> | undefined)
        const end = (ev['end'] as Record<string, string> | undefined)
        const startDt = start?.dateTime ?? ''
        const endDt = end?.dateTime ?? ''
        const organizer = ev['organizer'] as Record<string, unknown> | undefined
        const organizerEmail = (organizer?.['emailAddress'] as Record<string, string> | undefined)?.['address'] ?? ''
        const onlineMeeting = ev['onlineMeeting'] as Record<string, string> | undefined
        const joinUrl = onlineMeeting?.['joinUrl'] ?? (ev['onlineMeetingUrl'] as string | undefined) ?? undefined
        const responseStatus = ev['responseStatus'] as Record<string, string> | undefined
        const rawRsvp = responseStatus?.['response']
        // Graph returns 'none' for unresponded events; map to undefined so buttons show unselected
        const rsvpStatus = (rawRsvp && rawRsvp !== 'none') ? rawRsvp as Activity['rsvpStatus'] : undefined
        return {
          id: String(ev['id'] ?? ''),
          source: 'outlook' as const,
          personCode: code,
          description: String(ev['subject'] ?? ''),
          date: startDt.slice(0, 10),
          timeFrom: startDt.slice(11, 16),
          timeTo: endDt.slice(11, 16),
          isOrganizer: organizerEmail.toLowerCase() === email.toLowerCase(),
          location: (ev['location'] as Record<string, string> | undefined)?.['displayName'],
          bodyPreview: String(ev['bodyPreview'] ?? ''),
          joinUrl,
          webLink: String(ev['webLink'] ?? ''),
          rsvpStatus,
        }
      })
      // Deduplicate: if an ICS event matches a Graph event by date+time+subject, skip it
      const graphKeys = new Set(graphEvents.map((e: any) => `${e.date}|${e.timeFrom}|${e.timeTo}|${e.description.toLowerCase()}`))
      const uniqueIcs = icsEvents.filter((e: any) => !graphKeys.has(`${e.date}|${e.timeFrom}|${e.timeTo}|${e.description.toLowerCase()}`))
      return [...graphEvents, ...uniqueIcs]
    }))
    return NextResponse.json(results.flat(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const raw = await req.json()
    const ALLOWED_POST_FIELDS = ['subject', 'body', 'start', 'end', 'location', 'attendees', 'isOnlineMeeting', 'onlineMeetingProvider'] as const
    const body: Record<string, unknown> = {}
    for (const key of ALLOWED_POST_FIELDS) {
      if (raw[key] !== undefined) body[key] = raw[key]
    }
    const email = session.email
    const res = await graphFetch(`/users/${email}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 201 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
