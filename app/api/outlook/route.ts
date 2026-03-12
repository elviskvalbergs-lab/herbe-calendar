import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'

// Cache the full user list for the lifetime of the server process (small list, rarely changes)
let userListCache: Record<string, string> | null = null  // code → email

async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache) {
    const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
    userListCache = Object.fromEntries(
      (users as Record<string, unknown>[])
        .filter(u => u['Code'] && u['Email'])
        .map(u => [u['Code'] as string, u['Email'] as string])
    )
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

      // Use calendarView for date-range queries; exclude recurring series masters
      const startDt = `${dateFrom}T00:00:00`
      const endDt = `${dateTo ?? dateFrom}T23:59:59`
      const res = await graphFetch(
        `/users/${email}/calendarView?startDateTime=${startDt}&endDateTime=${endDt}&$filter=type eq 'singleInstance'&$top=100`
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data.value ?? []).map((ev: Record<string, unknown>) => ({
        ...ev,
        _personCode: code,
        _source: 'outlook',
      }))
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
