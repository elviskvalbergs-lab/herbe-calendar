import { mapOutlookTask, fetchOutlookTasks, createOutlookTask, updateOutlookTask, moveOutlookTask, deleteOutlookTask, type OutlookTaskApi } from '@/lib/outlook/tasks'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
import { graphFetch } from '@/lib/graph/client'
const mockGraph = graphFetch as jest.Mock

beforeEach(() => mockGraph.mockReset())

describe('mapOutlookTask', () => {
  it('maps an Outlook task to the unified shape', () => {
    const api: OutlookTaskApi = {
      id: 'AAMkAG==',
      title: 'Sign addendum',
      body: { contentType: 'text', content: 'Notes' },
      dueDateTime: { dateTime: '2026-04-22T00:00:00', timeZone: 'UTC' },
      status: 'notStarted',
    }
    const task = mapOutlookTask(api, 'Tasks')
    expect(task).toMatchObject({
      id: 'outlook:AAMkAG==',
      source: 'outlook',
      sourceConnectionId: '',
      title: 'Sign addendum',
      description: 'Notes',
      dueDate: '2026-04-22',
      done: false,
      listName: 'Tasks',
    })
  })
  it('marks completed status as done=true', () => {
    const api: OutlookTaskApi = { id: '1', title: 't', status: 'completed' }
    expect(mapOutlookTask(api, 'Tasks').done).toBe(true)
  })
  it('omits dueDate when absent', () => {
    const api: OutlookTaskApi = { id: '1', title: 't', status: 'notStarted' }
    expect(mapOutlookTask(api, 'Tasks').dueDate).toBeUndefined()
  })
})

describe('fetchOutlookTasks', () => {
  it('returns notConfigured when lists endpoint returns 403', async () => {
    mockGraph.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Forbidden' })
    const r = await fetchOutlookTasks('u@x.com', {} as any)
    expect(r.configured).toBe(false)
    expect(r.tasks).toEqual([])
  })

  it('returns tasks from every list', async () => {
    mockGraph
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [
          { id: 'list-a', displayName: 'Other', isDefaultFolder: false, wellknownListName: 'none' },
          { id: 'list-b', displayName: 'Tasks', isDefaultFolder: true, wellknownListName: 'defaultList' },
        ] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [
          { id: 'a1', title: 'FromOther', status: 'notStarted' },
        ] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [
          { id: 'b1', title: 'One', status: 'notStarted' },
          { id: 'b2', title: 'Two', status: 'completed' },
        ] }),
      })
    const r = await fetchOutlookTasks('u@x.com', {} as any)
    expect(r.configured).toBe(true)
    expect(r.tasks).toHaveLength(3)
    const listNames = r.tasks.map(t => t.listName).sort()
    expect(listNames).toEqual(['Other', 'Tasks', 'Tasks'])
    expect(mockGraph).toHaveBeenCalledTimes(3)
  })
})

describe('createOutlookTask', () => {
  it('POSTs to default list with title + status notStarted', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // POST
        ok: true,
        json: async () => ({ id: 'NEW', title: 'Buy milk', status: 'notStarted' }),
      })
    const t = await createOutlookTask('u@x.com', { title: 'Buy milk' }, {} as any)
    expect(t.id).toBe('outlook:NEW')
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toMatchObject({ title: 'Buy milk', status: 'notStarted' })
  })
})

