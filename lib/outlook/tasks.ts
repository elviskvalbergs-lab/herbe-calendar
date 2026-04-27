import { graphFetch } from '@/lib/graph/client'
import type { AzureConfig } from '@/lib/accountConfig'
import type { Task } from '@/types/task'

export interface OutlookTaskApi {
  id: string
  title: string
  body?: { contentType: string; content: string }
  dueDateTime?: { dateTime: string; timeZone: string }
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'
}

interface OutlookListApi {
  id: string
  displayName: string
  isDefaultFolder?: boolean
  wellknownListName?: string
}

export interface FetchOutlookTasksResult {
  tasks: Task[]
  configured: boolean
  stale?: boolean
  error?: string
}

/** Map one Microsoft Graph todo task to the unified Task shape. */
export function mapOutlookTask(api: OutlookTaskApi, listName: string): Task {
  const dueDate = api.dueDateTime?.dateTime
    ? api.dueDateTime.dateTime.slice(0, 10)
    : undefined
  return {
    id: `outlook:${api.id}`,
    source: 'outlook',
    sourceConnectionId: '',
    title: api.title,
    description: api.body?.content || undefined,
    dueDate,
    done: api.status === 'completed',
    listName,
  }
}

/**
 * Fetch a user's tasks across all their Microsoft To Do lists.
 * Returns `configured: false` when Graph returns 401/403 (missing Tasks.ReadWrite.All).
 */
export async function fetchOutlookTasks(
  userEmail: string,
  azureConfig: AzureConfig,
): Promise<FetchOutlookTasksResult> {
  const enc = encodeURIComponent(userEmail)
  const listsRes = await graphFetch(`/users/${enc}/todo/lists`, undefined, azureConfig)
  if (!listsRes.ok) {
    if (listsRes.status === 401 || listsRes.status === 403) {
      return { tasks: [], configured: false }
    }
    const text = await listsRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `lists ${listsRes.status}: ${text.slice(0, 120)}` }
  }
  const listsBody = await listsRes.json() as { value: OutlookListApi[] }
  const lists = listsBody.value
  if (lists.length === 0) return { tasks: [], configured: true }

  const perList = await Promise.all(lists.map(async list => {
    try {
      const tasksRes = await graphFetch(
        `/users/${enc}/todo/lists/${encodeURIComponent(list.id)}/tasks`,
        undefined,
        azureConfig,
      )
      if (!tasksRes.ok) return { tasks: [] as Task[], err: `${list.displayName} ${tasksRes.status}` }
      const body = await tasksRes.json() as { value: OutlookTaskApi[] }
      return { tasks: body.value.map(t => mapOutlookTask(t, list.displayName)), err: null }
    } catch (e) {
      return { tasks: [] as Task[], err: `${list.displayName} ${String(e)}` }
    }
  }))
  const tasks = perList.flatMap(r => r.tasks)
  const errs = perList.map(r => r.err).filter(Boolean) as string[]
  if (tasks.length === 0 && errs.length > 0) {
    return { tasks: [], configured: true, error: errs[0] }
  }
  return { tasks, configured: true }
}

async function resolveDefaultListId(userEmail: string, azureConfig: AzureConfig): Promise<string> {
  const enc = encodeURIComponent(userEmail)
  const res = await graphFetch(`/users/${enc}/todo/lists`, undefined, azureConfig)
  if (!res.ok) throw new Error(`lists fetch failed: ${res.status}`)
  const body = await res.json() as { value: OutlookListApi[] }
  const def = body.value.find(l => l.wellknownListName === 'defaultList')
    ?? body.value.find(l => l.isDefaultFolder === true)
    ?? body.value[0]
  if (!def) throw new Error('no default To Do list')
  return def.id
}

/** Find which list a task lives in. We fetch across all lists so updates
 * need to find the right list to PATCH under. */
async function findOutlookTaskList(
  userEmail: string,
  taskId: string,
  azureConfig: AzureConfig,
): Promise<string | null> {
  const enc = encodeURIComponent(userEmail)
  const listsRes = await graphFetch(`/users/${enc}/todo/lists`, undefined, azureConfig)
  if (!listsRes.ok) return null
  const body = await listsRes.json() as { value: OutlookListApi[] }
  for (const list of body.value) {
    const r = await graphFetch(
      `/users/${enc}/todo/lists/${encodeURIComponent(list.id)}/tasks/${encodeURIComponent(taskId)}`,
      undefined,
      azureConfig,
    )
    if (r.ok) return list.id
  }
  return null
}

export interface CreateOutlookTaskInput {
  title: string
  description?: string
  dueDate?: string
  /** Microsoft Graph To Do list id. If omitted, writes to the user's default list. */
  listId?: string
  /** Human list name for the returned Task's listName. Pass through when you already have it. */
  listTitle?: string
  /** IANA timezone for dueDateTime; defaults to UTC for backward compatibility. */
  timezone?: string
}

