import { GET, POST, toHerbeForm } from '@/app/api/activities/route'

// Mock Herbe client
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchAll: jest.fn().mockResolvedValue([]),
  herbeUrl: jest.fn().mockReturnValue('http://mock/3/ActVc'),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
}))

describe('toHerbeForm', () => {
  it('omits empty strings by default', () => {
    const result = toHerbeForm({ Comment: '', ActType: 'DESK' })
    expect(result).not.toContain('Comment')
    expect(result).toContain('ActType')
  })

  it('passes through empty string when field is in allowEmptyFields', () => {
    const result = toHerbeForm({ CCPersons: '' }, new Set(['CCPersons']))
    expect(result).toContain('CCPersons')
  })
})

describe('GET /api/activities', () => {
  it('returns 400 if persons param is missing', async () => {
    const req = new Request('http://localhost/api/activities')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty array when no activities', async () => {
    const req = new Request('http://localhost/api/activities?persons=EKS&date=2026-03-12')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})
