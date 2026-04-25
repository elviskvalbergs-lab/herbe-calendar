import { mapGoogleTask, fetchGoogleTasks, type GoogleTaskApi } from '@/lib/google/tasks'

jest.mock('@/lib/google/userOAuth', () => ({
  getValidAccessTokenForUser: jest.fn(),
}))

import { getValidAccessTokenForUser } from '@/lib/google/userOAuth'
const mockToken = getValidAccessTokenForUser as jest.Mock

const realFetch = global.fetch
afterEach(() => { global.fetch = realFetch })

describe('mapGoogleTask', () => {
  it('maps a Google task', () => {
    const api: GoogleTaskApi = {
      id: 'abc',
      title: 'Foo',
      notes: 'Bar',
      due: '2026-05-01T00:00:00.000Z',
      status: 'needsAction',
    }
    const t = mapGoogleTask(api, 'My Tasks')
    expect(t).toMatchObject({
      id: 'google:abc', source: 'google', sourceConnectionId: '',
      title: 'Foo', description: 'Bar', dueDate: '2026-05-01',
      done: false, listName: 'My Tasks',
    })
  })
  it('marks completed status as done', () => {
    expect(mapGoogleTask({ id: '1', title: 't', status: 'completed' }, 'X').done).toBe(true)
  })
})

describe('fetchGoogleTasks', () => {
  it('returns notConfigured when token lookup returns null', async () => {
    mockToken.mockResolvedValueOnce(null)
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(false)
  })

  it('returns notConfigured when tasks scope is missing (401)', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false, status: 401, text: async () => 'unauthorized',
    }) as any
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(false)
  })

  it('fetches tasks from the default list', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [
          { id: 't1', title: 'A', status: 'needsAction' },
          { id: 't2', title: 'B', status: 'completed' },
        ] }),
      }) as any
    const r = await fetchGoogleTasks('tok-1', 'u@x.com', 'acc-1')
    expect(r.configured).toBe(true)
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks[0].listName).toBe('My Tasks')
  })
})

import { createGoogleTask, updateGoogleTask } from '@/lib/google/tasks'

describe('createGoogleTask', () => {
  it('POSTs to the default list and maps the response', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new', title: 'Buy', status: 'needsAction' }) }) as any
    const t = await createGoogleTask('tok-1', 'u@x.com', 'acc-1', { title: 'Buy' })
    expect(t.id).toBe('google:new')
    const callArgs = (global.fetch as jest.Mock).mock.calls[1]
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toMatchObject({ title: 'Buy' })
  })
})

describe('updateGoogleTask', () => {
  it('PATCHes status to completed when done=true', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      // findGoogleTaskList: lists
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }) })
      // findGoogleTaskList: probe task in L1
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't' }) })
      // PATCH
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't', title: 'x', status: 'completed' }) }) as any
    const r = await updateGoogleTask('tok-1', 'u@x.com', 'acc-1', 't', { done: true })
    expect(r.task.done).toBe(true)
    expect(r.warning).toBeUndefined()
    const calls = (global.fetch as jest.Mock).mock.calls
    const patchCall = calls[calls.length - 1]
    const body = JSON.parse(patchCall[1].body)
    expect(body.status).toBe('completed')
  })

  // Regression: bug #7 — currentListId skips the find-the-list probe.
  it('skips the list-probe when currentListId is supplied', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    type FetchCall = { url: string; method: string }
    const calls: FetchCall[] = []
    global.fetch = jest.fn(async (url: unknown, init?: any) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' })
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 't', title: 'x', status: 'completed' }) } as unknown as Response
      }
      // lookupGoogleListTitle still calls /users/@me/lists once.
      if (String(url).endsWith('/users/@me/lists')) {
        return { ok: true, json: async () => ({ items: [{ id: 'L1', title: 'My Tasks' }] }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch
    const r = await updateGoogleTask('tok-1', 'u@x.com', 'acc-1', 't', { done: true, currentListId: 'L1' })
    expect(r.task.done).toBe(true)
    // No GET probe of /lists/L1/tasks/t when currentListId is supplied —
    // only the PATCH itself touches that path.
    const probes = calls.filter(c => c.url.endsWith('/lists/L1/tasks/t') && c.method === 'GET')
    expect(probes).toHaveLength(0)
  })

  // Regression: bug #3 — partial-success warning. If create-in-target
  // succeeds but delete-of-original fails, surface ORIGINAL_NOT_DELETED.
  it('returns warning=ORIGINAL_NOT_DELETED when cross-list move delete fails', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      // findGoogleTaskList: lists
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'A' }] }) })
      // findGoogleTaskList: probe in L1 (found).
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't' }) })
      // existing fetch from L1.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't', title: 'x', status: 'needsAction' }) })
      // create in L2.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'NEW', title: 'x', status: 'needsAction' }) })
      // DELETE in L1 fails.
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'oops' }) as any

    const r = await updateGoogleTask('tok-1', 'u@x.com', 'acc-1', 't', { targetListId: 'L2', targetListTitle: 'B' })
    expect(r.task.id).toBe('google:NEW')
    expect(r.warning).toBe('ORIGINAL_NOT_DELETED')
  })
})

