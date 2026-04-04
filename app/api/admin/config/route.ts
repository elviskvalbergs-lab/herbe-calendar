import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { saveAzureConfig, getAzureConfig } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const body = await req.json()

    if (body.type === 'azure') {
      // Get existing config to preserve secret if not provided
      const existing = await getAzureConfig(session.accountId)
      await saveAzureConfig(session.accountId, {
        tenantId: body.tenantId ?? '',
        clientId: body.clientId ?? '',
        clientSecret: body.clientSecret || existing?.clientSecret || '',
        senderEmail: body.senderEmail ?? '',
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown config type' }, { status: 400 })
  } catch (e) {
    console.error('[admin/config PUT]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await req.json()

  if (body.action === 'test-azure') {
    try {
      const config = await getAzureConfig(session.accountId)
      if (!config) return NextResponse.json({ ok: false, error: 'Azure not configured' })
      const res = await graphFetch('/users?$select=id&$top=1', undefined, config)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json({ ok: false, error: `Graph API error ${res.status}: ${text.slice(0, 200)}` })
      }
      const data = await res.json()
      // Count total users
      const countRes = await graphFetch('/users/$count', { headers: { ConsistencyLevel: 'eventual' } }, config)
      const userCount = countRes.ok ? parseInt(await countRes.text()) : (data.value?.length ?? 0)
      return NextResponse.json({ ok: true, userCount })
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e) })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
