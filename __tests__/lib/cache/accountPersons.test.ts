import { listAccountPersons } from '@/lib/cache/accountPersons'
import { pool } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

const mockQuery = pool.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
})

describe('listAccountPersons', () => {
  it('returns {code,email} rows for an account, skipping blanks', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { generated_code: 'EKS', email: 'eks@example.com' },
        { generated_code: 'JD', email: 'jd@example.com' },
      ],
    })
    const rows = await listAccountPersons('acc-1')
    expect(rows).toEqual([
      { code: 'EKS', email: 'eks@example.com' },
      { code: 'JD', email: 'jd@example.com' },
    ])
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain('person_codes')
    expect(sql).toContain('generated_code')
    expect(params).toEqual(['acc-1'])
  })
})
