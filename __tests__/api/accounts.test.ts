import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))

const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

// Mock next/headers cookies
const mockCookiesGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...args: unknown[]) => mockCookiesGet(...args) }),
}))

const mockQuery = pool.query as jest.Mock

// Import after mocks
import { GET } from '@/app/api/settings/accounts/route'

describe('GET /api/settings/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.SUPER_ADMIN_EMAILS
  })

  it('returns 401 for unauthenticated user', async () => {
    mockAuth.mockResolvedValueOnce(null)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when session has no email', async () => {
    mockAuth.mockResolvedValueOnce({ user: {} })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns accounts for authenticated user', async () => {
    const accounts = [
      { id: 'acc-1', display_name: 'Acme Corp', role: 'admin' },
      { id: 'acc-2', display_name: 'Other Co', role: 'member' },
    ]
    mockAuth.mockResolvedValueOnce({ user: { email: 'user@example.com' } })
    mockQuery.mockResolvedValueOnce({ rows: accounts })
    mockCookiesGet.mockReturnValue({ value: 'acc-1' })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.accounts).toEqual(accounts)
    expect(body.email).toBe('user@example.com')
  })

  it('isAdmin is true when user role is admin', async () => {
    const accounts = [{ id: 'acc-1', display_name: 'Acme Corp', role: 'admin' }]
    mockAuth.mockResolvedValueOnce({ user: { email: 'admin@example.com' } })
    mockQuery.mockResolvedValueOnce({ rows: accounts })
    mockCookiesGet.mockReturnValue({ value: 'acc-1' })

    const res = await GET()
    const body = await res.json()

    expect(body.isAdmin).toBe(true)
  })

  it('isAdmin is false when user role is member', async () => {
    const accounts = [{ id: 'acc-1', display_name: 'Acme Corp', role: 'member' }]
    mockAuth.mockResolvedValueOnce({ user: { email: 'member@example.com' } })
    mockQuery.mockResolvedValueOnce({ rows: accounts })
    mockCookiesGet.mockReturnValue({ value: 'acc-1' })

    const res = await GET()
    const body = await res.json()

    expect(body.isAdmin).toBe(false)
  })

  it('isAdmin is true for super admin regardless of role', async () => {
    process.env.SUPER_ADMIN_EMAILS = 'super@example.com,other@example.com'
    const accounts = [{ id: 'acc-1', display_name: 'Acme Corp', role: 'member' }]
    mockAuth.mockResolvedValueOnce({ user: { email: 'super@example.com' } })
    mockQuery.mockResolvedValueOnce({ rows: accounts })
    mockCookiesGet.mockReturnValue({ value: 'acc-1' })

    const res = await GET()
    const body = await res.json()

    expect(body.isAdmin).toBe(true)
    expect(body.isSuperAdmin).toBe(true)
  })

  it('returns email in response', async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: 'Test@Example.COM' } })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockCookiesGet.mockReturnValue(undefined)

    const res = await GET()
    const body = await res.json()

    expect(body.email).toBe('test@example.com')
  })

  it('queries with lowercased email', async () => {
    mockAuth.mockResolvedValueOnce({ user: { email: 'User@Example.COM' } })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    mockCookiesGet.mockReturnValue(undefined)

    await GET()

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['user@example.com']
    )
  })
})