describe('createGoogleTask with explicit listId', () => {
  it('POSTs to the provided listId without resolving the default', async () => {
    const originalFetch = global.fetch
    const calls: string[] = []
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('/lists/EXPLICIT/tasks')) {
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ id: 'new-task', title: 'T', status: 'needsAction' }) } as unknown as Response
      }
      if (u.endsWith('/users/@me/lists')) {
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ items: [{ id: 'DEFAULT', title: 'Default' }] }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch
    // Minimal stub for getValidAccessTokenForUser
    jest.spyOn(require('@/lib/google/userOAuth'), 'getValidAccessTokenForUser').mockResolvedValue('ya29.abc')

    try {
      const task = await createGoogleTask('TOK', 'x@y.z', 'acc', {
        title: 'T', listId: 'EXPLICIT', listTitle: 'My Tasks',
      })
      expect(task.id).toBe('google:new-task')
      expect(task.listName).toBe('My Tasks')
      expect(calls.some(c => c.includes('/lists/EXPLICIT/tasks'))).toBe(true)
      // Default-resolution path must not be hit when an explicit listId is provided.
      expect(calls.some(c => c.endsWith('/users/@me/lists'))).toBe(false)
    } finally {
      global.fetch = originalFetch
    }
  })
})

// Regression: bug #2 — every list-id and task-id interpolated into a Google
// Tasks URL must be wrapped with encodeURIComponent. Without it a taskId of
// `abc?$expand=*` would smuggle a query parameter.
describe('URL-injection guard', () => {
  it('encodeURIComponents listId in createGoogleTask', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    const calls: string[] = []
    global.fetch = jest.fn(async (url: unknown, init?: any) => {
      calls.push(String(url))
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new', title: 't', status: 'needsAction' }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch
    await createGoogleTask('tok-1', 'u@x.com', 'acc-1', { title: 't', listId: 'l?$select=id' })
    const postCall = calls.find(c => c.includes('/lists/'))
    expect(postCall).toContain('l%3F%24select%3Did')
    expect(postCall).not.toContain('?$select=')
  })

  it('encodeURIComponents taskId in updateGoogleTask PATCH path', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    const calls: string[] = []
    global.fetch = jest.fn(async (url: unknown, init?: any) => {
      calls.push(String(url))
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 'x', title: 't', status: 'completed' }) } as unknown as Response
      }
      if (String(url).endsWith('/users/@me/lists')) {
        return { ok: true, json: async () => ({ items: [{ id: 'L1', title: 'A' }] }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch

    await updateGoogleTask('tok-1', 'u@x.com', 'acc-1', 'abc?$expand=*', { done: true, currentListId: 'L1' })

    expect(calls.some(c => c.includes('abc%3F%24expand%3D'))).toBe(true)
    expect(calls.some(c => c.includes('/tasks/abc?$expand='))).toBe(false)
  })
})

import { deleteGoogleTask } from '@/lib/google/tasks'

describe('deleteGoogleTask', () => {
  it('returns true on a successful DELETE', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'A' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 't' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 }) as any
    const ok = await deleteGoogleTask('tok-1', 'u@x.com', 'acc-1', 't')
    expect(ok).toBe(true)
  })

  it('returns false when the task cannot be located', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'L1', title: 'A' }] }) })
      // Probe yields 404 — task not in this list, no other lists to try.
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' }) as any
    const ok = await deleteGoogleTask('tok-1', 'u@x.com', 'acc-1', 'GONE')
    expect(ok).toBe(false)
  })

  it('skips the probe when currentListId is supplied', async () => {
    mockToken.mockResolvedValueOnce('abc-token')
    const calls: string[] = []
    global.fetch = jest.fn(async (url: unknown, init?: any) => {
      calls.push(String(url))
      if (init?.method === 'DELETE') return { ok: true, status: 204 } as unknown as Response
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    }) as typeof fetch
    const ok = await deleteGoogleTask('tok-1', 'u@x.com', 'acc-1', 't', 'L1')
    expect(ok).toBe(true)
    expect(calls.some(c => c.endsWith('/users/@me/lists'))).toBe(false)
  })
})
