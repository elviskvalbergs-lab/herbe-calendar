import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { updateOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import { buildCompleteTaskBody, buildEditTaskBody } from '@/lib/herbe/taskRecordUtils'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'

interface PatchBody {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
  connectionId?: string
  ccPersons?: string[]
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
          ccPersons: body.ccPersons,
        }),
      }
      const result = await saveActVcRecord(merged, { id, conn })
      if (!result.ok) {
        const payload: Record<string, unknown> = { error: result.error }
        if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
        return NextResponse.json(payload, { status: result.status })
      }
      return NextResponse.json({ ok: true, task: result.record })
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
