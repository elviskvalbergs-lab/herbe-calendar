import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'

async function fetchActivity(id: string) {
  const res = await herbeFetch(REGISTERS.activities, `id=${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? data[0] : data
}

function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const owner = activity['Person'] as string | undefined
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
  if (owner === userCode) return true
  if (accessGroup?.split(',').map(s => s.trim()).includes(userCode)) return true
  return false
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const activity = await fetchActivity(id)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const body = await req.json()
    const res = await herbeFetch(REGISTERS.activities, `id=${id}`, {
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

  const activity = await fetchActivity(id)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const res = await herbeFetch(REGISTERS.activities, `id=${id}`, { method: 'DELETE' })
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
