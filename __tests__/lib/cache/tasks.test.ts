import {
  getCachedTasks,
  upsertCachedTasks,
  deleteCachedTasksForSource,
  type CachedTaskRow,
} from '@/lib/cache/tasks'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('getCachedTasks', () => {
  it('queries by account, user email, and source', async () => {
    mockQuery.mockResolvedValue({ rows: [{ payload: { id: 'herbe:1', source: 'herbe', title: 't' } }] })
    const result = await getCachedTasks('acc-1', 'u@x.com', 'herbe')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('cached_tasks')
    expect(params).toEqual(['acc-1', 'u@x.com', 'herbe'])
    expect(result).toEqual([{ id: 'herbe:1', source: 'herbe', title: 't' }])
  })
})

describe('upsertCachedTasks', () => {
  it('does nothing for empty array', async () => {
    await upsertCachedTasks([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('builds multi-row upsert', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 })
    const rows: CachedTaskRow[] = [
      { accountId: 'a', userEmail: 'u@x.com', source: 'herbe', connectionId: 'c1', taskId: '1', payload: { id: 'herbe:1' } },
      { accountId: 'a', userEmail: 'u@x.com', source: 'outlook', connectionId: '', taskId: '2', payload: { id: 'outlook:2' } },
    ]
    await upsertCachedTasks(rows)
    const [sql] = mockQuery.mock.calls[0]
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('DO UPDATE')
  })
})

describe('deleteCachedTasksForSource', () => {
  it('deletes all rows for an account+user+source', async () => {
    mockQuery.mockResolvedValue({ rowCount: 7 })
    const count = await deleteCachedTasksForSource('acc-1', 'u@x.com', 'herbe')
    expect(count).toBe(7)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('DELETE')
    expect(params).toEqual(['acc-1', 'u@x.com', 'herbe'])
  })
})
