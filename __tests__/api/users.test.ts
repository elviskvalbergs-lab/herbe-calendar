jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com', accountId: 'account-1' }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetchAll: jest.fn().mockResolvedValue([
    { Code: 'EKS', Name: 'Elvis Kvalbergs', emailAddr: 'eks@example.com', Closed: '0' },
    { Code: 'JD', Name: 'John Doe', LoginEmailAddr: 'jd@example.com', Closed: '0' },
    { Code: 'CLOSED', Name: 'Old User', emailAddr: 'old@example.com', Closed: '1' },
  ]),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'disabled' }),
}))
jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}))
jest.mock('@/lib/auth', () => ({}))
jest.mock('@/lib/accountConfig', () => ({
  getErpConnections: jest.fn().mockResolvedValue([{
    id: 'test-conn', name: 'Test ERP', apiBaseUrl: '', companyCode: '3',
    clientId: '', clientSecret: '', accessToken: null, refreshToken: null,
    tokenExpiresAt: 0, username: null, password: null, active: true,
  }]),
  getAzureConfig: jest.fn().mockResolvedValue(null),
}))

// Mock syncPersonCodes to pass through raw data as person codes
jest.mock('@/lib/personCodes', () => ({
  syncPersonCodes: jest.fn(async (users: any[], _accountId: string) =>
    users.map(u => ({
      id: 'mock-id',
      azure_object_id: u.azureObjectId ?? null,
      erp_code: u.erpCode ?? null,
      generated_code: u.erpCode ?? 'GEN',
      email: u.email,
      display_name: u.displayName,
      source: u.source,
    }))
  ),
}))

import { GET } from '@/app/api/users/route'
const { requireSession } = require('@/lib/herbe/auth-guard')
const { getErpConnections } = require('@/lib/accountConfig')

describe('GET /api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset default mocks
    requireSession.mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com', accountId: 'account-1' })
    getErpConnections.mockResolvedValue([{
      id: 'test-conn', name: 'Test ERP', apiBaseUrl: '', companyCode: '3',
      clientId: '', clientSecret: '', accessToken: null, refreshToken: null,
      tokenExpiresAt: 0, username: null, password: null, active: true,
    }])
  })

  it('returns { users, sources } envelope', async () => {
    const req = new Request('http://localhost/api/users')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('users')
    expect(body).toHaveProperty('sources')
    expect(Array.isArray(body.users)).toBe(true)
    expect(body.sources).toHaveProperty('herbe')
    expect(body.sources).toHaveProperty('azure')
  })

  it('returns users with Code, Name, emailAddr fields', async () => {
    const req = new Request('http://localhost/api/users')
    const res = await GET(req as any)
    const body = await res.json()
    expect(body.users.length).toBeGreaterThan(0)
    const user = body.users[0]
    expect(user).toHaveProperty('Code')
    expect(user).toHaveProperty('Name')
    expect(user).toHaveProperty('emailAddr')
  })

  it('filters out closed ERP users', async () => {
    const req = new Request('http://localhost/api/users')
    const res = await GET(req as any)
    const body = await res.json()
    const codes = body.users.map((u: any) => u.Code)
    expect(codes).not.toContain('CLOSED')
  })

  it('caches users per account — different accounts get different results', async () => {
    // Account 1: has ERP users
    requireSession.mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com', accountId: 'account-1' })
    const res1 = await GET(new Request('http://localhost/api/users?bust=1') as any)
    const body1 = await res1.json()
    expect(body1.users.length).toBeGreaterThan(0)

    // Account 2: no ERP connections, no users
    requireSession.mockResolvedValue({ userCode: 'OTHER', email: 'other@example.com', accountId: 'account-2' })
    getErpConnections.mockResolvedValue([])
    const res2 = await GET(new Request('http://localhost/api/users?bust=1') as any)
    const body2 = await res2.json()
    expect(body2.users).toHaveLength(0)

    // Account 1 again (cached): should still return its own users, not account-2's empty list
    requireSession.mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com', accountId: 'account-1' })
    const res3 = await GET(new Request('http://localhost/api/users') as any)
    const body3 = await res3.json()
    expect(body3.users.length).toBeGreaterThan(0)
    expect(body3.users.length).toBe(body1.users.length)
  })
})
