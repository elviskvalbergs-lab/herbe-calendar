import { GET, POST, toHerbeForm } from '@/app/api/activities/route'
import { herbeFetchAll } from '@/lib/herbe/client'

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

describe('GET /api/activities — CC persons', () => {
  it('emits a CC row for a person listed only in CCPersons', async () => {
    (herbeFetchAll as jest.Mock).mockResolvedValueOnce([
      {
        SerNr: '42',
        MainPersons: 'EKS',
        CCPersons: 'ARA',
        Comment: 'Test activity',
        TransDate: '2026-03-24',
        StartTime: '090000',
        EndTime: '103000',
        CalTimeFlag: '1',
      },
    ])
    const req = new Request('http://localhost/api/activities?persons=EKS,ARA&date=2026-03-24')
    const res = await GET(req)
    const body = await res.json()
    // Should have two rows: one for EKS (main), one for ARA (CC)
    expect(body).toHaveLength(2)
    const ccRow = body.find((a: { personCode: string }) => a.personCode === 'ARA')
    expect(ccRow).toBeDefined()
    expect(ccRow.ccPersons).toContain('ARA')
    expect(ccRow.mainPersons).toContain('EKS')
  })

  it('does not emit a CC row if person is already a main person', async () => {
    (herbeFetchAll as jest.Mock).mockResolvedValueOnce([
      {
        SerNr: '43',
        MainPersons: 'EKS,ARA',
        CCPersons: 'ARA',
        Comment: 'Both',
        TransDate: '2026-03-24',
        StartTime: '090000',
        EndTime: '100000',
        CalTimeFlag: '1',
      },
    ])
    const req = new Request('http://localhost/api/activities?persons=EKS,ARA&date=2026-03-24')
    const res = await GET(req)
    const body = await res.json()
    const araRows = body.filter((a: { personCode: string }) => a.personCode === 'ARA')
    expect(araRows).toHaveLength(1)  // only the main row, not an additional CC row
    expect(araRows[0].mainPersons).toContain('ARA')
  })
})