describe('updateOutlookTask', () => {
  it('PATCHes status to completed when done=true', async () => {
    mockGraph
      .mockResolvedValueOnce({ // findOutlookTaskList: lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // findOutlookTaskList: probe task in L
        ok: true, json: async () => ({ id: 'T' }),
      })
      .mockResolvedValueOnce({ // PATCH
        ok: true,
        json: async () => ({ id: 'T', title: 'Buy milk', status: 'completed' }),
      })
    const t = await updateOutlookTask('u@x.com', 'T', { done: true }, {} as any)
    expect(t.done).toBe(true)
    const patchCall = mockGraph.mock.calls[mockGraph.mock.calls.length - 1] as [string, any]
    expect(patchCall[1].method).toBe('PATCH')
    expect(JSON.parse(patchCall[1].body)).toMatchObject({ status: 'completed' })
  })

  it('PATCHes title + dueDateTime when edit fields provided', async () => {
    mockGraph
      .mockResolvedValueOnce({ // findOutlookTaskList: lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T', title: 'New', status: 'notStarted' }) })
    await updateOutlookTask('u@x.com', 'T', { title: 'New', dueDate: '2026-05-01' }, {} as any)
    const patchCall = mockGraph.mock.calls[mockGraph.mock.calls.length - 1] as [string, any]
    const payload = JSON.parse(patchCall[1].body)
    expect(payload.title).toBe('New')
    expect(payload.dueDateTime?.dateTime).toBe('2026-05-01T00:00:00')
  })
})

describe('createOutlookTask — timezone propagation', () => {
  it('writes dueDateTime.timeZone from input.timezone', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists (default-list resolution)
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // POST
        ok: true,
        json: async () => ({ id: 'NEW', title: 't', status: 'notStarted' }),
      })
    await createOutlookTask('u@x.com', { title: 't', dueDate: '2026-05-01', timezone: 'Asia/Tokyo' }, {} as any)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    const body = JSON.parse(opts.body)
    expect(body.dueDateTime).toEqual({ dateTime: '2026-05-01T00:00:00', timeZone: 'Asia/Tokyo' })
  })

  it('falls back to UTC when no timezone is supplied', async () => {
    mockGraph
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'NEW', title: 't', status: 'notStarted' }),
      })
    await createOutlookTask('u@x.com', { title: 't', dueDate: '2026-05-01' }, {} as any)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    const body = JSON.parse(opts.body)
    expect(body.dueDateTime).toEqual({ dateTime: '2026-05-01T00:00:00', timeZone: 'UTC' })
  })
})

