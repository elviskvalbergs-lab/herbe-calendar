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
