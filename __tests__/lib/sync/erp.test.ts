import { buildCacheRows, fullSyncRange, isRangeCovered } from '@/lib/sync/erp'

describe('buildCacheRows', () => {
  it('creates one row per person from MainPersons', () => {
    const record = {
      SerNr: '100',
      TransDate: '2026-04-15',
      StartTime: '09:00',
      EndTime: '10:00',
      Comment: 'Meeting',
      MainPersons: 'EKS, JD',
      CCPersons: '',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '0',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', 'conn-name')
    expect(rows).toHaveLength(2)
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].sourceId).toBe('100')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].data.source).toBe('herbe')
    expect(rows[1].personCode).toBe('JD')
  })

  it('includes CC persons who are not in MainPersons', () => {
    const record = {
      SerNr: '101',
      TransDate: '2026-04-15',
      MainPersons: 'EKS',
      CCPersons: 'EKS, MK',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '0',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', '')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.personCode)).toEqual(['EKS', 'MK'])
  })

  it('skips tasks (TodoFlag != 0)', () => {
    const record = {
      SerNr: '102',
      TransDate: '2026-04-15',
      MainPersons: 'EKS',
      CCPersons: '',
      CalTimeFlag: '1',
      OKFlag: '0',
      TodoFlag: '1',
    }
    const rows = buildCacheRows(record, 'acc-1', 'conn-1', '')
    expect(rows).toHaveLength(0)
  })
})

describe('fullSyncRange', () => {
  it('rounds the -90d/+30d window out to whole months so month view never straddles', () => {
    // today - 90d = 2026-01-16 → start-of-month = 2026-01-01
    // today + 30d = 2026-05-16 → end-of-month   = 2026-05-31
    expect(fullSyncRange(new Date('2026-04-16T12:00:00Z'))).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-05-31',
    })
  })

  it('rounds outward even when today is on the first/last of a month', () => {
    // today - 90d = 2025-10-03 → start-of-month = 2025-10-01
    // today + 30d = 2026-01-31 → end-of-month   = 2026-01-31
    expect(fullSyncRange(new Date('2026-01-01T12:00:00Z'))).toEqual({
      dateFrom: '2025-10-01',
      dateTo: '2026-01-31',
    })
  })
})

describe('isRangeCovered', () => {
  // window for 2026-04-16 is 2026-01-01 → 2026-05-31
  const today = new Date('2026-04-16T12:00:00Z')

  it('returns true for a range fully inside the sync window', () => {
    expect(isRangeCovered('2026-04-01', '2026-04-30', today)).toBe(true)
  })

  it('returns true at the exact window boundaries', () => {
    expect(isRangeCovered('2026-01-01', '2026-05-31', today)).toBe(true)
  })

  it('returns false when the start is earlier than the window', () => {
    // week straddle: Dec 29 spills outside the Jan 1 floor
    expect(isRangeCovered('2025-12-29', '2026-01-04', today)).toBe(false)
  })

  it('returns false when the end is later than the window', () => {
    expect(isRangeCovered('2026-05-28', '2026-06-03', today)).toBe(false)
  })

  it('returns false for a single day outside the window', () => {
    expect(isRangeCovered('2025-12-15', '2025-12-15', today)).toBe(false)
  })
})
