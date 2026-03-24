import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchById } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { toHerbeForm } from '../route'

function extractHerbeError(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    const msg = o.message ?? o.text ?? o.msg ?? o.description ?? o.Error ?? o.error
    if (msg) return String(msg)
    const parts: string[] = []
    if (o.field) parts.push(`field: ${o.field}`)
    if (o.code) parts.push(`code: ${o.code}`)
    if (o.vc) parts.push(`vc: ${o.vc}`)
    return parts.length ? parts.join(', ') : JSON.stringify(e).slice(0, 300)
  }
  return String(e)
}


async function fetchActivity(id: string) {
  // Path-based URL (/ActVc/id) fetches one record — query ?id=X may scan all records
  const res = await herbeFetchById(REGISTERS.activities, id)
  if (!res.ok) return null
  const json = await res.json()
  // Handle both wrapped { data: { ActVc: [...] } } and direct record responses
  return (json?.data?.[REGISTERS.activities]?.[0] ?? json) as Record<string, unknown>
}

export function canEdit(activity: Record<string, unknown>, userCode: string): boolean {
  const mainPersons = String(activity['MainPersons'] ?? '').split(',').map(s => s.trim())
  if (mainPersons.includes(userCode)) return true
  const accessGroup = activity[ACTIVITY_ACCESS_GROUP_FIELD] as string | undefined
  if (accessGroup?.split(',').map(s => s.trim()).includes(userCode)) return true
  const ccPersons = String(activity['CCPersons'] ?? '').split(',').map(s => s.trim())
  if (ccPersons.includes(userCode)) return true
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
    const formBody = toHerbeForm(body, new Set(['CCPersons']))
    const res = await herbeFetchById(REGISTERS.activities, id, {
      method: 'PATCH',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    })
    const data = await res.json().catch(() => null)
    console.log(`PATCH ActVc/${id} → ${res.status}`, JSON.stringify(data))
    if (!res.ok) {
      const errMsg = data ? extractHerbeError(data) : `Herbe error ${res.status}`
      return NextResponse.json({ error: errMsg }, { status: res.status })
    }
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = (data.errors as unknown[]).map(e => extractHerbeError(e))
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
