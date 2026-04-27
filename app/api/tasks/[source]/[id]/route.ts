import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { updateOutlookTask, moveOutlookTask, deleteOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask, deleteGoogleTask } from '@/lib/google/tasks'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getMemberTimezone } from '@/lib/accountTimezone'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import {
  buildCompleteTaskBody,
  buildEditTaskBody,
  deleteHerbeTask,
  mapHerbeTask,
} from '@/lib/herbe/taskRecordUtils'
import { saveActVcRecord } from '@/lib/herbe/actVcSave'
import { upsertCachedTasks, deleteCachedTask } from '@/lib/cache/tasks'
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
  /** The id of the list the task currently lives in (Outlook list id or
   *  Google task list id). When supplied the source-side helper skips the
   *  N+1 "find the list" probe. Optional; falsy values fall back to probing. */
  currentListId?: string
}

interface DeleteBody {
  connectionId?: string
  /** Optional: list id the task currently lives in, to skip the N+1 probe. */
  currentListId?: string
}

// ---------- shared validators ----------

const ID_REJECT_RE = /[/?#]/

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === 'string'
}
function isOptionalNullableString(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === 'string'
}
function isOptionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === 'boolean'
}
function isOptionalStringArray(v: unknown): v is string[] | undefined {
  return v === undefined || (Array.isArray(v) && v.every(s => typeof s === 'string'))
}

/** Reject any id/list-id that contains a path/query/fragment delimiter. These
 *  are safe in a path segment only after encodeURIComponent — but if a value
 *  reaches the lib helper unencoded an attacker could smuggle query params. */
function rejectsAsUrlSegment(v: string | undefined | null): boolean {
  return typeof v === 'string' && ID_REJECT_RE.test(v)
}

function validatePatchBody(body: unknown): { ok: true; value: PatchBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid body' }
  const b = body as Record<string, unknown>
  if (!isOptionalBoolean(b.done)) return { ok: false, error: 'done must be boolean' }
  if (!isOptionalString(b.title)) return { ok: false, error: 'title must be string' }
  if (!isOptionalString(b.description)) return { ok: false, error: 'description must be string' }
  if (!isOptionalNullableString(b.dueDate)) return { ok: false, error: 'dueDate must be string or null' }
  if (!isOptionalString(b.connectionId)) return { ok: false, error: 'connectionId must be string' }
  if (!isOptionalStringArray(b.mainPersons)) return { ok: false, error: 'mainPersons must be string[]' }
  if (!isOptionalStringArray(b.ccPersons)) return { ok: false, error: 'ccPersons must be string[]' }
  if (!isOptionalString(b.activityTypeCode)) return { ok: false, error: 'activityTypeCode must be string' }
  if (!isOptionalString(b.projectCode)) return { ok: false, error: 'projectCode must be string' }
  if (!isOptionalString(b.customerCode)) return { ok: false, error: 'customerCode must be string' }
  if (!isOptionalString(b.targetListId)) return { ok: false, error: 'targetListId must be string' }
  if (!isOptionalString(b.targetListTitle)) return { ok: false, error: 'targetListTitle must be string' }
  if (!isOptionalString(b.targetGoogleListId)) return { ok: false, error: 'targetGoogleListId must be string' }
  if (!isOptionalString(b.targetGoogleListTitle)) return { ok: false, error: 'targetGoogleListTitle must be string' }
  if (!isOptionalString(b.currentListId)) return { ok: false, error: 'currentListId must be string' }
  // URL-segment safety on every id-shaped field.
  if (rejectsAsUrlSegment(b.targetListId as string)) return { ok: false, error: 'targetListId contains forbidden character' }
  if (rejectsAsUrlSegment(b.targetGoogleListId as string)) return { ok: false, error: 'targetGoogleListId contains forbidden character' }
  if (rejectsAsUrlSegment(b.currentListId as string)) return { ok: false, error: 'currentListId contains forbidden character' }
  return { ok: true, value: b as PatchBody }
}

