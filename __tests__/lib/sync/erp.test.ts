import { buildCacheRows } from '@/lib/sync/erp'

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
