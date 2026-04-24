import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAzureConfig } from '@/lib/accountConfig'
import type { Activity } from '@/types'
import { deduplicateIcsAgainstGraph } from '@/lib/icsParser'
import { fetchIcsForPerson } from '@/lib/icsUtils'
import { emailForCode } from '@/lib/emailForCode'
import { fetchOutlookEventsForPerson, mapOutlookEvent } from '@/lib/outlookUtils'
import { getCachedEvents, upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { hasCompletedInitialSync } from '@/lib/cache/syncState'
import { isRangeCovered } from '@/lib/sync/erp'
import { buildOutlookCacheRows } from '@/lib/sync/graph'
import { listAccountPersons } from '@/lib/cache/accountPersons'

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

  const bustIcsCache = searchParams.get('bustIcsCache') === '1'

  if (!persons || !dateFrom || !dateTo) return NextResponse.json({ error: 'persons and dates required' }, { status: 400 })

  const personList = persons.split(',').map(p => p.trim())
  const sessionEmail = session.email

  const azureConfig = await getAzureConfig(session.accountId)

  try {
    const [withinWindow, initialSyncDone] = await Promise.all([
      Promise.resolve(isRangeCovered(dateFrom, dateTo)),
      hasCompletedInitialSync(session.accountId, 'outlook'),
    ])
    const canUseCache = withinWindow && initialSyncDone

    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code, session.accountId)
      if (!email) return { events: [], warnings: [] }

      // --- ICS feeds (DB-backed) — fetched in parallel with Graph ---
      const icsEventsPromise = fetchIcsForPerson(session.email, code, session.accountId, dateFrom, dateTo, bustIcsCache)
        .catch(e => {
          console.warn(`[outlook] ICS fetch failed for ${code}:`, e)
          return { events: [], warnings: [] }
        })

      // Skip Graph if Azure not configured — ICS events still returned
      if (!azureConfig) {
        const icsResult = await icsEventsPromise
        return { events: icsResult.events, warnings: icsResult.warnings }
      }

      let graphEvents: Activity[] = []
      if (canUseCache) {
        const cached = await getCachedEvents(session.accountId, [code], dateFrom, dateTo, 'outlook')
        graphEvents = cached as Activity[]
      }
      if (!canUseCache || graphEvents.length === 0) {
        // Fetch via shared util; pass sessionEmail to enable the 404 shared-calendar fallback
        const rawEvents = await fetchOutlookEventsForPerson(email, session.accountId, dateFrom, dateTo, sessionEmail)
        if (rawEvents === null) {
          // Graph failed — still return any ICS events for this person
          const icsResult = await icsEventsPromise
          return { events: icsResult.events, warnings: [...icsResult.warnings, `Outlook: Graph request failed for ${email}`] }
        }
        graphEvents = rawEvents.map(ev => mapOutlookEvent(ev, code, sessionEmail))
      }

      const icsResult = await icsEventsPromise
      // Deduplicate: if an ICS event matches a Graph event by date+time+subject, skip it
      const uniqueIcs = deduplicateIcsAgainstGraph(graphEvents as unknown as Record<string, unknown>[], icsResult.events)
      return { events: [...graphEvents, ...uniqueIcs], warnings: icsResult.warnings }
    }))
    const allEvents = results.flatMap(r => 'events' in r ? r.events : r)
    const allWarnings = results.flatMap(r => 'warnings' in r ? r.warnings : [])

    const response: Record<string, unknown> = { activities: allEvents }
    if (allWarnings.length > 0) response.warnings = allWarnings
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[outlook] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
    const postAzureConfig = await getAzureConfig(session.accountId)
    if (!postAzureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })
    const res = await graphFetch(`/users/${email}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, postAzureConfig)
    const data = await res.json()

    // Write-through: cache the created event for every attendee with a person_code
    if (res.ok) {
      try {
        const accountPersons = await listAccountPersons(session.accountId)
        const emailToCode = new Map(accountPersons.map(p => [p.email.toLowerCase(), p.code]))
        const attendeeEmails: string[] = (data?.attendees ?? [])
          .map((a: { emailAddress?: { address?: string } }) => a.emailAddress?.address?.toLowerCase())
          .filter((x: string | undefined): x is string => !!x)
        const codes = new Set<string>()
        const orgCode = emailToCode.get(session.email.toLowerCase())
        if (orgCode) codes.add(orgCode)
        for (const addr of attendeeEmails) {
          const c = emailToCode.get(addr)
          if (c) codes.add(c)
        }
        const rows: CachedEventRow[] = []
        for (const code of codes) {
          rows.push(...buildOutlookCacheRows(data, session.accountId, code, session.email))
        }
        if (rows.length > 0) {
          await upsertCachedEvents(rows)
        }
      } catch (e) {
        console.warn('[outlook/POST] cache write-through error:', e)
      }
    }

    return NextResponse.json(data, { status: res.ok ? 201 : res.status })
  } catch (e) {
    console.error('[outlook] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
