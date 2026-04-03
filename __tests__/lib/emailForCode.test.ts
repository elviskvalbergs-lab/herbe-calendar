jest.mock('@/lib/herbe/client', () => ({
  herbeFetchAll: jest.fn(),
}))

const { herbeFetchAll } = require('@/lib/herbe/client')

describe('emailForCode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Use fresh module for each test to reset cache
  function freshEmailForCode() {
    jest.resetModules()
    jest.mock('@/lib/herbe/client', () => ({
      herbeFetchAll,
    }))
    return require('@/lib/emailForCode').emailForCode as (code: string) => Promise<string | null>
  }

  it('returns email for a valid user code', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockResolvedValueOnce([
      { Code: 'EKS', emailAddr: 'eks@example.com' },
      { Code: 'JD', emailAddr: 'jd@example.com' },
    ])
    expect(await fn('EKS')).toBe('eks@example.com')
  })

  it('returns null for unknown code', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockResolvedValueOnce([
      { Code: 'EKS', emailAddr: 'eks@example.com' },
    ])
    expect(await fn('UNKNOWN')).toBeNull()
  })

  it('falls back to LoginEmailAddr when emailAddr is missing', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockResolvedValueOnce([
      { Code: 'AA', LoginEmailAddr: 'aa@example.com' },
    ])
    expect(await fn('AA')).toBe('aa@example.com')
  })

  it('skips users without Code', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockResolvedValueOnce([
      { emailAddr: 'no-code@example.com' },
      { Code: 'BB', emailAddr: 'bb@example.com' },
    ])
    expect(await fn('BB')).toBe('bb@example.com')
  })

  it('skips users without any email', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockResolvedValueOnce([
      { Code: 'NOEMAIL' },
      { Code: 'CC', emailAddr: 'cc@example.com' },
    ])
    expect(await fn('NOEMAIL')).toBeNull()
  })

  it('returns null on fetch error', async () => {
    const fn = freshEmailForCode()
    herbeFetchAll.mockRejectedValueOnce(new Error('Network error'))
    expect(await fn('EKS')).toBeNull()
  })
})