function validateDeleteBody(body: unknown): { ok: true; value: DeleteBody } | { ok: false; error: string } {
  if (body === null || body === undefined) return { ok: true, value: {} }
  if (typeof body !== 'object') return { ok: false, error: 'invalid body' }
  const b = body as Record<string, unknown>
  if (!isOptionalString(b.connectionId)) return { ok: false, error: 'connectionId must be string' }
  if (!isOptionalString(b.currentListId)) return { ok: false, error: 'currentListId must be string' }
  if (rejectsAsUrlSegment(b.currentListId as string)) return { ok: false, error: 'currentListId contains forbidden character' }
  return { ok: true, value: b as DeleteBody }
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
  // The path-segment id is interpolated into Graph/Google URLs downstream —
  // forbid the same dangerous characters as in the body.
  if (rejectsAsUrlSegment(id)) {
    return NextResponse.json({ error: 'id contains forbidden character' }, { status: 400 })
  }
  const raw = await req.json().catch(() => ({}))
  const valid = validatePatchBody(raw)
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })
  const body = valid.value

  try {
    if (source === 'herbe') {
      const conns = await getErpConnections(session.accountId)
      // If the caller specified a connectionId, refuse to silently fall back
      // to a different tenant's connection — that's a cross-tenant write bug.
      let conn
      if (body.connectionId !== undefined) {
        conn = conns.find(c => c.id === body.connectionId)
        if (!conn) return NextResponse.json({ error: 'connectionId not found' }, { status: 400 })
      } else {
        conn = conns[0]
      }
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
      // Allow MainPersons/CCPersons to be cleared — empty string is how ERP
      // drops the assignment or CC list. Without this the form silently
      // keeps the old values whenever the user removed them all.
      const result = await saveActVcRecord(merged, { id, conn, allowEmptyFields: new Set(['MainPersons', 'CCPersons']) })
      if (!result.ok) {
        const payload: Record<string, unknown> = { error: result.error }
        if (result.fieldErrors) payload.fieldErrors = result.fieldErrors
        return NextResponse.json(payload, { status: result.status })
      }
      // Write-through: keep the cache in sync with the mutation so the next
      // read doesn't have to re-fetch the whole task list.
      const task = mapHerbeTask(result.record, '', conn.id, conn.name)
      await writeThroughTask(session.accountId, session.email, 'herbe', task)
      return NextResponse.json({ ok: true, task })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const memberTz = await getMemberTimezone(session.accountId, session.email)
      let task: Task
      let warning: 'ORIGINAL_NOT_DELETED' | undefined
      if (body.targetListId) {
        const r = await moveOutlookTask(session.email, id, {
          targetListId: body.targetListId,
          targetListTitle: body.targetListTitle,
          patch: {
            done: body.done, title: body.title,
            description: body.description, dueDate: body.dueDate,
            timezone: memberTz,
          },
          currentListId: body.currentListId,
          timezone: memberTz,
        }, azure)
        task = r.task
        warning = r.warning
      } else {
        task = await updateOutlookTask(session.email, id, {
          done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
          timezone: memberTz,
        }, azure, body.currentListId)
      }
      // List moves delete+recreate, producing a new id. Drop the stale cache
      // row for the old id so the sidebar doesn't show a ghost task that
      // can't be saved against (its source-side counterpart is gone).
      const oldPrefixedId = `outlook:${id}`
      if (task.id !== oldPrefixedId) {
        await deleteCachedTask(session.accountId, session.email, 'outlook', oldPrefixedId)
      }
      await writeThroughTask(session.accountId, session.email, 'outlook', task)
      return NextResponse.json(warning ? { ok: true, task, warning } : { ok: true, task })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const r = await updateGoogleTask(tokenId, session.email, session.accountId, id, {
        done: body.done, title: body.title, description: body.description, dueDate: body.dueDate,
        targetListId: body.targetGoogleListId,
        targetListTitle: body.targetGoogleListTitle,
        currentListId: body.currentListId,
      })
      const task = r.task
      // Same ghost-row protection as Outlook moves above.
      const oldPrefixedId = `google:${id}`
      if (task.id !== oldPrefixedId) {
        await deleteCachedTask(session.accountId, session.email, 'google', oldPrefixedId)
      }
      await writeThroughTask(session.accountId, session.email, 'google', task)
      return NextResponse.json(r.warning ? { ok: true, task, warning: r.warning } : { ok: true, task })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks PATCH ${source}/${id}]`, e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { source, id } = await params
  if (!['herbe', 'outlook', 'google'].includes(source)) {
    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  }
  if (rejectsAsUrlSegment(id)) {
    return NextResponse.json({ error: 'id contains forbidden character' }, { status: 400 })
  }
  // DELETE bodies are optional in HTTP; treat empty as {}.
  const raw = await req.json().catch(() => ({}))
  const valid = validateDeleteBody(raw)
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })
  const body = valid.value

  try {
    if (source === 'herbe') {
      const conns = await getErpConnections(session.accountId)
      let conn
      if (body.connectionId !== undefined) {
        conn = conns.find(c => c.id === body.connectionId)
        if (!conn) return NextResponse.json({ error: 'connectionId not found' }, { status: 400 })
      } else {
        conn = conns[0]
      }
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const ok = await deleteHerbeTask(id, session.userCode, conn)
      if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
      await deleteCachedTask(session.accountId, session.email, 'herbe', `herbe:${id}`)
      return NextResponse.json({ ok: true })
    }

    if (source === 'outlook') {
      const azure = await getAzureConfig(session.accountId)
      if (!azure) return NextResponse.json({ error: 'Outlook not configured' }, { status: 400 })
      const ok = await deleteOutlookTask(session.email, id, azure, body.currentListId)
      if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
      await deleteCachedTask(session.accountId, session.email, 'outlook', `outlook:${id}`)
      return NextResponse.json({ ok: true })
    }

    if (source === 'google') {
      const accounts = await getUserGoogleAccounts(session.email, session.accountId)
      const tokenId = accounts[0]?.id ?? null
      if (!tokenId) return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
      const ok = await deleteGoogleTask(tokenId, session.email, session.accountId, id, body.currentListId)
      if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
      await deleteCachedTask(session.accountId, session.email, 'google', `google:${id}`)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown source' }, { status: 400 })
  } catch (e) {
    console.error(`[tasks DELETE ${source}/${id}]`, e)
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
