import { GET, POST, toHerbeForm } from '@/app/api/activities/route'
import { canEdit as canEditActivity } from '@/app/api/activities/[id]/route'
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

  it('omits undefined and null values', () => {
    const result = toHerbeForm({ a: undefined, b: null, c: 'ok' })
    expect(result).toBe('set_field.c=ok')
  })

  it('encodes special characters', () => {
    const result = toHerbeForm({ Comment: 'hello world & more' })
    expect(result).toContain('set_field.Comment=hello%20world%20%26%20more')
  })

  it('handles Text field with short text', () => {
    const result = toHerbeForm({ Text: 'short' })
    expect(result).toContain('set_row_field.0.Text=short')
  })

  it('handles Text field with empty string', () => {
    const result = toHerbeForm({ Text: '' }, new Set(['Text']))
    expect(result).toContain('set_row_field.0.Text=')
  })

  it('chunks long Text into 100-char rows', () => {
    const long = 'a'.repeat(250)
    const result = toHerbeForm({ Text: long })
    expect(result).toContain('set_row_field.0.Text=')
    expect(result).toContain('set_row_field.1.Text=')
    expect(result).toContain('set_row_field.2.Text=')
  })

  it('handles Text with newlines as separate rows', () => {
    const result = toHerbeForm({ Text: 'line1\nline2' })
    expect(result).toContain('set_row_field.0.Text=line1')
    expect(result).toContain('set_row_field.1.Text=line2')
  })

  it('clears subsequent rows after text chunks', () => {
    const result = toHerbeForm({ Text: 'short' })
    // Should have clearing rows after the text
    expect(result).toContain('set_row_field.1.Text=')
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

describe('canEdit — CC persons', () => {
  it('returns true when userCode is in CCPersons', () => {
    const activity = { MainPersons: 'EKS', CCPersons: 'ARA', AccessGroup: '' }
    expect(canEditActivity(activity, 'ARA')).toBe(true)
  })

  it('returns false when userCode is absent from all lists', () => {
    const activity = { MainPersons: 'EKS', CCPersons: 'ARA', AccessGroup: '' }
    expect(canEditActivity(activity, 'UNKNOWN')).toBe(false)
  })
})
