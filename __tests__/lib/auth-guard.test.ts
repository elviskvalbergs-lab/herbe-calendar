/**
 * TDD tests for multi-tenant session resolution.
 * requireSession() must return the correct accountId based on:
 * 1. Impersonation cookie (for super admins)
 * 2. activeAccountId cookie (account switching)
 * 3. Account membership (from account_members table)
 */

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
const FLEX_ACCOUNT_ID = 'flex-account-id-123'

// Mock auth to return a session
const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))

// Mock DB
const mockQuery = jest.fn()
jest.mock('@/lib/db', () => ({ pool: { query: mockQuery } }))

// Mock signed cookie verification — pass through raw values in tests
jest.mock('@/lib/signedCookie', () => ({
  verifyCookieValue: jest.fn((val: string) => val),
  signCookieValue: jest.fn((val: string) => val),
}))

// Mock cookies — returns a cookie store with get() method
const cookieValues: Record<string, string | undefined> = {}
jest.mock('next/headers', () => ({
  cookies: () => Promise.resolve({
    get: (name: string) => cookieValues[name] ? { value: cookieValues[name] } : undefined,
  }),
}))

import { requireSession } from '@/lib/herbe/auth-guard'

describe('requireSession — multi-tenant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear cookie values
    Object.keys(cookieValues).forEach(k => delete cookieValues[k])
    // Clear the module-level account cache by importing fresh
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
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: FLEX_ACCOUNT_ID }],
    })

    const session = await requireSession()
    expect(session.accountId).toBe(FLEX_ACCOUNT_ID)
    expect(session.email).toBe('user@company.com')
    expect(session.userCode).toBe('USR')
  })

  it('throws when user has no membership', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'orphan@test.com', userCode: '' },
    })
    mockQuery.mockResolvedValue({ rows: [] })

    await expect(requireSession()).rejects.toThrow('Account membership required')
  })

  it('returns impersonated accountId for super admin with cookie', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'admin@test.com', userCode: 'ADM' },
    })
    cookieValues['impersonateAs'] = `target@flex.com|${FLEX_ACCOUNT_ID}`
    // person_codes lookup for impersonated user
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
    cookieValues['impersonateAs'] = `target@flex.com|${FLEX_ACCOUNT_ID}`
    // Should skip impersonation and look up real membership
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: DEFAULT_ACCOUNT_ID }],
    })

    const session = await requireSession()
    expect(session.accountId).toBe(DEFAULT_ACCOUNT_ID)
    expect(session.email).toBe('regular@test.com')
  })

  it('uses activeAccountId cookie for super admin', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'admin@test.com', userCode: 'ADM' },
    })
    cookieValues['activeAccountId'] = FLEX_ACCOUNT_ID
    // Account existence check
    mockQuery.mockResolvedValueOnce({ rows: [{ id: FLEX_ACCOUNT_ID }] })
    // person_codes lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ generated_code: 'FLX' }] })

    const session = await requireSession()
    expect(session.accountId).toBe(FLEX_ACCOUNT_ID)
    expect(session.userCode).toBe('FLX')
  })

  it('uses activeAccountId cookie for regular member', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'user@company.com', userCode: 'USR' },
    })
    cookieValues['activeAccountId'] = FLEX_ACCOUNT_ID
    // Membership check for active account
    mockQuery.mockResolvedValueOnce({ rows: [{ account_id: FLEX_ACCOUNT_ID }] })
    // person_codes lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ generated_code: 'FLX' }] })

    const session = await requireSession()
    expect(session.accountId).toBe(FLEX_ACCOUNT_ID)
  })

  it('falls back to default when activeAccountId is invalid for non-super-admin', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'user@company.com', userCode: 'USR' },
    })
    cookieValues['activeAccountId'] = 'nonexistent-account'
    // Membership check fails
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Falls back to regular membership lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ account_id: DEFAULT_ACCOUNT_ID }] })

    const session = await requireSession()
    expect(session.accountId).toBe(DEFAULT_ACCOUNT_ID)
  })
})
