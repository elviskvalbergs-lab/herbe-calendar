import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchById, herbeWebExcellentDelete } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { extractHerbeError } from '@/lib/herbe/errors'
import { getErpConnections, type ErpConnection } from '@/lib/accountConfig'
import { toHerbeForm } from '../route'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

async function resolveConnection(url: string): Promise<ErpConnection | undefined> {
  const connectionId = new URL(url).searchParams.get('connectionId')
  const connections = await getErpConnections(DEFAULT_ACCOUNT_ID)
  return connectionId ? connections.find(c => c.id === connectionId) : connections[0]
}

async function fetchActivity(id: string, conn?: ErpConnection) {
  const res = await herbeFetchById(REGISTERS.activities, id, undefined, conn)
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

  const conn = await resolveConnection(req.url)
  const activity = await fetchActivity(id, conn)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const body = await req.json()
    const formBody = toHerbeForm(body, new Set(['CCPersons']))
    const res = await herbeFetchById(REGISTERS.activities, id, {
      method: 'PATCH',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    }, conn)
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const conn = await resolveConnection(req.url)
  const activity = await fetchActivity(id, conn)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const res = await herbeWebExcellentDelete(REGISTERS.activities, id, session.userCode, conn)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: text || `Herbe error ${res.status}` }, { status: res.status })
    }
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
