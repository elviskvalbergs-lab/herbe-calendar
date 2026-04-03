jest.mock('@/lib/db', () => ({
  pool: {
    query: jest.fn(),
  },
}))

const { pool } = require('@/lib/db')

describe('emailForCode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function freshEmailForCode() {
    jest.resetModules()
    jest.mock('@/lib/db', () => ({ pool: { query: pool.query } }))
    return require('@/lib/emailForCode').emailForCode as (code: string) => Promise<string | null>
  }

  it('returns email for a valid user code', async () => {
    const fn = freshEmailForCode()
    pool.query.mockResolvedValueOnce({
      rows: [
        { generated_code: 'EKS', email: 'eks@example.com' },
        { generated_code: 'JD', email: 'jd@example.com' },
      ],
    })
    expect(await fn('EKS')).toBe('eks@example.com')
  })

  it('returns null for unknown code', async () => {
    const fn = freshEmailForCode()
    pool.query.mockResolvedValueOnce({
      rows: [{ generated_code: 'EKS', email: 'eks@example.com' }],
    })
    expect(await fn('UNKNOWN')).toBeNull()
  })

  it('returns null on DB error', async () => {
    const fn = freshEmailForCode()
    pool.query.mockRejectedValueOnce(new Error('DB error'))
    expect(await fn('EKS')).toBeNull()
  })

  it('uses cache on second call', async () => {
    const fn = freshEmailForCode()
    pool.query.mockResolvedValueOnce({
      rows: [{ generated_code: 'EKS', email: 'eks@example.com' }],
    })
    await fn('EKS')
    await fn('EKS')
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})
