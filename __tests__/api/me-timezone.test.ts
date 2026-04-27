jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))
jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() },
}))

import { PATCH } from '@/app/api/me/timezone/route'
import { requireSession } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>
const mockQuery = (pool as unknown as { query: jest.Mock }).query

describe('PATCH /api/me/timezone', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireSession.mockResolvedValue({ userCode: 'U1', email: 'e@x.com', accountId: 'acc-1' })
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })
  })

  it('returns 401 when unauthenticated', async () => {
    mockRequireSession.mockRejectedValueOnce(new Error('unauth'))
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: 'Asia/Tokyo' }) })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('rejects invalid TZ with 400', async () => {
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: 'Bogus/Zone' }) })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rejects case-mangled TZ with 400', async () => {
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: 'europe/riga' }) })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('writes valid TZ scoped to active account + email and returns 200', async () => {
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: 'Asia/Tokyo' }) })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toMatch(/UPDATE\s+account_members\s+SET\s+timezone\s*=\s*\$1/i)
    expect(sql).toMatch(/account_id\s*=\s*\$2/i)
    expect(sql).toMatch(/LOWER\(\s*email\s*\)\s*=\s*LOWER\(\s*\$3\s*\)/i)
    expect(params).toEqual(['Asia/Tokyo', 'acc-1', 'e@x.com'])
  })

  it('clears TZ when null is sent', async () => {
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: JSON.stringify({ timezone: null }) })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const [, params] = mockQuery.mock.calls[0]
    expect(params).toEqual([null, 'acc-1', 'e@x.com'])
  })

  it('rejects malformed body with 400', async () => {
    const req = new Request('http://x/api/me/timezone', { method: 'PATCH', body: 'not-json' })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
