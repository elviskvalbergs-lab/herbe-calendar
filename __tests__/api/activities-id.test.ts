// Test canEdit as a standalone function — it's exported and pure
// We need to mock the auth module to avoid the NextAuth import chain
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized: jest.fn(),
  forbidden: jest.fn(),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetchById: jest.fn(),
  herbeWebExcellentDelete: jest.fn(),
}))
jest.mock('@/lib/auth', () => ({}))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))

import { canEdit } from '@/app/api/activities/[id]/route'

describe('canEdit — activity permission check', () => {
  it('returns true when user is in MainPersons', () => {
    expect(canEdit({ MainPersons: 'EKS,JD' }, 'EKS')).toBe(true)
  })

  it('returns true when user is in AccessGroup', () => {
    expect(canEdit({ MainPersons: 'OTHER', AccessGroup: 'EKS,BB' }, 'EKS')).toBe(true)
  })

  it('returns true when user is in CCPersons', () => {
    expect(canEdit({ MainPersons: 'OTHER', CCPersons: 'EKS' }, 'EKS')).toBe(true)
  })

  it('returns false when user is not in any field', () => {
    expect(canEdit({ MainPersons: 'OTHER', CCPersons: 'BB' }, 'EKS')).toBe(false)
  })

  it('handles empty/missing MainPersons', () => {
    expect(canEdit({}, 'EKS')).toBe(false)
  })

  it('handles undefined AccessGroup', () => {
    expect(canEdit({ MainPersons: 'OTHER' }, 'EKS')).toBe(false)
  })

  it('handles whitespace in comma-separated values', () => {
    expect(canEdit({ MainPersons: 'JD, EKS , BB' }, 'EKS')).toBe(true)
  })

  it('is case-sensitive for user codes', () => {
    expect(canEdit({ MainPersons: 'eks' }, 'EKS')).toBe(false)
  })

  it('returns true when user is sole MainPerson', () => {
    expect(canEdit({ MainPersons: 'EKS' }, 'EKS')).toBe(true)
  })

  it('returns true when AccessGroup contains user among others', () => {
    expect(canEdit({ MainPersons: 'OTHER', AccessGroup: 'AA, EKS, BB' }, 'EKS')).toBe(true)
  })
})
