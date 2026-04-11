import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchById, herbeWebExcellentDelete } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { extractHerbeError } from '@/lib/herbe/errors'
import { getErpConnections, type ErpConnection } from '@/lib/accountConfig'
import { trackEvent } from '@/lib/analytics'
import { toHerbeForm } from '../route'

async function resolveConnection(url: string, accountId: string): Promise<ErpConnection | undefined> {
  const connectionId = new URL(url).searchParams.get('connectionId')
  const connections = await getErpConnections(accountId)
  return connectionId ? connections.find(c => c.id === connectionId) : connections[0]
}

async function fetchActivity(id: string, conn?: ErpConnection) {
  const res = await herbeFetchById(REGISTERS.activities, id, undefined, conn)
  if (!res.ok) return null
  // ERP may return control characters in text fields — sanitize before parsing
  const text = await res.text()
  const sanitized = text.replace(/[\x00-\x1F\x7F]/g, ' ')
  const json = JSON.parse(sanitized)
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

  const conn = await resolveConnection(req.url, session.accountId)
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
    const rawText = await res.text()
    const sanitizedText = rawText.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ')
    const data = (() => { try { return JSON.parse(sanitizedText) } catch { return null } })()
    console.log(`PATCH ActVc/${id} → ${res.status}`)
    if (!res.ok) {
      const errMsg = data ? extractHerbeError(data) : `Herbe error ${res.status}`
      return NextResponse.json({ error: errMsg }, { status: res.status })
    }
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = (data.errors as unknown[]).map(e => extractHerbeError(e))
      return NextResponse.json({ error: msgs[0], errors: msgs.map(m => ({ message: m })) }, { status: 422 })
    }
    trackEvent(session.accountId, session.email, 'activity_edited').catch(() => {})
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

  const conn = await resolveConnection(req.url, session.accountId)
  const activity = await fetchActivity(id, conn)
  if (!activity) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEdit(activity, session.userCode)) return forbidden()

  try {
    const res = await herbeWebExcellentDelete(REGISTERS.activities, id, session.userCode, conn)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: text || `Herbe error ${res.status}` }, { status: res.status })
    }
    trackEvent(session.accountId, session.email, 'activity_deleted').catch(() => {})
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
