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

  it('returns tasks from the default list', async () => {
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
          { id: '1', title: 'One', status: 'notStarted' },
          { id: '2', title: 'Two', status: 'completed' },
        ] }),
      })
    const r = await fetchOutlookTasks('u@x.com', {} as any)
    expect(r.configured).toBe(true)
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks[0].listName).toBe('Tasks')
    expect(r.tasks[1].done).toBe(true)
    expect(mockGraph).toHaveBeenCalledTimes(2)
    expect((mockGraph.mock.calls[0][0] as string)).toContain('/users/u%40x.com/todo/lists')
    expect((mockGraph.mock.calls[1][0] as string)).toContain('/todo/lists/list-b/tasks')
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
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ // PATCH
        ok: true,
        json: async () => ({ id: 'T', title: 'Buy milk', status: 'completed' }),
      })
    const t = await updateOutlookTask('u@x.com', 'T', { done: true }, {} as any)
    expect(t.done).toBe(true)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toMatchObject({ status: 'completed' })
  })

  it('PATCHes title + dueDateTime when edit fields provided', async () => {
    mockGraph
      .mockResolvedValueOnce({ // lists
        ok: true,
        json: async () => ({ value: [{ id: 'L', displayName: 'Tasks', wellknownListName: 'defaultList' }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'T', title: 'New', status: 'notStarted' }) })
    await updateOutlookTask('u@x.com', 'T', { title: 'New', dueDate: '2026-05-01' }, {} as any)
    const [, opts] = mockGraph.mock.calls[1] as [string, any]
    const payload = JSON.parse(opts.body)
    expect(payload.title).toBe('New')
    expect(payload.dueDateTime?.dateTime).toBe('2026-05-01T00:00:00')
  })
})
