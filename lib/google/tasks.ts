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
      const r = await tasksFetch(accessToken, `/lists/${list.id}/tasks?showCompleted=true&showHidden=false`)
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

export interface CreateGoogleTaskInput {
  title: string
  description?: string
  dueDate?: string
}

export async function createGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  input: CreateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  const list = await resolveDefaultGoogleListId(accessToken)
  const payload: Record<string, unknown> = { title: input.title }
  if (input.description) payload.notes = input.description
  if (input.dueDate) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${list.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
  const created = await res.json() as GoogleTaskApi
  return mapGoogleTask(created, list.title)
}

export interface UpdateGoogleTaskInput {
  done?: boolean
  title?: string
  description?: string
  dueDate?: string | null
}

export async function updateGoogleTask(
  tokenId: string,
  userEmail: string,
  accountId: string,
  taskId: string,
  input: UpdateGoogleTaskInput,
): Promise<Task> {
  const accessToken = await getValidAccessTokenForUser(tokenId, userEmail, accountId)
  if (!accessToken) throw new Error('Google access token unavailable')
  const list = await resolveDefaultGoogleListId(accessToken)
  const payload: Record<string, unknown> = { id: taskId }
  if (input.done !== undefined) payload.status = input.done ? 'completed' : 'needsAction'
  if (input.title !== undefined) payload.title = input.title
  if (input.description !== undefined) payload.notes = input.description
  if (input.dueDate === null) payload.due = null
  else if (input.dueDate !== undefined) payload.due = `${input.dueDate}T00:00:00.000Z`
  const res = await tasksFetch(accessToken, `/lists/${list.id}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`update ${res.status}`)
  const updated = await res.json() as GoogleTaskApi
  return mapGoogleTask(updated, list.title)
}
