import { getValidAccessTokenForUser } from './userOAuth'
import type { Task } from '@/types/task'

export interface GoogleTaskApi {
  id: string
  title: string
  notes?: string
  due?: string
  status: 'needsAction' | 'completed'
}

interface GoogleListApi {
  id: string
  title: string
}

export interface FetchGoogleTasksResult {
  tasks: Task[]
  configured: boolean
  error?: string
}

export function mapGoogleTask(api: GoogleTaskApi, listName: string): Task {
  return {
    id: `google:${api.id}`,
    source: 'google',
    sourceConnectionId: '',
    title: api.title,
    description: api.notes || undefined,
    dueDate: api.due ? api.due.slice(0, 10) : undefined,
    done: api.status === 'completed',
    listName,
  }
}

async function tasksFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://tasks.googleapis.com/tasks/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

export async function fetchGoogleTasks(
  tokenId: string,
  userEmail: string,
  accountId: string,
): Promise<FetchGoogleTasksResult> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) return { tasks: [], configured: false }

  const listsRes = await tasksFetch(accessToken, '/users/@me/lists')
  if (!listsRes.ok) {
    if (listsRes.status === 401 || listsRes.status === 403) return { tasks: [], configured: false }
    const text = await listsRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `lists ${listsRes.status}: ${text.slice(0, 120)}` }
  }
  const listsBody = await listsRes.json() as { items?: GoogleListApi[] }
  const lists = listsBody.items ?? []
  if (lists.length === 0) return { tasks: [], configured: true }

  const perList = await Promise.all(lists.map(async list => {
    try {
      const r = await tasksFetch(
        accessToken,
        `/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false`,
      )
      if (!r.ok) return { tasks: [] as Task[], err: `${list.title} ${r.status}` }
      const body = await r.json() as { items?: GoogleTaskApi[] }
      return { tasks: (body.items ?? []).map(t => mapGoogleTask(t, list.title)), err: null }
    } catch (e) {
      return { tasks: [] as Task[], err: `${list.title} ${String(e)}` }
    }
  }))
  const tasks = perList.flatMap(r => r.tasks)
  const errs = perList.map(r => r.err).filter(Boolean) as string[]
  if (tasks.length === 0 && errs.length > 0) {
    return { tasks: [], configured: true, error: errs[0] }
  }
  return { tasks, configured: true }
}

async function resolveDefaultGoogleListId(accessToken: string): Promise<{ id: string; title: string }> {
  const res = await tasksFetch(accessToken, '/users/@me/lists')
  if (!res.ok) throw new Error(`lists ${res.status}`)
  const body = await res.json() as { items?: GoogleListApi[] }
  const list = body.items?.[0]
  if (!list) throw new Error('no Google task list found')
  return { id: list.id, title: list.title }
}

