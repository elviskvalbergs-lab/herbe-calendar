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
        `/users/${enc}/todo/lists/${list.id}/tasks`,
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

export interface CreateOutlookTaskInput {
  title: string
  description?: string
  dueDate?: string
}

export async function createOutlookTask(
  userEmail: string,
  input: CreateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {
    title: input.title,
    status: 'notStarted',
  }
  if (input.description) {
    payload.body = { contentType: 'text', content: input.description }
  }
  if (input.dueDate) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${listId}/tasks`,
    { method: 'POST', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`create failed: ${res.status}`)
  const created = await res.json() as OutlookTaskApi
  return mapOutlookTask(created, 'Tasks')
}

export interface UpdateOutlookTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null  // null clears
}

export async function updateOutlookTask(
  userEmail: string,
  taskId: string,
  input: UpdateOutlookTaskInput,
  azureConfig: AzureConfig,
): Promise<Task> {
  const listId = await resolveDefaultListId(userEmail, azureConfig)
  const enc = encodeURIComponent(userEmail)
  const payload: Record<string, unknown> = {}
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'notStarted'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.body = { contentType: 'text', content: input.description }
  if (input.dueDate === null) payload.dueDateTime = null
  else if (input.dueDate !== undefined) {
    payload.dueDateTime = { dateTime: `${input.dueDate}T00:00:00`, timeZone: 'UTC' }
  }
  const res = await graphFetch(
    `/users/${enc}/todo/lists/${listId}/tasks/${taskId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    azureConfig,
  )
  if (!res.ok) throw new Error(`update failed: ${res.status}`)
  const updated = await res.json() as OutlookTaskApi
  return mapOutlookTask(updated, 'Tasks')
}
