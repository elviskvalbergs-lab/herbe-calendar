const mockAuth = jest.fn()
jest.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))

const mockQuery = jest.fn()
jest.mock('@/lib/db', () => ({ pool: { query: mockQuery } }))

import { requireAdminSession } from '@/lib/adminAuth'

const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_ACCOUNT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('requireAdminSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SUPER_ADMIN_EMAILS = 'super@test.com'
  })

  it('throws UNAUTHORIZED when session is null', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(requireAdminSession()).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws UNAUTHORIZED when session has no email', async () => {
    mockAuth.mockResolvedValue({ user: {} })
    await expect(requireAdminSession()).rejects.toThrow('UNAUTHORIZED')
  })

  it('throws FORBIDDEN when user is not admin and has no membership', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'nobody@test.com', userCode: 'NOB' },
    })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await expect(requireAdminSession()).rejects.toThrow('FORBIDDEN')
  })

  it('throws FORBIDDEN when user has membership but role is member (not admin)', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'member@test.com', userCode: 'MEM' },
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: ACCOUNT_ID, role: 'member', display_name: 'Test' }],
    })
    await expect(requireAdminSession()).rejects.toThrow('FORBIDDEN')
  })

  it('returns session for admin user with membership', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'admin@company.com', userCode: 'ADM' },
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ account_id: ACCOUNT_ID, role: 'admin', display_name: 'Company' }],
    })

    const session = await requireAdminSession()
    expect(session.email).toBe('admin@company.com')
    expect(session.accountId).toBe(ACCOUNT_ID)
    expect(session.role).toBe('admin')
    expect(session.isSuperAdmin).toBe(false)
    expect(session.accountName).toBe('Company')
  })

  it('super admin with overrideAccountId returns that accountId', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'super@test.com', userCode: 'SUP' },
    })
    // Query for tenant_accounts display_name
    mockQuery.mockResolvedValueOnce({
      rows: [{ display_name: 'Other Corp' }],
    })

    const session = await requireAdminSession('admin', OTHER_ACCOUNT_ID)
    expect(session.accountId).toBe(OTHER_ACCOUNT_ID)
    expect(session.isSuperAdmin).toBe(true)
    expect(session.accountName).toBe('Other Corp')
    expect(session.userCode).toBe('SUP')
  })

  it('super admin without membership falls back to default account', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'super@test.com', userCode: 'SUP' },
    })
    // account_members lookup returns no rows
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const session = await requireAdminSession()
    expect(session.accountId).toBe(ACCOUNT_ID)
    expect(session.isSuperAdmin).toBe(true)
    expect(session.role).toBe('admin')
    expect(session.accountName).toBe('Default')
  })

  it('throws FORBIDDEN when non-super-admin requests superadmin role', async () => {
    mockAuth.mockResolvedValue({
      user: { email: 'regular@test.com', userCode: 'REG' },
    })
    await expect(requireAdminSession('superadmin')).rejects.toThrow('FORBIDDEN')
  })
})