export async function createOutlookTask(
  userEmail: string,
  input: CreateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = input.listId ?? await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {
    title: input.title,
    status: 'notStarted',
  }
  if (input.description) {
    payload.body = { contentType: 'text', content: input.description }
  }
  if (input.dueDate) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: input.timezone ?? 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${encodeURIComponent(listId)}/tasks`,
    { method: 'POST', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`create failed: ${res.status}`)
  const created = await res.json() as OutlookTaskApi
  return mapOutlookTask(created, input.listTitle ?? 'Tasks')
}

export interface UpdateOutlookTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null  // null clears
  /** IANA timezone for dueDateTime; defaults to UTC for backward compatibility. */
  timezone?: string
}

export async function updateOutlookTask(
  userEmail: string,
  taskId: string,
  input: UpdateOutlookTaskInput,
  azureConfig: AzureConfig,
  /** Optional: id of the list the task currently lives in. When provided we
   *  skip the N+1 list-probe. Falsy values fall back to probe → default. */
  currentListId?: string,
): Promise<Task> {
  // Task may live in any of the user's lists — find the one containing it.
  // If the caller already knows which list it's in, trust them and skip the
  // O(lists) probe. Probe + default-fallback remain for backwards-compat.
  const listId = currentListId
    ?? await findOutlookTaskList(userEmail, taskId, azureConfig)
    ?? await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {}
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'notStarted'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.body = { contentType: 'text', content: input.description }
  if (input.dueDate === null) payload.dueDateTime = null
  else if (input.dueDate !== undefined) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: input.timezone ?? 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`update failed: ${res.status}`)
  const updated = await res.json() as OutlookTaskApi
  return mapOutlookTask(updated, 'Tasks')
}

export interface MoveOutlookTaskInput {
  /** Destination list id. */
  targetListId: string
  /** Destination list display name (for the returned Task's listName). */
  targetListTitle?: string
  /** Optional field patches to apply during the move. */
  patch?: UpdateOutlookTaskInput
  /** Optional: id of the list the task currently lives in. Skips the N+1 probe. */
  currentListId?: string
  /** Member timezone forwarded to the recreated task in the target list. */
  timezone?: string
}

export interface MoveOutlookTaskResult {
  task: Task
  /** Set when the create succeeded but the original could not be deleted —
   *  the user will see the task in both lists until the next sync. */
  warning?: 'ORIGINAL_NOT_DELETED'
}

/**
 * Move a task to another Microsoft To Do list. Microsoft Graph has no move
 * endpoint; the only supported approach is to fetch the existing task, delete
 * it from its current list, and re-create it in the target list. The returned
 * Task has a new id (the old one is gone); callers must refresh any cached
 * references.
 *
 * If the task is already in the target list, no delete happens — we just
 * apply the patch as a normal update.
 *
 * Partial failures (create OK, delete failed) surface as
 * `warning: 'ORIGINAL_NOT_DELETED'` so the API route can tell the client.
 */
export async function moveOutlookTask(
  userEmail: string,
  taskId: string,
  input: MoveOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<MoveOutlookTaskResult> {
  const enc = encodeURIComponent(userEmail)
  const currentListId = input.currentListId
    ?? await findOutlookTaskList(userEmail, taskId, azureConfig)
  if (!currentListId) throw new Error(`task ${taskId} not found in any list`)

  if (currentListId === input.targetListId) {
    // No-op move — just a regular update, preserving existing behavior.
    const task = await updateOutlookTask(userEmail, taskId, input.patch ?? {}, azureConfig, currentListId)
    return { task }
  }

  // Fetch the existing task so we can carry fields forward into the new list.
  const existingRes = await graphFetch(
    `/users/${enc}/todo/lists/${encodeURIComponent(currentListId)}/tasks/${encodeURIComponent(taskId)}`,
    undefined,
    azureConfig,
  )
  if (!existingRes.ok) throw new Error(`fetch existing failed: ${existingRes.status}`)
  const existing = await existingRes.json() as OutlookTaskApi

  // Merge current fields with any patch overrides.
  const patch = input.patch ?? {}
  const title = patch.title ?? existing.title
  const description = patch.description ?? existing.body?.content
  const dueDate = patch.dueDate === null
    ? undefined
    : patch.dueDate ?? existing.dueDateTime?.dateTime?.slice(0, 10)
  const done = patch.done ?? (existing.status === 'completed')

  // Create in the target list.
  const created = await createOutlookTask(userEmail, {
    title,
    description,
    dueDate,
    listId: input.targetListId,
    listTitle: input.targetListTitle,
    timezone: input.timezone,
  }, azureConfig)

  // If the task was done, reflect that in the new list — createOutlookTask
  // always writes status=notStarted otherwise.
  if (done) {
    const newRawId = created.id.startsWith('outlook:') ? created.id.slice('outlook:'.length) : created.id
    await updateOutlookTask(userEmail, newRawId, { done: true }, azureConfig, input.targetListId)
  }

  // Delete the original.
  const delRes = await graphFetch(
    `/users/${enc}/todo/lists/${encodeURIComponent(currentListId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
    azureConfig,
  )
  let warning: MoveOutlookTaskResult['warning']
  if (!delRes.ok && delRes.status !== 204) {
    console.warn(`[moveOutlookTask] delete old ${taskId} failed: ${delRes.status}`)
    warning = 'ORIGINAL_NOT_DELETED'
  }

  const task: Task = {
    ...created,
    done,
    listName: input.targetListTitle ?? created.listName,
  }
  return warning ? { task, warning } : { task }
}

/**
 * Delete an Outlook to-do task. Returns true on success, false when the task
 * could not be located in any of the user's lists (treat as 404 at the API
 * layer). Throws on other Graph errors.
 *
 * If the caller already knows which list the task lives in, pass
 * `currentListId` to skip the N+1 list-probe.
 */
export async function deleteOutlookTask(
  userEmail: string,
  taskId: string,
  azureConfig: AzureConfig,
  currentListId?: string,
): Promise<boolean> {
  const listId = currentListId ?? await findOutlookTaskList(userEmail, taskId, azureConfig)
  if (!listId) return false
  const enc = encodeURIComponent(userEmail)
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
    azureConfig,
  )
  if (res.ok || res.status === 204) return true
  if (res.status === 404) return false
  throw new Error(`delete failed: ${res.status}`)
}
