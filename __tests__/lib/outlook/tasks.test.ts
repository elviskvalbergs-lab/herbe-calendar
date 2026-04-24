import { mapOutlookTask, fetchOutlookTasks, createOutlookTask, updateOutlookTask, type OutlookTaskApi } from '@/lib/outlook/tasks'

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
