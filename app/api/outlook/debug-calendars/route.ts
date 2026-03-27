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
        if (cal.owner) return cal

        // Strategy 1: Explicit select (sometimes Graph returns owner if explicitly asked by ID)
        const explicitRes = await graphFetch(`/users/${email}/calendars/${cal.id}?$select=name,owner`)
        if (explicitRes.ok) {
            const explicitData = await explicitRes.json()
            if (explicitData.owner) {
                return { ...cal, owner: explicitData.owner, _identifiedBy: 'explicit_select' }
            }
        }

        // Strategy 2: Event Hack (fetch top organizer)
        const eventRes = await graphFetch(`/users/${email}/calendars/${cal.id}/events?$top=1&$select=organizer`)
        if (eventRes.ok) {
            const eventData = await eventRes.json()
            const topEvent = eventData.value?.[0]
            if (topEvent?.organizer?.emailAddress) {
                return { 
                    ...cal, 
                    owner: topEvent.organizer.emailAddress, 
                    _identifiedBy: 'event_organizer',
                    _sampleEventOrganizer: topEvent.organizer.emailAddress 
                }
            }
        }

        return cal
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
