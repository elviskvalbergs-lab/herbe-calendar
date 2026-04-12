import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { fetchOutlookEventsMinimal } from '@/lib/outlookUtils'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { emailForCode } from '@/lib/emailForCode'
import { isCalendarRecord, parsePersons } from '@/lib/herbe/recordUtils'
import { format, endOfMonth, parseISO } from 'date-fns'

type DaySummary = { sources: string[]; count: number }
type SummaryResponse = { summary: Record<string, DaySummary>; holidays: Record<string, { name: string; country: string }[]> }
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
  const personSet = new Set(personList)
  const result: Record<string, { sources: Set<string>; count: number }> = {}

  function addEntry(date: string, source: string) {
    if (!result[date]) result[date] = { sources: new Set(), count: 0 }
    result[date].sources.add(source)
    result[date].count++
  }

  // ERP
  try {
    const connections = await getErpConnections(session.accountId)
    for (const conn of connections) {
      try {
        const raw = await herbeFetchAll(REGISTERS.activities, { sort: 'TransDate', range: `${dateFrom}:${dateTo}` }, 100, conn)
        for (const record of raw) {
          const r = record as Record<string, unknown>
          if (!isCalendarRecord(r)) continue
          const { main, cc } = parsePersons(r)
          if ([...main, ...cc].some(p => personSet.has(p))) {
            addEntry(String(r['TransDate'] ?? ''), 'herbe')
          }
        }
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }

  // Outlook
  try {
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
  } catch { /* non-fatal */ }

  // Google (domain-wide)
  try {
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
  } catch { /* non-fatal */ }

  // Google (per-user)
  try {
    const { events: perUserEvents } = await fetchPerUserGoogleEvents(
      session.email, session.accountId, dateFrom, dateTo, 'items(start)',
    )
    for (const { event: ev, accountEmail } of perUserEvents) {
      const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
      if (date) addEntry(date, `google-user:${accountEmail}`)
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

  const responseData: SummaryResponse = { summary: serialized, holidays: holidayDates }
  cache.set(cacheKey, { data: responseData, ts: Date.now() })
  return NextResponse.json(responseData, { headers: { 'Cache-Control': 'no-store' } })
}
