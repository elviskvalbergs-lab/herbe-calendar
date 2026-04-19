import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'
import { fetchOutlookEventsMinimal } from '@/lib/outlookUtils'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { emailForCode } from '@/lib/emailForCode'
import { fetchErpActivitiesForConnectionOrStale } from '@/lib/herbe/recordUtils'
import { getCachedEvents } from '@/lib/cache/events'
import { hasCompletedInitialSync, getSyncedConnectionIds } from '@/lib/cache/syncState'
import { isRangeCovered } from '@/lib/sync/erp'
import { format, endOfMonth, parseISO } from 'date-fns'

type DaySummary = { sources: string[]; count: number }
type SummaryResponse = {
  summary: Record<string, DaySummary>
  holidays: Record<string, { name: string; country: string }[]>
  staleConnections?: string[]
}
const cache = new Map<string, { data: SummaryResponse; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons') ?? ''
  const month = searchParams.get('month') ?? format(new Date(), 'yyyy-MM')

  if (!persons) return NextResponse.json({})

  const cacheKey = `${session.accountId}:${persons}:${month}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { 'Cache-Control': 'no-store' } })
  }



  const dateFrom = `${month}-01`
  const dateTo = format(endOfMonth(parseISO(dateFrom)), 'yyyy-MM-dd')
  const personList = persons.split(',').map(p => p.trim())
  const result: Record<string, { sources: Set<string>; count: number }> = {}
  const staleConnections: string[] = []

  function addEntry(date: string, source: string) {
    if (!result[date]) result[date] = { sources: new Set(), count: 0 }
    result[date].sources.add(source)
    result[date].count++
  }

  // ERP: per-connection cache-vs-live. For each connection, if it has
  // completed a full sync and the range is inside the sync window, serve
  // from cache; otherwise live-fetch that connection only. On live-fetch
  // failure we fall back to cached rows (even if the sync_state is in
  // error) so the month view doesn't silently drop dots while the
  // connection recovers.
  try {
    const withinWindow = isRangeCovered(dateFrom, dateTo)
    const [connections, syncedIds] = await Promise.all([
      getErpConnections(session.accountId),
      getSyncedConnectionIds(session.accountId, 'herbe'),
    ])
    for (const conn of connections) {
      if (withinWindow && syncedIds.has(conn.id)) {
        const cached = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'herbe', conn.id)
        for (const ev of cached) {
          if (ev.date) addEntry(ev.date, 'herbe')
        }
      } else {
        const { activities, stale } = await fetchErpActivitiesForConnectionOrStale(
          conn, session.accountId, personList, dateFrom, dateTo,
        )
        for (const ev of activities) {
          if (ev.date) addEntry(ev.date, 'herbe')
        }
        if (stale) staleConnections.push(conn.name)
      }
    }
  } catch { /* non-fatal */ }

  // Outlook: cache when the range is inside the sync window AND the account
  // has completed a full outlook sync; live otherwise.
  try {
    const [withinWindow, outlookSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'outlook'),
    ])
    const canUseOutlookCache = withinWindow && outlookSyncDone
    let usedCache = false
    if (canUseOutlookCache) {
      const cached = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'outlook')
      if (cached.length > 0) {
        for (const ev of cached) {
          if (ev.date) addEntry(ev.date, 'outlook')
        }
        usedCache = true
      }
    }
    if (!usedCache) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const events = await fetchOutlookEventsMinimal(email, session.accountId, dateFrom, dateTo)
          if (events) {
            for (const ev of events) {
              const date = (ev.start?.dateTime ?? '').slice(0, 10)
              if (date) addEntry(date, 'outlook')
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  // Google (domain-wide): cache when covered and synced; live otherwise.
  try {
    const [withinWindow, googleSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'google'),
    ])
    const canUseGoogleCache = withinWindow && googleSyncDone
    let usedCache = false
    if (canUseGoogleCache) {
      const cached = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'google')
      if (cached.length > 0) {
        for (const ev of cached) {
          if (ev.date) addEntry(ev.date, 'google')
        }
        usedCache = true
      }
    }
    if (!usedCache) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const items = await fetchGoogleEventsForPerson(email, session.accountId, dateFrom, dateTo, 'items(start)')
          if (items) {
            for (const ev of items) {
              const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
              if (date) addEntry(date, 'google')
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  // Google (per-user): cache when covered and synced; live otherwise.
  try {
    const [withinWindow, googleUserSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'google-user'),
    ])
    const canUseGoogleUserCache = withinWindow && googleUserSyncDone
    let usedCache = false
    if (canUseGoogleUserCache) {
      const cached = await getCachedEvents(session.accountId, personList, dateFrom, dateTo, 'google-user')
      if (cached.length > 0) {
        for (const ev of cached) {
          if (ev.date) {
            const accountEmail = ev.googleAccountEmail ?? ''
            addEntry(ev.date, `google-user:${accountEmail}`)
          }
        }
        usedCache = true
      }
    }
    if (!usedCache) {
      const { events: perUserEvents } = await fetchPerUserGoogleEvents(
        session.email, session.accountId, dateFrom, dateTo, 'items(start)',
      )
      for (const { event: ev, accountEmail } of perUserEvents) {
        const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
        if (date) addEntry(date, `google-user:${accountEmail}`)
      }
    }
  } catch { /* non-fatal */ }

  // Shared calendars from other users
  try {
    const { fetchSharedCalendarEvents } = await import('@/lib/sharedCalendars')
    const shared = await fetchSharedCalendarEvents(personList, session.email, session.accountId, dateFrom, dateTo)
    for (const ev of shared.events) {
      if (ev.date) addEntry(ev.date, 'shared')
    }
  } catch { /* non-fatal */ }

  // Convert Sets to arrays for JSON serialization
  const serialized: Record<string, DaySummary> = {}
  for (const [date, entry] of Object.entries(result)) {
    serialized[date] = { sources: [...entry.sources], count: entry.count }
  }

  // Fetch holidays
  let holidayDates: Record<string, { name: string; country: string }[]> = {}
  try {
    const { getPersonsHolidayCountries, getHolidaysForRange } = await import('@/lib/holidays')
    const countryMap = await getPersonsHolidayCountries(personList, session.accountId)
    const countryCodes = [...new Set(countryMap.values())]
    if (countryCodes.length > 0) {
      const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)
      for (const [date, hols] of holidays) {
        holidayDates[date] = hols.map(h => ({ name: h.name, country: h.country }))
      }
    }
  } catch { /* non-fatal */ }

  const responseData: SummaryResponse = {
    summary: serialized,
    holidays: holidayDates,
    ...(staleConnections.length > 0 ? { staleConnections } : {}),
  }
  cache.set(cacheKey, { data: responseData, ts: Date.now() })
  return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } })
}
