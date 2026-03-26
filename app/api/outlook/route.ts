import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import type { Activity } from '@/types'

// Cache the full user list for the lifetime of the server process (small list, rarely changes)
let userListCache: Record<string, string> | null = null  // code → email

async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache) {
    try {
      const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
      userListCache = Object.fromEntries(
        (users as Record<string, unknown>[])
          .filter(u => u['Code'] && (u['emailAddr'] || u['LoginEmailAddr']))
          .map(u => [u['Code'] as string, (u['emailAddr'] || u['LoginEmailAddr']) as string])
      )
    } catch (e) {
      console.warn('[outlook] UserVc unavailable, skipping Outlook calendar:', String(e))
      userListCache = {}
    }
  }
  return userListCache[code] ?? null
}

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? date
  const dateTo = searchParams.get('dateTo') ?? date

  if (!persons || !dateFrom) return NextResponse.json({ error: 'persons and date required' }, { status: 400 })

  const personList = persons.split(',').map(p => p.trim())

  try {
    const results = await Promise.all(personList.map(async code => {
      const email = await emailForCode(code)
      if (!email) return []

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
          const session = await requireSession()
          const sessionEmail = session?.email
          if (sessionEmail) {
            const listRes = await graphFetch(`/users/${sessionEmail}/calendars?$select=id,owner`)
            if (listRes.ok) {
              const listData = await listRes.json()
              const sharedCal = (listData.value as any[])?.find(c => 
                c.owner?.address?.toLowerCase() === email.toLowerCase()
              )
              if (sharedCal) {
                res = await graphFetch(
                  `/users/${sessionEmail}/calendars/${sharedCal.id}/calendarView?${calendarViewParams}`,
                  { headers: { 'Prefer': 'outlook.timezone="Europe/Riga"' } }
                )
              }
            }
          }
        } catch (e) {
          console.warn('[outlook] Fallback shared calendar search failed:', String(e))
        }
      }

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Graph calendarView failed for ${email}: ${res.status} ${errText}`)
        throw new Error(`Graph ${res.status}: ${errText}`)
      }
      const data = await res.json()
      return (data.value ?? []).map((ev: Record<string, unknown>) => {
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
    }))
    return NextResponse.json(results.flat())
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
    const body = await req.json()
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
