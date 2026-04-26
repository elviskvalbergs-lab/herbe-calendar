jest.mock('@/lib/sync/erp', () => ({ syncAllErp: jest.fn() }))
jest.mock('@/lib/sync/graph', () => ({ syncAllOutlook: jest.fn() }))
jest.mock('@/lib/sync/google', () => ({ syncAllGoogle: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ purgeOldEvents: jest.fn() }))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/auth', () => ({}))

import { GET } from '@/app/api/sync/cron/route'
import { NextRequest } from 'next/server'
import { syncAllErp } from '@/lib/sync/erp'
import { syncAllOutlook } from '@/lib/sync/graph'
import { syncAllGoogle } from '@/lib/sync/google'
import { purgeOldEvents } from '@/lib/analytics'

const mockSyncAllErp = syncAllErp as jest.Mock
const mockSyncAllOutlook = syncAllOutlook as jest.Mock
const mockSyncAllGoogle = syncAllGoogle as jest.Mock
const mockPurgeOldEvents = purgeOldEvents as jest.Mock

const sampleResult = (label: string) => ({
  accounts: 1,
  connections: 1,
  events: 5,
  errors: [] as string[],
  _label: label,
})

describe('GET /api/sync/cron', () => {
  const origSecret = process.env.CRON_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mockSyncAllErp.mockResolvedValue(sampleResult('erp'))
    mockSyncAllOutlook.mockResolvedValue(sampleResult('outlook'))
    mockSyncAllGoogle.mockResolvedValue(sampleResult('google'))
    mockPurgeOldEvents.mockResolvedValue(7)
  })

  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = origSecret
  })

  it('returns 401 when no Authorization header is present', async () => {
    const req = new NextRequest('http://localhost/api/sync/cron')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockSyncAllErp).not.toHaveBeenCalled()
    expect(mockSyncAllOutlook).not.toHaveBeenCalled()
    expect(mockSyncAllGoogle).not.toHaveBeenCalled()
  })

  it('returns 401 when bearer token is wrong', async () => {
    const req = new NextRequest('http://localhost/api/sync/cron', {
      headers: { Authorization: 'Bearer wrong' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockSyncAllErp).not.toHaveBeenCalled()
  })

  it('returns 200 with summary on happy path and runs incremental sync by default', async () => {
    const req = new NextRequest('http://localhost/api/sync/cron', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('erp')
    expect(body).toHaveProperty('outlook')
    expect(body).toHaveProperty('google')
    expect(body).toHaveProperty('purgedAnalyticsEvents', 7)
    expect(mockSyncAllErp).toHaveBeenCalledWith('incremental')
    expect(mockSyncAllOutlook).toHaveBeenCalledWith('incremental')
    expect(mockSyncAllGoogle).toHaveBeenCalledWith('incremental')
  })

  it('passes "full" to syncers when ?mode=full', async () => {
    const req = new NextRequest('http://localhost/api/sync/cron?mode=full', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(mockSyncAllErp).toHaveBeenCalledWith('full')
    expect(mockSyncAllOutlook).toHaveBeenCalledWith('full')
    expect(mockSyncAllGoogle).toHaveBeenCalledWith('full')
  })

  it('returns 500 when syncAllErp rejects', async () => {
    mockSyncAllErp.mockRejectedValue(new Error('boom'))
    const req = new NextRequest('http://localhost/api/sync/cron', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
  })

  it('does not fail the route when purgeOldEvents rejects (returns 0)', async () => {
    mockPurgeOldEvents.mockRejectedValue(new Error('analytics down'))
    const req = new NextRequest('http://localhost/api/sync/cron', {
      headers: { Authorization: 'Bearer test-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.purgedAnalyticsEvents).toBe(0)
    expect(body).toHaveProperty('erp')
    expect(body).toHaveProperty('outlook')
    expect(body).toHaveProperty('google')
  })
})
