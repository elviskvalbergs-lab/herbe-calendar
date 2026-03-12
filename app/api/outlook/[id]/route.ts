import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    // Fetch the event to check organizer
    const check = await graphFetch(`/users/${session.email}/events/${id}`)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const body = await req.json()
    const res = await graphFetch(`/users/${session.email}/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const check = await graphFetch(`/users/${session.email}/events/${id}`)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const res = await graphFetch(`/users/${session.email}/events/${id}`, { method: 'DELETE' })
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
