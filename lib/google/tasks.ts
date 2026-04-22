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
  const list = listsBody.items?.[0]
  if (!list) return { tasks: [], configured: true }

  const tasksRes = await tasksFetch(accessToken, `/lists/${list.id}/tasks?showCompleted=true&showHidden=false`)
  if (!tasksRes.ok) {
    const text = await tasksRes.text().catch(() => '')
    return { tasks: [], configured: true, error: `tasks ${tasksRes.status}: ${text.slice(0, 120)}` }
  }
  const body = await tasksRes.json() as { items?: GoogleTaskApi[] }
  return { tasks: (body.items ?? []).map(t => mapGoogleTask(t, list.title)), configured: true }
}
