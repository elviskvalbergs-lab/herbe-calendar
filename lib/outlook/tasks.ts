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
 * Fetch a user's tasks from their default Microsoft To Do list.
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
  const defaultList =
    listsBody.value.find(l => l.wellknownListName === 'defaultList')
      ?? listsBody.value.find(l => l.isDefaultFolder === true)
      ?? listsBody.value[0]
  if (!defaultList) return { tasks: [], configured: true }

  const tasksRes = await graphFetch(
    `/users/${enc}/todo/lists/${defaultList.id}/tasks`,
    undefined,
    azureConfig,
  )
  if (!tasksRes.ok) {
    const text = await tasksRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `tasks ${tasksRes.status}: ${text.slice(0, 120)}` }
  }
  const body = await tasksRes.json() as { value: OutlookTaskApi[] }
  const tasks = body.value.map(t => mapOutlookTask(t, defaultList.displayName))
  return { tasks, configured: true }
}
