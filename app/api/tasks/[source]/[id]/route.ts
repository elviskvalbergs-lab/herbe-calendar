import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { herbeFetchById } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { updateOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import { buildCompleteTaskBody, buildEditTaskBody } from '@/lib/herbe/taskRecordUtils'
import { toHerbeForm } from '@/app/api/activities/route'

interface PatchBody {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
  connectionId?: string
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { source, id } = await params
  if (!['herbe', 'outlook', 'google'].includes(source)) {
    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({})) as PatchBody

  try {
    if (source === 'herbe') {
      const conns = await getErpConnections(session.accountId)
      const conn = conns.find(c => c.id === body.connectionId) ?? conns[0]
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const merged = {
        ...(body.done !== undefined ? buildCompleteTaskBody(body.done) : {}),
        ...buildEditTaskBody({
          title: body.title,
          description: body.description,
          dueDate: body.dueDate ?? undefined,
        }),
      }
      const formBody = toHerbeForm(merged)
      const res = await herbeFetchById(REGISTERS.activities, id, {
        method: 'PATCH',
        body: formBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      }, conn)
      if (!res.ok) {
        return NextResponse.json({ error: `ERP update ${res.status}` }, { status: 502 })
      }
      return NextResponse.json({ ok: true })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await updateOutlookTask(session.email, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
      }, azure)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await updateGoogleTask(tokenId, session.email, session.accountId, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
      })
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks PATCH ${source}/${id}]`, e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
