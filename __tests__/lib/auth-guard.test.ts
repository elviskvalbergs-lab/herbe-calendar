/**
 * TDD tests for multi-tenant session resolution.
 * requireSession() must return the correct accountId based on:
 * 1. Account membership (from account_members table)
 * 2. Impersonation cookie (for super admins)
 * 3. Default account fallback
 */

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
const FLEX_ACCOUNT_ID = 'flex-account-id-123'

// Mock auth to return a session
const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))

// Mock DB
const mockQuery = jest.fn()
jest.mock('@/lib/db', () => ({ pool: { query: mockQuery } }))

// Mock cookies
const mockCookies = jest.fn()
jest.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}))

import { requireSession } from '@/lib/herbe/auth-guard'

describe('requireSession — multi-tenant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SUPER_ADMIN_EMAILS = 'admin@test.com'
  })

  it('throws when no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireSession()).rejects.toBeDefined()
  })

  it('returns accountId from account_members for regular user', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'user@company.com', userCode: 'USR' },
    })
    mockCookies.mockReturnValue({ get: () => null })
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: FLEX_ACCOUNT_ID }],
    })

    const session = await requireSession()
    expect(session.accountId).toBe(FLEX_ACCOUNT_ID)
    expect(session.email).toBe('user@company.com')
    expect(session.userCode).toBe('USR')
  })

  it('returns DEFAULT_ACCOUNT_ID when user has no membership', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'orphan@test.com', userCode: '' },
    })
    mockCookies.mockReturnValue({ get: () => null })
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const session = await requireSession()
    expect(session.accountId).toBe(DEFAULT_ACCOUNT_ID)
  })

  it('returns impersonated accountId for super admin with cookie', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'admin@test.com', userCode: 'ADM' },
    })
    mockCookies.mockReturnValue({
      get: (name: string) => name === 'impersonateAs'
        ? { value: `target@flex.com|${FLEX_ACCOUNT_ID}` }
        : null,
    })
    // First query: person_codes lookup for impersonated user
    mockQuery.mockResolvedValueOnce({
      rows: [{ generated_code: 'TGT' }],
    })

    const session = await requireSession()
    expect(session.accountId).toBe(FLEX_ACCOUNT_ID)
    expect(session.email).toBe('target@flex.com')
    expect(session.userCode).toBe('TGT')
  })

  it('ignores impersonation cookie for non-super-admin', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'regular@test.com', userCode: 'REG' },
    })
    mockCookies.mockReturnValue({
      get: (name: string) => name === 'impersonateAs'
        ? { value: `target@flex.com|${FLEX_ACCOUNT_ID}` }
        : null,
    })
    // Should skip impersonation and look up real membership
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: DEFAULT_ACCOUNT_ID }],
    })

    const session = await requireSession()
    expect(session.accountId).toBe(DEFAULT_ACCOUNT_ID)
    expect(session.email).toBe('regular@test.com')
  })

  it('caches accountId resolution for same email', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'cached@test.com', userCode: 'CSH' },
    })
    mockCookies.mockReturnValue({ get: () => null })
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: FLEX_ACCOUNT_ID }],
    })

    const s1 = await requireSession()
    const s2 = await requireSession()

    expect(s1.accountId).toBe(FLEX_ACCOUNT_ID)
    expect(s2.accountId).toBe(FLEX_ACCOUNT_ID)
    // DB queried only once (second call uses cache)
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })
})
