import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { getAzureConfig } from '@/lib/accountConfig'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const azureConfig = await getAzureConfig(session.accountId)
  if (!azureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })

  try {
    const check = await graphFetch(`/users/${session.email}/events/${id}`, undefined, azureConfig)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const raw = await req.json()
    const ALLOWED_PUT_FIELDS = ['subject', 'body', 'start', 'end', 'location', 'attendees'] as const
    const body: Record<string, unknown> = {}
    for (const key of ALLOWED_PUT_FIELDS) {
      if (raw[key] !== undefined) body[key] = raw[key]
    }
    const res = await graphFetch(`/users/${session.email}/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, azureConfig)
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

  const azureConfig = await getAzureConfig(session.accountId)
  if (!azureConfig) return NextResponse.json({ error: 'Azure not configured' }, { status: 400 })

  try {
    const check = await graphFetch(`/users/${session.email}/events/${id}`, undefined, azureConfig)
    if (!check.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const ev = await check.json() as Record<string, unknown>
    const organizer = ev['organizer'] as { emailAddress?: { address?: string } } | undefined
    if (organizer?.emailAddress?.address?.toLowerCase() !== session.email.toLowerCase()) {
      return forbidden()
    }

    const res = await graphFetch(`/users/${session.email}/events/${id}`, { method: 'DELETE' }, azureConfig)
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
