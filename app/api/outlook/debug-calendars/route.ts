import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { graphFetch } from '@/lib/graph/client'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const email = session?.user?.email
    const host = req.headers.get('host')

    if (!email) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        message: 'No session found. Please sign in first.',
        host,
        hint: 'Make sure you are signed in on this same domain.'
      }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const full = searchParams.get('full') === '1'
    
    // 1. List all calendars
    const res = await graphFetch(`/users/${email}/calendars${full ? '' : '?$select=id,name,owner,canEdit'}`)
    if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `Graph failed: ${res.status}`, detail: err }, { status: res.status })
    }
    const data = await res.json()
    const calendars = data.value ?? []

    // 2. Identification Logic for null owners
    const identifiedCals = await Promise.all(calendars.map(async (cal: any) => {
        const debugLogs: string[] = []
        if (cal.owner) return { ...cal, _identifiedBy: 'existing_metadata' }

        // Strategy 1: Explicit select
        try {
            const explicitRes = await graphFetch(`/users/${email}/calendars/${cal.id}?$select=name,owner`)
            if (explicitRes.ok) {
                const explicitData = await explicitRes.json()
                if (explicitData.owner) {
                    return { ...cal, owner: explicitData.owner, _identifiedBy: 'explicit_select' }
                }
                debugLogs.push('Explicit select returned ok but owner was null')
            } else {
                debugLogs.push(`Explicit select failed: ${explicitRes.status} ${await explicitRes.text().catch(() => '')}`)
            }
        } catch (err) {
            debugLogs.push(`Explicit select exception: ${err}`)
        }

        // Strategy 2: Event Hack (Aggressive)
        try {
            const start = new Date()
            start.setFullYear(start.getFullYear() - 1)
            const end = new Date()
            end.setFullYear(end.getFullYear() + 1)
            const viewQuery = `?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=1&$select=organizer`
            const eventRes = await graphFetch(`/users/${email}/calendars/${cal.id}/calendarView${viewQuery}`)
            if (eventRes.ok) {
                const eventData = await eventRes.json()
                const topEvent = eventData.value?.[0]
                if (topEvent?.organizer?.emailAddress) {
                    return { 
                        ...cal, 
                        owner: topEvent.organizer.emailAddress, 
                        _identifiedBy: 'event_organizer_view',
                        _sampleEventOrganizer: topEvent.organizer.emailAddress 
                    }
                }
                debugLogs.push('Event hack (view) returned ok but still no events found in 2-year window')
            } else {
                debugLogs.push(`Event hack (view) failed: ${eventRes.status} ${await eventRes.text().catch(() => '')}`)
            }
        } catch (err) {
            debugLogs.push(`Event hack (view) exception: ${err}`)
        }

        return { ...cal, _identifiedBy: 'failed', _debugLogs: debugLogs }
    }))

    // 3. Calendar Groups
    const groupsRes = await graphFetch(`/users/${email}/calendarGroups`)
    const groupsData = groupsRes.ok ? await groupsRes.json() : { value: [] }

    return NextResponse.json({
        user: email,
        calendars: identifiedCals,
        calendarGroups: groupsData.value ?? []
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
