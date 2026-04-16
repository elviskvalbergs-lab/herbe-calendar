import { upsertCachedEvents, getCachedEvents, deleteCachedEvents, deleteCachedEventsBySource } from '@/lib/cache/events'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('getCachedEvents', () => {
  it('queries by account, person codes, and date range', async () => {
    mockQuery.mockResolvedValue({ rows: [{ data: { id: '1', source: 'herbe' } }] })
    const result = await getCachedEvents('acc-1', ['EKS', 'JD'], '2026-04-10', '2026-04-16')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('cached_events')
    expect(params).toEqual(['acc-1', ['EKS', 'JD'], '2026-04-10', '2026-04-16', 'herbe'])
    expect(result).toEqual([{ id: '1', source: 'herbe' }])
  })
})

describe('upsertCachedEvents', () => {
  it('does nothing for empty array', async () => {
    await upsertCachedEvents([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('builds multi-row upsert for multiple events', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 })
    await upsertCachedEvents([
      { source: 'herbe', sourceId: '100', accountId: 'acc-1', connectionId: 'c1', personCode: 'EKS', date: '2026-04-10', data: { id: '100' } },
      { source: 'herbe', sourceId: '101', accountId: 'acc-1', connectionId: 'c1', personCode: 'JD', date: '2026-04-11', data: { id: '101' } },
    ])
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql] = mockQuery.mock.calls[0]
    expect(sql).toContain('ON CONFLICT')
    expect(sql).toContain('DO UPDATE')
  })
})

describe('deleteCachedEvents', () => {
  it('deletes by account, source, and date range', async () => {
    mockQuery.mockResolvedValue({ rowCount: 5 })
    const count = await deleteCachedEvents('acc-1', 'herbe', '2026-04-10', '2026-04-16')
    expect(count).toBe(5)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('DELETE')
    expect(params).toEqual(['acc-1', 'herbe', '2026-04-10', '2026-04-16'])
  })
})

describe('deleteCachedEventsBySource', () => {
  it('deletes all events for a source in an account', async () => {
    mockQuery.mockResolvedValue({ rowCount: 50 })
    const count = await deleteCachedEventsBySource('acc-1', 'herbe')
    expect(count).toBe(50)
  })
})
