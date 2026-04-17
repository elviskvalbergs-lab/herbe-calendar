import { buildOutlookCacheRows } from '@/lib/sync/graph'
import type { OutlookEvent } from '@/lib/outlookUtils'

const baseEv: OutlookEvent = {
  id: 'AAMkAG...',
  subject: 'Standup',
  start: { dateTime: '2026-04-15T09:00:00.0000000' },
  end: { dateTime: '2026-04-15T09:30:00.0000000' },
}

describe('buildOutlookCacheRows', () => {
  it('produces one CachedEventRow for the given person, with source=outlook', () => {
    const rows = buildOutlookCacheRows(baseEv, 'acc-1', 'EKS', 'eks@example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('outlook')
    expect(rows[0].sourceId).toBe('AAMkAG...')
    expect(rows[0].accountId).toBe('acc-1')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].data.source).toBe('outlook')
    expect(rows[0].data.description).toBe('Standup')
  })

  it('skips events without a usable start.dateTime', () => {
    const ev = { ...baseEv, start: {} } as unknown as OutlookEvent
    expect(buildOutlookCacheRows(ev, 'acc-1', 'EKS', 'eks@example.com')).toHaveLength(0)
  })
})
