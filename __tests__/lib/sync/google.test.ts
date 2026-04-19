import { buildGoogleCacheRows } from '@/lib/sync/google'
import type { GoogleCalendarEvent } from '@/lib/googleUtils'

const baseEv = {
  id: 'gcal-1',
  summary: 'Call',
  start: { dateTime: '2026-04-15T09:00:00+03:00' },
  end: { dateTime: '2026-04-15T10:00:00+03:00' },
} as unknown as GoogleCalendarEvent

describe('buildGoogleCacheRows', () => {
  it('builds a single google row (domain-wide) with empty connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].sourceId).toBe('gcal-1')
  })

  it('builds a google-user row with the tokenId as connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google-user',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
      tokenId: 'tok-123',
      calendarId: 'cal-1',
      calendarName: 'Personal',
      accountEmail: 'eks@gmail.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google-user')
    expect(rows[0].connectionId).toBe('tok-123')
    expect(rows[0].data.googleTokenId).toBe('tok-123')
    expect(rows[0].data.googleCalendarName).toBe('Personal')
  })

  it('skips events without id or start date', () => {
    const bad = { ...baseEv, id: undefined } as GoogleCalendarEvent
    expect(buildGoogleCacheRows(bad, {
      source: 'google', accountId: 'acc-1', personCode: 'EKS',
      personEmail: 'eks@example.com', sessionEmail: 'eks@example.com',
    })).toHaveLength(0)
  })
})

import { syncAllGoogle } from '@/lib/sync/google'

const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }
jest.mock('@/lib/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve(mockClient)),
  },
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn(),
}))
jest.mock('@/lib/googleUtils', () => {
  const actual = jest.requireActual('@/lib/googleUtils')
  return {
    ...actual,
    fetchGoogleEventsForPerson: jest.fn(),
    fetchPerUserGoogleEvents: jest.fn(),
  }
})
jest.mock('@/lib/cache/accountPersons', () => ({
  listAccountPersons: jest.fn(),
}))
jest.mock('@/lib/cache/events', () => ({
  upsertCachedEvents: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/cache/syncState', () => ({
  updateSyncState: jest.fn().mockResolvedValue(undefined),
}))

import { pool } from '@/lib/db'
import { getGoogleConfig } from '@/lib/google/client'
import { fetchGoogleEventsForPerson, fetchPerUserGoogleEvents } from '@/lib/googleUtils'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { upsertCachedEvents } from '@/lib/cache/events'

describe('syncAllGoogle', () => {
  beforeEach(() => jest.clearAllMocks())

  it('domain-wide: skips when Google not configured, still iterates per-user', async () => {
    ;(pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] })
      .mockResolvedValueOnce({ rows: [] })
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce(null)
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([])
    const result = await syncAllGoogle('full')
    expect(result.accounts).toBe(1)
    expect(upsertCachedEvents).not.toHaveBeenCalled()
  })

  it('domain-wide: fetches per person when Google is configured', async () => {
    ;(pool.query as jest.Mock)
      .mockResolvedValue({ rows: [] }) // default for any later call (DELETE etc.)
    ;(pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] }) // tenant_accounts
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce({ clientEmail: 'svc@', privateKey: 'k' })
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchGoogleEventsForPerson as jest.Mock).mockResolvedValueOnce([
      { id: 'g1', summary: 'x', start: { dateTime: '2026-04-15T09:00:00Z' }, end: { dateTime: '2026-04-15T10:00:00Z' } },
    ])
    const result = await syncAllGoogle('full')
    expect(result.events).toBeGreaterThanOrEqual(1)
  })

  it('per-user: iterates user_google_tokens and calls fetchPerUserGoogleEvents', async () => {
    ;(pool.query as jest.Mock)
      .mockResolvedValue({ rows: [] })
    ;(pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] }) // tenant_accounts
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1', user_email: 'eks@example.com', google_email: 'eks@gmail.com' }] }) // user_google_tokens
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce(null) // skip domain-wide
    ;(listAccountPersons as jest.Mock).mockResolvedValueOnce([
      { code: 'EKS', email: 'eks@example.com' },
    ])
    ;(fetchPerUserGoogleEvents as jest.Mock).mockResolvedValueOnce({
      events: [{
        event: { id: 'pu1', summary: 'Gym', start: { dateTime: '2026-04-15T18:00:00Z' }, end: { dateTime: '2026-04-15T19:00:00Z' } },
        calendarId: 'cal-1', calendarName: 'Personal', accountEmail: 'eks@gmail.com', tokenId: 'tok-1',
      }],
      warnings: [],
    })
    const result = await syncAllGoogle('full')
    expect(result.events).toBe(1)
    expect(upsertCachedEvents).toHaveBeenCalled()
  })
})
