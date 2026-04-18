const mockQuery = jest.fn()
const mockConnect = jest.fn()
jest.mock('@/lib/db', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
}))

import { findUniqueCode, syncPersonCodes, deleteMember, mergePersonCodes } from '@/lib/personCodes'
import type { RawUser } from '@/lib/personCodes'

const ACCOUNT_ID = 'acc-001'

describe('findUniqueCode', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns base code when it is available', async () => {
    // Single LIKE query returns no matching codes
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const code = await findUniqueCode('EKS', ACCOUNT_ID)
    expect(code).toBe('EKS')
  })

  it('returns suffixed code on collision', async () => {
    // Single LIKE query returns the base code as taken
    mockQuery.mockResolvedValueOnce({ rows: [{ generated_code: 'EKS' }] })
    const code = await findUniqueCode('EKS', ACCOUNT_ID)
    expect(code).toBe('EKS2')
  })
})

describe('syncPersonCodes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns empty array for empty user list', async () => {
    const result = await syncPersonCodes([], ACCOUNT_ID)
    expect(result).toEqual([])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('updates existing record matched by email', async () => {
    const users: RawUser[] = [
      { email: 'elvis@test.com', displayName: 'Elvis Kvalbergs', source: 'azure' },
    ]
    const existingRow = {
      id: 'row-1',
      azure_object_id: null,
      erp_code: null,
      generated_code: 'EKS',
      email: 'elvis@test.com',
      display_name: 'Elvis K',
      source: 'azure',
    }
    // Load existing person_codes for account
    mockQuery.mockResolvedValueOnce({ rows: [existingRow] })
    // UPDATE returning the updated row
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...existingRow, display_name: 'Elvis Kvalbergs' }],
    })

    const result = await syncPersonCodes(users, ACCOUNT_ID)
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('Elvis Kvalbergs')
    // The second query should be the UPDATE
    expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE person_codes/)
  })

  it('inserts new record when no match found', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
    const users: RawUser[] = [
      { email: 'new@test.com', displayName: 'New User', source: 'azure' },
    ]
    const newRow = {
      id: 'row-2',
      azure_object_id: null,
      erp_code: null,
      generated_code: 'NUR',
      email: 'new@test.com',
      display_name: 'New User',
      source: 'azure',
    }
    // Load existing person_codes: none
    mockQuery.mockResolvedValueOnce({ rows: [] })
    // Batched INSERT returning new row (code resolved in-memory, no findUniqueCode query)
    mockQuery.mockResolvedValueOnce({ rows: [newRow] })

    const result = await syncPersonCodes(users, ACCOUNT_ID)
    expect(warnSpy).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].generated_code).toBe('NUR')
    // Only 2 queries: SELECT existing + batched INSERT
    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery.mock.calls[1][0]).toMatch(/INSERT INTO person_codes/)
    warnSpy.mockRestore()
  })
})

describe('deleteMember', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws when cascade=false and references exist', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({}),
      release: jest.fn(),
    }
    mockConnect.mockResolvedValue(mockClient)

    // BEGIN
    mockClient.query.mockResolvedValueOnce({})
    // countMemberReferences — favorites query returns 1
    mockClient.query.mockResolvedValueOnce({ rows: [{ n: 1 }] })
    // countMemberReferences — shared calendars
    mockClient.query.mockResolvedValueOnce({ rows: [{ n: 0 }] })
    // countMemberReferences — cached events
    mockClient.query.mockResolvedValueOnce({ rows: [{ n: 0 }] })
    // ROLLBACK is called twice (once in the if-block, once in the catch)
    // — the default mockResolvedValue({}) handles both

    await expect(
      deleteMember(ACCOUNT_ID, 'user@test.com', 'USR', false),
    ).rejects.toThrow('Cannot delete')

    expect(mockClient.release).toHaveBeenCalled()
  })
})

describe('mergePersonCodes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects when fromId === intoId', async () => {
    await expect(
      mergePersonCodes(ACCOUNT_ID, 'same-id', 'same-id'),
    ).rejects.toThrow('Cannot merge a row into itself')
    // Should not even attempt a DB connection
    expect(mockConnect).not.toHaveBeenCalled()
  })
})