/** Find which list holds the given task id by probing each list. */
async function findGoogleTaskList(accessToken: string, taskId: string): Promise<{ id: string; title: string } | null> {
  const res = await tasksFetch(accessToken, '/users/@me/lists')
  if (!res.ok) return null
  const body = await res.json() as { items?: GoogleListApi[] }
  for (const list of body.items ?? []) {
    const r = await tasksFetch(
      accessToken,
      `/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
    )
    if (r.ok) return { id: list.id, title: list.title }
  }
  return null
}

/** Look up just the title for a known Google list id, used when the caller
 *  passes `currentListId` and we still want the original list title for the
 *  returned Task's `listName`. Best-effort: returns empty string on failure. */
async function lookupGoogleListTitle(accessToken: string, listId: string): Promise<string> {
  const res = await tasksFetch(accessToken, '/users/@me/lists')
  if (!res.ok) return ''
  const body = await res.json() as { items?: GoogleListApi[] }
  return body.items?.find(l => l.id === listId)?.title ?? ''
}

export interface CreateGoogleTaskInput {
  title: string
  description?: string
  dueDate?: string
  /** Google Tasks list id. If omitted, writes to the first list returned. */
  listId?: string
  /** Human list title for the returned Task's listName. Pass through when you already have it (avoids an extra API call). */
  listTitle?: string
}

export async function createGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  input: CreateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  let listId: string
  let listTitle: string
  if (input.listId) {
    listId = input.listId
    listTitle = input.listTitle ?? ''
  } else {
    const list = await resolveDefaultGoogleListId(accessToken)
    listId = list.id
    listTitle = list.title
  }
  const payload: Record<string, unknown> = { title: input.title }
  if (input.description) payload.notes = input.description
  if (input.dueDate) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${encodeURIComponent(listId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
  const created = await res.json() as GoogleTaskApi
  return mapGoogleTask(created, listTitle)
}

export interface UpdateGoogleTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
  /** When set and different from the current list, moves the task to the
   *  given list. Google Tasks has no cross-list move endpoint — implemented
   *  as insert-into-target + delete-original (mirrors moveOutlookTask). */
  targetListId?: string
  /** Display title for the target list (carried into the returned Task). */
  targetListTitle?: string
  /** Optional: id of the list the task currently lives in. Skips the N+1 probe. */
  currentListId?: string
}

export interface UpdateGoogleTaskResult {
  task: Task
  /** Set when the create-in-target succeeded but delete-original failed —
   *  the user will see the task in both lists until the next sync. */
  warning?: 'ORIGINAL_NOT_DELETED'
}

export async function updateGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  taskId: string,
  input: UpdateGoogleTaskInput,
): Promise<UpdateGoogleTaskResult> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  // Resolve the source list. Trust caller-provided currentListId; otherwise
  // probe; otherwise fall back to the default list.
  let list: { id: string; title: string }
  if (input.currentListId) {
    list = { id: input.currentListId, title: await lookupGoogleListTitle(accessToken, input.currentListId) }
  } else {
    list = await findGoogleTaskList(accessToken, taskId)
      ?? await resolveDefaultGoogleListId(accessToken)
  }

  // Cross-list move: insert in the target list with merged fields, then
  // delete the original. Surface a warning on partial failure so the API
  // route can tell the client the task may temporarily appear in both lists.
  if (input.targetListId && input.targetListId !== list.id) {
    const existingRes = await tasksFetch(
      accessToken,
      `/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
    )
    if (!existingRes.ok) throw new Error(`fetch existing ${existingRes.status}`)
    const existing = await existingRes.json() as GoogleTaskApi

    const merged: Record<string, unknown> = {
      title: input.title ?? existing.title,
    }
    const mergedNotes = input.description ?? existing.notes
    if (mergedNotes) merged.notes = mergedNotes
    const mergedDue = input.dueDate === null
      ? null
      : input.dueDate !== undefined
        ? `${input.dueDate}T00:00:00.000Z`
        : existing.due
    if (mergedDue) merged.due = mergedDue
    const done = input.done ?? (existing.status === 'completed')
    if (done) merged.status = 'completed'

    const createRes = await tasksFetch(accessToken, `/lists/${encodeURIComponent(input.targetListId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(merged),
    })
    if (!createRes.ok) throw new Error(`create-in-target ${createRes.status}`)
    const created = await createRes.json() as GoogleTaskApi

    const delRes = await tasksFetch(
      accessToken,
      `/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    )
    let warning: UpdateGoogleTaskResult['warning']
    if (!delRes.ok && delRes.status !== 204) {
      console.warn(`[updateGoogleTask] delete old ${taskId} from ${list.id} failed: ${delRes.status}`)
      warning = 'ORIGINAL_NOT_DELETED'
    }

    const task = mapGoogleTask(created, input.targetListTitle ?? '')
    return warning ? { task, warning } : { task }
  }

  const payload: Record<string, unknown> = { id: taskId }
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'needsAction'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.notes = input.description
  if (input.dueDate === null) payload.due = null
  else if (input.dueDate !== undefined) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(
    accessToken,
    `/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) throw new Error(`update ${res.status}`)
  const updated = await res.json() as GoogleTaskApi
  return { task: mapGoogleTask(updated, list.title) }
}

/**
 * Delete a Google task. Returns true on success, false when the task could
 * not be located in any of the user's lists (treat as 404 at the API layer).
 * Throws on other Tasks API errors.
 */
export async function deleteGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  taskId: string,
  currentListId?: string,
): Promise<boolean> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  let listId: string | null = currentListId ?? null
  if (!listId) {
    const found = await findGoogleTaskList(accessToken, taskId)
    listId = found?.id ?? null
  }
  if (!listId) return false
  const res = await tasksFetch(
    accessToken,
    `/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
  )
  if (res.ok || res.status === 204) return true
  if (res.status === 404) return false
  throw new Error(`delete ${res.status}`)
}
