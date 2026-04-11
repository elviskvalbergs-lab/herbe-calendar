import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient, getOAuthCalendarClient } from '@/lib/google/client'
import { getUserGoogleAccounts, getValidAccessToken } from '@/lib/google/userOAuth'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { graphFetch } from '@/lib/graph/client'
import { emailForCode } from '@/lib/emailForCode'
import { isCalendarRecord, parsePersons } from '@/lib/herbe/recordUtils'
import { format, endOfMonth, parseISO } from 'date-fns'

type DaySummary = { sources: string[]; count: number }
const cache = new Map<string, { data: Record<string, DaySummary>; ts: number }>()
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
    const azureConfig = await getAzureConfig(session.accountId)
    if (azureConfig) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const res = await graphFetch(
            `/users/${email}/calendarView?startDateTime=${dateFrom}T00:00:00&endDateTime=${dateTo}T23:59:59&$select=start&$top=500`,
            { headers: { Prefer: 'outlook.timezone="Europe/Riga"' } },
            azureConfig
          )
          if (res.ok) {
            const data = await res.json()
            for (const ev of data.value ?? []) {
              const date = ((ev.start as { dateTime?: string })?.dateTime ?? '').slice(0, 10)
              if (date) addEntry(date, 'outlook')
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  // Google (domain-wide)
  try {
    const googleConfig = await getGoogleConfig(session.accountId)
    if (googleConfig) {
      for (const code of personList) {
        try {
          const email = await emailForCode(code, session.accountId)
          if (!email) continue
          const calendar = getCalendarClient(googleConfig, email)
          const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            singleEvents: true,
            fields: 'items(start)',
            maxResults: 500,
          })
          for (const ev of res.data.items ?? []) {
            const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
            if (date) addEntry(date, 'google')
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  // Google (per-user)
  try {
    const userAccounts = await getUserGoogleAccounts(session.email, session.accountId)
    for (const account of userAccounts) {
      const enabledCals = account.calendars.filter(c => c.enabled)
      if (enabledCals.length === 0) continue
      const accessToken = await getValidAccessToken(account.id)
      if (!accessToken) continue
      const oauthCal = getOAuthCalendarClient(accessToken)
      for (const cal of enabledCals) {
        try {
          const res = await oauthCal.events.list({
            calendarId: cal.calendarId,
            timeMin: `${dateFrom}T00:00:00Z`,
            timeMax: `${dateTo}T23:59:59Z`,
            singleEvents: true,
            fields: 'items(start)',
            maxResults: 500,
          })
          for (const ev of res.data.items ?? []) {
            const date = (ev.start?.dateTime ?? ev.start?.date ?? '').slice(0, 10)
            if (date) addEntry(date, `google-user:${account.googleEmail}`)
          }
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  // Convert Sets to arrays for JSON serialization
  const serialized: Record<string, DaySummary> = {}
  for (const [date, entry] of Object.entries(result)) {
    serialized[date] = { sources: [...entry.sources], count: entry.count }
  }

  cache.set(cacheKey, { data: serialized, ts: Date.now() })
  return NextResponse.json(serialized, { headers: { 'Cache-Control': 'no-store' } })
}
