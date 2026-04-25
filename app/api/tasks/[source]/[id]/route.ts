import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { updateOutlookTask, moveOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import { buildCompleteTaskBody, buildEditTaskBody, mapHerbeTask } from '@/lib/herbe/taskRecordUtils'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'
import { upsertCachedTasks } from '@/lib/cache/tasks'
import type { Task } from '@/types/task'

interface PatchBody {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
  connectionId?: string
  mainPersons?: string[]
  ccPersons?: string[]
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
  /** Move the task to this Outlook list (delete+recreate). Ignored if unchanged. */
  targetListId?: string
  /** Display name for the target list (pass-through to the created Task's listName). */
  targetListTitle?: string
  /** Move the task to this Google task list (insert+delete). Ignored if unchanged. */
  targetGoogleListId?: string
  /** Display title for the Google target list. */
  targetGoogleListTitle?: string
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
          mainPersons: body.mainPersons,
          ccPersons: body.ccPersons,
          activityTypeCode: body.activityTypeCode,
          projectCode: body.projectCode,
          customerCode: body.customerCode,
        }),
      }
      // Temporary: log full mapping so the multi-person ERP save bug is
      // visible in Vercel runtime logs. Remove with the rest of the debug
      // instrumentation once root cause is found.
      console.log('[debug-erp-task-save] incoming body:', JSON.stringify(body))
      console.log('[debug-erp-task-save] merged ERP fields:', JSON.stringify(merged))
      // Allow MainPersons/CCPersons to be cleared — empty string is how ERP
      // drops the assignment or CC list. Without this the form silently
      // keeps the old values whenever the user removed them all.
      const result = await saveActVcRecord(merged, { id, conn, allowEmptyFields: new Set(['MainPersons', 'CCPersons']) })
      console.log('[debug-erp-task-save] saveActVcRecord result.ok:', result.ok, 'status:', result.ok ? 200 : result.status, 'error:', result.ok ? null : result.error)
      if (!result.ok) {
        const payload: Record<string, unknown> = { error: result.error }
        if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
        return NextResponse.json(payload, { status: result.status })
      }
      // Write-through: keep the cache in sync with the mutation so the next
      // read doesn't have to re-fetch the whole task list.
      const task = mapHerbeTask(result.record, '', conn.id, conn.name)
      await writeThroughTask(session.accountId, session.email, 'herbe', task)
      // Temporary: include the raw ERP record in the response so the in-UI
      // Save debug panel exposes MainPersons (which the mapped Task shape
      // intentionally drops). Lets us see what ERP actually persisted for
      // a multi-person task save without needing runtime logs. Removed
      // alongside the other debug instrumentation.
      return NextResponse.json({ ok: true, task, _debugErpRecord: result.record })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const task = body.targetListId
        ? await moveOutlookTask(session.email, id, {
            targetListId: body.targetListId,
            targetListTitle: body.targetListTitle,
            patch: {
              done: body.done, title: body.title,
              description: body.description, dueDate: body.dueDate,
            },
          }, azure)
        : await updateOutlookTask(session.email, id, {
            done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
          }, azure)
      await writeThroughTask(session.accountId, session.email, 'outlook', task)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const task = await updateGoogleTask(tokenId, session.email, session.accountId, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
        targetListId: body.targetGoogleListId,
        targetListTitle: body.targetGoogleListTitle,
      })
      await writeThroughTask(session.accountId, session.email, 'google', task)
      return NextResponse.json({ ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks PATCH ${source}/${id}]`, e)
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
    console.warn(`[tasks PATCH write-through ${source}]`, e)
  }
}