describe('updateOutlookTask — timezone propagation', () => {
  it('writes dueDateTime.timeZone from input.timezone', async () => {
    mockGraph
      .mockResolvedValueOnce({ // findOutlookTaskList: lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T', title: 't', status: 'notStarted' }) })
    await updateOutlookTask('u@x.com', 'T', { dueDate: '2026-05-01', timezone: 'Europe/Riga' }, {} as any)
    const patchCall = mockGraph.mock.calls[mockGraph.mock.calls.length - 1] as [string, any]
    const payload = JSON.parse(patchCall[1].body)
    expect(payload.dueDateTime).toEqual({ dateTime: '2026-05-01T00:00:00', timeZone: 'Europe/Riga' })
  })

  it('falls back to UTC when no timezone is supplied', async () => {
    mockGraph
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T', title: 't', status: 'notStarted' }) })
    await updateOutlookTask('u@x.com', 'T', { dueDate: '2026-05-01' }, {} as any)
    const patchCall = mockGraph.mock.calls[mockGraph.mock.calls.length - 1] as [string, any]
    const payload = JSON.parse(patchCall[1].body)
    expect(payload.dueDateTime).toEqual({ dateTime: '2026-05-01T00:00:00', timeZone: 'UTC' })
  })
})

describe('moveOutlookTask — timezone propagation', () => {
  it('forwards input.timezone into the recreated task', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists') && !init?.method) {
        return { ok: true, json: async () => ({ value: [
          { id: 'OLD', displayName: 'Tasks' },
          { id: 'NEW', displayName: 'Elvis' },
        ] }) } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/OLD/tasks/OLDID' && !init?.method) {
        return { ok: true, json: async () => ({
          id: 'OLDID', title: 'Original', status: 'notStarted',
          dueDateTime: { dateTime: '2026-05-01T00:00:00', timeZone: 'UTC' },
        }) } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/NEW/tasks/OLDID' && !init?.method) {
        return { ok: false, status: 404, text: async () => '' } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/NEW/tasks' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'NEWID', title: 'Original', status: 'notStarted' }) } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/OLD/tasks/OLDID' && init?.method === 'DELETE') {
        return { ok: true, status: 204 } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    await moveOutlookTask(
      'x@y.z', 'OLDID',
      { targetListId: 'NEW', targetListTitle: 'Elvis', timezone: 'Asia/Tokyo' },
      {} as any,
    )
    const postCall = mockGraph.mock.calls.find((c: any[]) =>
      String(c[0]).endsWith('/lists/NEW/tasks') && c[1]?.method === 'POST',
    ) as [string, any]
    const body = JSON.parse(postCall[1].body)
    expect(body.dueDateTime).toEqual({ dateTime: '2026-05-01T00:00:00', timeZone: 'Asia/Tokyo' })
  })
})

describe('createOutlookTask with explicit listId', () => {
  it('POSTs to the provided listId without resolving the default', async () => {
    mockGraph.mockImplementation(async (path: string) => {
      if (path.endsWith('/todo/lists')) {
        // Should not be called when listId is supplied.
        return { ok: true, json: async () => ({ value: [{ id: 'DEFAULT', displayName: 'Default', wellknownListName: 'defaultList' }] }) } as unknown as Response
      }
      if (path.includes('/todo/lists/EXPLICIT/tasks')) {
        return {
          ok: true,
          json: async () => ({ id: 'new-task', title: 'T', status: 'notStarted' }),
        } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    const task = await createOutlookTask(
      'x@y.z',
      { title: 'T', listId: 'EXPLICIT' },
      { tenantId: 't', clientId: 'c', clientSecret: 's' } as any,
    )
    expect(task.id).toBe('outlook:new-task')
    // Verify the call targeted EXPLICIT and that the default-resolution path was not hit.
    const paths = mockGraph.mock.calls.map((c: any[]) => c[0] as string)
    expect(paths.some(p => p.includes('/todo/lists/EXPLICIT/tasks') && !p.endsWith('/todo/lists'))).toBe(true)
    expect(paths.some(p => p.endsWith('/todo/lists'))).toBe(false)
  })
})

describe('moveOutlookTask', () => {
  it('POSTs to the target list and DELETEs the original when lists differ', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      // findOutlookTaskList enumerates lists and probes each for the task.
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [
          { id: 'OLD', displayName: 'Tasks' },
          { id: 'NEW', displayName: 'Elvis' },
        ] }) } as unknown as Response
      }
      // The probe GET on OLD finds the task.
      if (path === '/users/x%40y.z/todo/lists/OLD/tasks/OLDID' && !init?.method) {
        return { ok: true, json: async () => ({
          id: 'OLDID', title: 'Original', status: 'notStarted',
        }) } as unknown as Response
      }
      // Probe on NEW yields 404 so the probe loop stops at OLD.
      if (path === '/users/x%40y.z/todo/lists/NEW/tasks/OLDID' && !init?.method) {
        return { ok: false, status: 404, text: async () => '' } as unknown as Response
      }
      // POST to NEW list creates the replacement.
      if (path === '/users/x%40y.z/todo/lists/NEW/tasks' && init?.method === 'POST') {
        return { ok: true, json: async () => ({
          id: 'NEWID', title: 'Original', status: 'notStarted',
        }) } as unknown as Response
      }
      // DELETE on OLD.
      if (path === '/users/x%40y.z/todo/lists/OLD/tasks/OLDID' && init?.method === 'DELETE') {
        return { ok: true, status: 204 } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    const result = await moveOutlookTask(
      'x@y.z',
      'OLDID',
      { targetListId: 'NEW', targetListTitle: 'Elvis' },
      { tenantId: 't', clientId: 'c', clientSecret: 's' } as any,
    )
    expect(result.task.id).toBe('outlook:NEWID')
    expect(result.task.listName).toBe('Elvis')
    expect(result.warning).toBeUndefined()
    const calls = mockGraph.mock.calls.map((c: any[]) => ({ path: c[0], method: c[1]?.method ?? 'GET' }))
    expect(calls.some(c => c.path.endsWith('/lists/NEW/tasks') && c.method === 'POST')).toBe(true)
    expect(calls.some(c => c.path.endsWith('/lists/OLD/tasks/OLDID') && c.method === 'DELETE')).toBe(true)
  })

  // Regression: bug #3 — partial-success warning. If the create succeeds but
  // the delete fails, surface ORIGINAL_NOT_DELETED so the API route can tell
  // the client the task may appear in both lists.
  it('returns warning=ORIGINAL_NOT_DELETED when create succeeds but delete fails', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [
          { id: 'OLD', displayName: 'Tasks' },
          { id: 'NEW', displayName: 'Elvis' },
        ] }) } as unknown as Response
      }
      if (path.includes('/lists/OLD/tasks/OLDID') && !init?.method) {
        return { ok: true, json: async () => ({
          id: 'OLDID', title: 'O', status: 'notStarted',
        }) } as unknown as Response
      }
      if (path.includes('/lists/NEW/tasks/OLDID') && !init?.method) {
        return { ok: false, status: 404, text: async () => '' } as unknown as Response
      }
      if (path.endsWith('/lists/NEW/tasks') && init?.method === 'POST') {
        return { ok: true, json: async () => ({
          id: 'NEWID', title: 'O', status: 'notStarted',
        }) } as unknown as Response
      }
      if (path.includes('/lists/OLD/tasks/OLDID') && init?.method === 'DELETE') {
        // Simulate Graph rejecting the delete.
        return { ok: false, status: 500, text: async () => 'oops' } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    const result = await moveOutlookTask(
      'x@y.z', 'OLDID',
      { targetListId: 'NEW' },
      {} as any,
    )
    expect(result.task.id).toBe('outlook:NEWID')
    expect(result.warning).toBe('ORIGINAL_NOT_DELETED')
  })

  // Regression: bug #7 — when caller supplies currentListId, skip the
  // findOutlookTaskList probe (saves O(lists) Graph calls per mutation).
  it('skips the list-probe when currentListId is supplied', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists') && !init?.method) {
        // First call here is fine — it's createOutlookTask resolving the
        // target list title (only when listTitle is omitted). With
        // listTitle supplied or targetListId provided, we don't hit /lists.
        return { ok: false, status: 500, text: async () => '' } as unknown as Response
      }
      if (path.includes('/lists/OLD/tasks/OLDID') && !init?.method) {
        return { ok: true, json: async () => ({ id: 'OLDID', title: 'O', status: 'notStarted' }) } as unknown as Response
      }
      if (path.endsWith('/lists/NEW/tasks') && init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'NEWID', title: 'O', status: 'notStarted' }) } as unknown as Response
      }
      if (path.includes('/lists/OLD/tasks/OLDID') && init?.method === 'DELETE') {
        return { ok: true, status: 204 } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    const result = await moveOutlookTask(
      'x@y.z', 'OLDID',
      { targetListId: 'NEW', targetListTitle: 'Elvis', currentListId: 'OLD' },
      {} as any,
    )
    expect(result.task.id).toBe('outlook:NEWID')
    // No /todo/lists probe should have been called when currentListId is supplied.
    const probedLists = mockGraph.mock.calls.filter(c =>
      String(c[0]).endsWith('/todo/lists') && !c[1]?.method,
    )
    expect(probedLists).toHaveLength(0)
  })

  it('short-circuits to a normal update when target list equals the current one', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [{ id: 'SAME', displayName: 'Tasks' }] }) } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/SAME/tasks/SID' && !init?.method) {
        return { ok: true, json: async () => ({ id: 'SID', title: 'T', status: 'notStarted' }) } as unknown as Response
      }
      if (path === '/users/x%40y.z/todo/lists/SAME/tasks/SID' && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 'SID', title: 'T', status: 'notStarted' }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    await moveOutlookTask(
      'x@y.z',
      'SID',
      { targetListId: 'SAME' },
      { tenantId: 't', clientId: 'c', clientSecret: 's' } as any,
    )
    const calls = mockGraph.mock.calls.map((c: any[]) => ({ path: c[0], method: c[1]?.method ?? 'GET' }))
    // No DELETE should happen when the task is already in the target list.
    expect(calls.some(c => c.method === 'DELETE')).toBe(false)
  })
})

