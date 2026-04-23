import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetch } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { createOutlookTask } from '@/lib/outlook/tasks'
import { createGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import { getCodeByEmail } from '@/lib/personCodes'
import { buildCreateTaskBody } from '@/lib/herbe/taskRecordUtils'
import { toHerbeForm } from '@/app/api/activities/route'

interface CreateBody {
  title: string
  description?: string
  dueDate?: string
  connectionId?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
  ccPersons?: string[]
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { source } = await params
  if (!['herbe', 'outlook', 'google'].includes(source)) {
    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as CreateBody
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  try {
    if (source === 'herbe') {
      const personCode = await getCodeByEmail(session.email, session.accountId)
      if (!personCode) return NextResponse.json({ error: 'no person code for user' }, { status: 400 })
      const conns = await getErpConnections(session.accountId)
      const conn = conns.find(c => c.id === body.connectionId) ?? conns[0]
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const formBody = toHerbeForm(buildCreateTaskBody({
        title: body.title,
        description: body.description,
        personCode,
        dueDate: body.dueDate,
        activityTypeCode: body.activityTypeCode,
        projectCode: body.projectCode,
        customerCode: body.customerCode,
        ccPersons: body.ccPersons,
      }))
      const res = await herbeFetch(REGISTERS.activities, undefined, {
        method: 'POST',
        body: formBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      }, conn)
      if (!res.ok) return NextResponse.json({ error: `ERP create ${res.status}` }, { status: 502 })
      return NextResponse.json({ ok: true })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await createOutlookTask(session.email, {
        title: body.title, description: body.description, dueDate: body.dueDate,
      }, azure)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await createGoogleTask(tokenId, session.email, session.accountId, {
        title: body.title, description: body.description, dueDate: body.dueDate,
      })
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks POST ${source}]`, e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
