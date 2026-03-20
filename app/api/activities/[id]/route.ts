import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchById } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'

function toHerbeForm(body: Record<string, unknown>): string {
  return Object.entries(body)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `set_field.${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

async function fetchActivity(id: string) {
  // Path-based URL (/ActVc/id) fetches one record — query ?id=X may scan all records
  const res = await herbeFetchById(REGISTERS.activities, id)
  if (!res.ok) return null
  const json = await res.json()
  // Handle both wrapped { data: { ActVc: [...] } } and direct record responses
  return (json?.data?.[REGISTERS.activities]?.[0] ?? json) as Record<string, unknown>
}

function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const mainPersons = String(activity['MainPersons'] ?? '').split(',').map(s => s.trim())
  if (mainPersons.includes(userCode)) return true
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
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
    const formBody = toHerbeForm(body)
    const res = await herbeFetchById(REGISTERS.activities, id, {
      method: 'PATCH',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    })
    const data = await res.json().catch(() => null)
    console.log(`PATCH ActVc/${id} → ${res.status}`, JSON.stringify(data))
    if (!res.ok) return NextResponse.json(data ?? { error: `Herbe error ${res.status}` }, { status: res.status })
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = (data.errors as Record<string, unknown>[]).map(e => String(e.message ?? e.text ?? e.msg ?? JSON.stringify(e)))
      return NextResponse.json({ error: msgs[0], errors: msgs.map(m => ({ message: m })) }, { status: 422 })
    }
    return NextResponse.json(data ?? {}, { status: 200 })
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
    const res = await herbeFetchById(REGISTERS.activities, id, { method: 'DELETE' })
    return new NextResponse(null, { status: res.ok ? 204 : res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
