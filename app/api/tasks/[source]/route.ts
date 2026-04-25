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
  mainPersons?: string[]
  /** Outlook task list id (unified destination picker). */
  listId?: string
  /** Outlook task list display name — optional pass-through so the created Task carries the right listName. */
  listTitle?: string
  /** Google per-user OAuth token row id (unified destination picker). */
  googleTokenId?: string
  /** Google Tasks list id (unified destination picker). */
  googleListId?: string
  /** Google Tasks list title — optional pass-through so the created Task carries the right listName without an extra API call. */
  googleListTitle?: string
}

const ID_REJECT_RE = /[/?#]/
function rejectsAsUrlSegment(v: string | undefined | null): boolean {
  return typeof v === 'string' && ID_REJECT_RE.test(v)
}
function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === 'string'
}
function isOptionalStringArray(v: unknown): v is string[] | undefined {
  return v === undefined || (Array.isArray(v) && v.every(s => typeof s === 'string'))
}

function validateCreateBody(body: unknown): { ok: true; value: CreateBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid body' }
  const b = body as Record<string, unknown>
  if (typeof b.title !== 'string' || b.title.length === 0) return { ok: false, error: 'title required' }
  if (!isOptionalString(b.description)) return { ok: false, error: 'description must be string' }
  if (!isOptionalString(b.dueDate)) return { ok: false, error: 'dueDate must be string' }
  if (!isOptionalString(b.connectionId)) return { ok: false, error: 'connectionId must be string' }
  if (!isOptionalString(b.activityTypeCode)) return { ok: false, error: 'activityTypeCode must be string' }
  if (!isOptionalString(b.projectCode)) return { ok: false, error: 'projectCode must be string' }
  if (!isOptionalString(b.customerCode)) return { ok: false, error: 'customerCode must be string' }
  if (!isOptionalStringArray(b.ccPersons)) return { ok: false, error: 'ccPersons must be string[]' }
  if (!isOptionalStringArray(b.mainPersons)) return { ok: false, error: 'mainPersons must be string[]' }
  if (!isOptionalString(b.listId)) return { ok: false, error: 'listId must be string' }
  if (!isOptionalString(b.listTitle)) return { ok: false, error: 'listTitle must be string' }
  if (!isOptionalString(b.googleTokenId)) return { ok: false, error: 'googleTokenId must be string' }
  if (!isOptionalString(b.googleListId)) return { ok: false, error: 'googleListId must be string' }
  if (!isOptionalString(b.googleListTitle)) return { ok: false, error: 'googleListTitle must be string' }
  // URL-segment safety on every id-shaped field.
  if (rejectsAsUrlSegment(b.listId as string)) return { ok: false, error: 'listId contains forbidden character' }
  if (rejectsAsUrlSegment(b.googleListId as string)) return { ok: false, error: 'googleListId contains forbidden character' }
  return { ok: true, value: b as unknown as CreateBody }
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
  const raw = await req.json().catch(() => ({}))
  const valid = validateCreateBody(raw)
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })
  const body = valid.value

  try {
    if (source === 'herbe') {
      const personCode = await getCodeByEmail(session.email, session.accountId)
      if (!personCode) return NextResponse.json({ error: 'no person code for user' }, { status: 400 })
      const conns = await getErpConnections(session.accountId)
      // If the caller supplied a connectionId, respect it strictly. Falling
      // back to conns[0] silently writes to a different ERP tenant when the
      // id is unknown — that's a cross-tenant write bug, not a UX nicety.
      let conn
      if (body.connectionId !== undefined) {
        conn = conns.find(c => c.id === body.connectionId)
        if (!conn) return NextResponse.json({ error: 'connectionId not found' }, { status: 400 })
      } else {
        conn = conns[0]
      }
      if (!conn) return NextResponse.json({ error: 'no ERP connection' }, { status: 400 })
      const result = await saveActVcRecord(buildCreateTaskBody({
        title: body.title,
        description: body.description,
        personCode,
        mainPersons: body.mainPersons,
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
        listTitle: body.listTitle,
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
