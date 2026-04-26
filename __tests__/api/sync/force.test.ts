jest.mock('@/lib/adminAuth', () => ({ requireAdminSession: jest.fn() }))
jest.mock('@/lib/sync/erp', () => ({ forceSyncRange: jest.fn() }))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/auth', () => ({}))

import { POST } from '@/app/api/sync/force/route'
import { NextRequest } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { forceSyncRange } from '@/lib/sync/erp'

const mockRequireAdminSession = requireAdminSession as jest.Mock
const mockForceSyncRange = forceSyncRange as jest.Mock

const buildReq = (body: unknown) =>
  new NextRequest('http://localhost/api/sync/force', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

describe('POST /api/sync/force', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdminSession.mockResolvedValue({
      email: 'admin@example.com',
      userCode: 'EKS',
      accountId: 'account-1',
      role: 'admin',
      isSuperAdmin: false,
      accountName: 'Test',
    })
    mockForceSyncRange.mockResolvedValue({
      accounts: 1,
      connections: 1,
      events: 42,
      errors: [],
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAdminSession.mockRejectedValue(new Error('UNAUTHORIZED'))
    const res = await POST(buildReq({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }))
    expect(res.status).toBe(401)
    expect(mockForceSyncRange).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated user is not admin', async () => {
    mockRequireAdminSession.mockRejectedValue(new Error('FORBIDDEN'))
    const res = await POST(buildReq({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }))
    expect(res.status).toBe(403)
    expect(mockForceSyncRange).not.toHaveBeenCalled()
  })

  it('returns 400 when dateFrom or dateTo is missing', async () => {
    const res = await POST(buildReq({ dateFrom: '2026-01-01' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'dateFrom and dateTo are required' })
    expect(mockForceSyncRange).not.toHaveBeenCalled()
  })

  it('returns 200 happy path with synced summary', async () => {
    const res = await POST(buildReq({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.synced).toBe(true)
    expect(body.events).toBe(42)
    expect(mockForceSyncRange).toHaveBeenCalledWith('account-1', '2026-01-01', '2026-01-31')
  })

  it('returns 500 when forceSyncRange rejects', async () => {
    mockForceSyncRange.mockRejectedValue(new Error('sync exploded'))
    const res = await POST(buildReq({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