// Regression: bug #2 — every list-id and task-id interpolated into a Graph
// URL must be wrapped with encodeURIComponent. A taskId of `abc?$expand=...`
// would otherwise smuggle a query parameter into the URL. We assert the
// downstream URL contains the encoded form (`?` becomes `%3F`).
describe('URL-injection guard', () => {
  it('encodeURIComponents taskId before interpolating into the Graph URL', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }) } as unknown as Response
      }
      // Probe — return ok so updateOutlookTask uses this list.
      if (path.includes('/lists/L/tasks/') && !init?.method) {
        return { ok: true, json: async () => ({ id: 'x', title: 't', status: 'notStarted' }) } as unknown as Response
      }
      // PATCH — return ok so the call completes.
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 'x', title: 't', status: 'notStarted' }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    await updateOutlookTask('u@x.com', 'abc?$expand=*', { done: true }, {} as any)

    // The taskId carries a `?` and `*` — both must be %-encoded so they
    // can't smuggle a query parameter or wildcard into the URL.
    const calls = mockGraph.mock.calls.map((c: any[]) => String(c[0]))
    expect(calls.some(p => p.includes('abc%3F%24expand%3D'))).toBe(true)
    // No call should contain a raw `?$expand=` past the path segment.
    expect(calls.some(p => p.includes('/tasks/abc?$expand='))).toBe(false)
  })

  it('encodeURIComponents listId before interpolating into the Graph URL', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists') && !init?.method) {
        // Should not be hit — listId is supplied explicitly.
        return { ok: true, json: async () => ({ value: [] }) } as unknown as Response
      }
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'NEW', title: 't', status: 'notStarted' }) } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })

    await createOutlookTask('u@x.com', { title: 't', listId: 'l?$select=id' }, {} as any)
    const postCall = mockGraph.mock.calls.find((c: any[]) => c[1]?.method === 'POST') as [string, any]
    expect(postCall[0]).toContain('l%3F%24select%3Did')
    expect(postCall[0]).not.toContain('?$select=')
  })
})

