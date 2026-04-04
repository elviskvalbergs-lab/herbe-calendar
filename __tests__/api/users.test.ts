jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
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
jest.mock('@/lib/sourceConfig', () => ({
  isHerbeConfigured: jest.fn().mockReturnValue(true),
  isAzureConfigured: jest.fn().mockReturnValue(false),
}))

// Mock syncPersonCodes to pass through raw data as person codes
jest.mock('@/lib/personCodes', () => ({
  syncPersonCodes: jest.fn(async (users: any[]) =>
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

describe('GET /api/users', () => {
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
})
