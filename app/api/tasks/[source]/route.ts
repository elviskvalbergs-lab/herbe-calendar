import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { createOutlookTask } from '@/lib/outlook/tasks'
import { createGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import { getCodeByEmail } from '@/lib/personCodes'
import { buildCreateTaskBody, mapHerbeTask } from '@/lib/herbe/taskRecordUtils'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'
import { upsertCachedTasks } from '@/lib/cache/tasks'
import type { Task } from '@/types/task'

interface CreateBody {
  title: string
  description?: string
  dueDate?: string
  connectionId?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
  ccPersons?: string[]
  /** Outlook task list id (unified destination picker). */
  listId?: string
  /** Google per-user OAuth token row id (unified destination picker). */
  googleTokenId?: string
  /** Google Tasks list id (unified destination picker). */
  googleListId?: string
  /** Google Tasks list title — optional pass-through so the created Task carries the right listName without an extra API call. */
  googleListTitle?: string
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
      const result = await saveActVcRecord(buildCreateTaskBody({
        title: body.title,
        description: body.description,
        personCode,
        dueDate: body.dueDate,
        activityTypeCode: body.activityTypeCode,
        projectCode: body.projectCode,
        customerCode: body.customerCode,
        ccPersons: body.ccPersons,
      }), { conn })
      if (!result.ok) {
        const payload: Record<string, unknown> = { error: result.error }
        if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
        return NextResponse.json(payload, { status: result.status })
      }
      const task = mapHerbeTask(result.record, personCode, conn.id, conn.name)
      await writeThroughTask(session.accountId, session.email, 'herbe', task)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = await createOutlookTask(session.email, {
        title: body.title, description: body.description, dueDate: body.dueDate,
        listId: body.listId,
      }, azure)
      await writeThroughTask(session.accountId, session.email, 'outlook', task)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = body.googleTokenId ?? accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await createGoogleTask(tokenId, session.email, session.accountId, {
        title: body.title, description: body.description, dueDate: body.dueDate,
        listId: body.googleListId,
        listTitle: body.googleListTitle,
      })
      await writeThroughTask(session.accountId, session.email, 'google', task)
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks POST ${source}]`, e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function writeThroughTask(
  accountId: string,
  userEmail: string,
  source: Task['source'],
  task: Task,
): Promise<void> {
  try {
    await upsertCachedTasks([{
      accountId,
      userEmail,
      source,
      connectionId: task.sourceConnectionId ?? '',
      taskId: task.id,
      payload: task as unknown as Record<string, unknown>,
    }])
  } catch (e) {
    console.warn(`[tasks POST write-through ${source}]`, e)
  }
}