describe('deleteOutlookTask', () => {
  it('returns true on a successful DELETE', async () => {
    mockGraph.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [{ id: 'L', displayName: 'Tasks' }] }) } as unknown as Response
      }
      if (path.includes('/lists/L/tasks/T') && !init?.method) {
        return { ok: true, json: async () => ({ id: 'T' }) } as unknown as Response
      }
      if (init?.method === 'DELETE') {
        return { ok: true, status: 204 } as unknown as Response
      }
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })
    const ok = await deleteOutlookTask('u@x.com', 'T', {} as any)
    expect(ok).toBe(true)
  })

  it('returns false when the task cannot be found in any list', async () => {
    mockGraph.mockImplementation(async (path: string) => {
      if (path.endsWith('/todo/lists')) {
        return { ok: true, json: async () => ({ value: [{ id: 'L', displayName: 'Tasks' }] }) } as unknown as Response
      }
      // Probe never finds the task.
      return { ok: false, status: 404, text: async () => '' } as unknown as Response
    })
    const ok = await deleteOutlookTask('u@x.com', 'GONE', {} as any)
    expect(ok).toBe(false)
  })

  it('skips the probe when currentListId is supplied', async () => {
    mockGraph.mockImplementation(async (_path: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') return { ok: true, status: 204 } as unknown as Response
      return { ok: false, status: 500, text: async () => '' } as unknown as Response
    })
    const ok = await deleteOutlookTask('u@x.com', 'T', {} as any, 'L')
    expect(ok).toBe(true)
    const probed = mockGraph.mock.calls.filter((c: any[]) =>
      String(c[0]).endsWith('/todo/lists') && !c[1]?.method,
    )
    expect(probed).toHaveLength(0)
  })
})
