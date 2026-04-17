import { buildOutlookCacheRows } from '@/lib/sync/graph'
import type { OutlookEvent } from '@/lib/outlookUtils'

const baseEv: OutlookEvent = {
  id: 'AAMkAG...',
  subject: 'Standup',
  start: { dateTime: '2026-04-15T09:00:00.0000000' },
  end: { dateTime: '2026-04-15T09:30:00.0000000' },
}

describe('buildOutlookCacheRows', () => {
  it('produces one CachedEventRow for the given person, with source=outlook', () => {
    const rows = buildOutlookCacheRows(baseEv, 'acc-1', 'EKS', 'eks@example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('outlook')
    expect(rows[0].sourceId).toBe('AAMkAG...')
    expect(rows[0].accountId).toBe('acc-1')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].data.source).toBe('outlook')
    expect(rows[0].data.description).toBe('Standup')
  })

  it('skips events without a usable start.dateTime', () => {
    const ev = { ...baseEv, start: {} } as unknown as OutlookEvent
    expect(buildOutlookCacheRows(ev, 'acc-1', 'EKS', 'eks@example.com')).toHaveLength(0)
  })
})

import { syncAllOutlook } from '@/lib/sync/graph'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn(),
}))
jest.mock('@/lib/cache/accountPersons', () => ({
  listAccountPersons: jest.fn(),
}))
jest.mock('@/lib/outlookUtils', () => {
  const actual = jest.requireActual('@/lib/outlookUtils')
  return { ...actual, fetchOutlookEventsForPerson: jest.fn() }
})
jest.mock('@/lib/cache/events', () => ({
  upsertCachedEvents: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/cache/syncState', () => ({
  getSyncState: jest.fn().mockResolvedValue(null),
  updateSyncState: jest.fn().mockResolvedValue(undefined),
}))

import { pool } from '@/lib/db'
import { getAzureConfig } from '@/lib/accountConfig'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { fetchOutlookEventsForPerson } from '@/lib/outlookUtils'
import { upsertCachedEvents } from '@/lib/cache/events'

describe('syncAllOutlook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('iterates accounts, skips when Azure not configured', async () => {
    ;(pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
    ;(getAzureConfig as jest.Mock).mockResolvedValueOnce(null)
    const result = await syncAllOutlook('full')
    expect(result.accounts).toBe(1)
    expect(result.connections).toBe(0)
    expect(result.events).toBe(0)
    expect(upsertCachedEvents).not.toHaveBeenCalled()
  })

  it('fetches per-person and upserts when Azure is configured', async () => {
    ;(pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
    ;(getAzureConfig as jest.Mock).mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 'x@y' })
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchOutlookEventsForPerson as jest.Mock).mockResolvedValueOnce([
      { id: 'ev-1', subject: 'Mtg', start: { dateTime: '2026-04-15T09:00:00' }, end: { dateTime: '2026-04-15T10:00:00' } },
    ])
    const result = await syncAllOutlook('full')
    expect(result.events).toBe(1)
    expect(upsertCachedEvents).toHaveBeenCalledTimes(1)
  })
})
