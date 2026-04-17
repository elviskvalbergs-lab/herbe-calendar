import { buildGoogleCacheRows } from '@/lib/sync/google'
import type { GoogleCalendarEvent } from '@/lib/googleUtils'

const baseEv = {
  id: 'gcal-1',
  summary: 'Call',
  start: { dateTime: '2026-04-15T09:00:00+03:00' },
  end: { dateTime: '2026-04-15T10:00:00+03:00' },
} as unknown as GoogleCalendarEvent

describe('buildGoogleCacheRows', () => {
  it('builds a single google row (domain-wide) with empty connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google')
    expect(rows[0].connectionId).toBe('')
    expect(rows[0].personCode).toBe('EKS')
    expect(rows[0].date).toBe('2026-04-15')
    expect(rows[0].sourceId).toBe('gcal-1')
  })

  it('builds a google-user row with the tokenId as connection_id', () => {
    const rows = buildGoogleCacheRows(baseEv, {
      source: 'google-user',
      accountId: 'acc-1',
      personCode: 'EKS',
      personEmail: 'eks@example.com',
      sessionEmail: 'eks@example.com',
      tokenId: 'tok-123',
      calendarId: 'cal-1',
      calendarName: 'Personal',
      accountEmail: 'eks@gmail.com',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('google-user')
    expect(rows[0].connectionId).toBe('tok-123')
    expect(rows[0].data.googleTokenId).toBe('tok-123')
    expect(rows[0].data.googleCalendarName).toBe('Personal')
  })

  it('skips events without id or start date', () => {
    const bad = { ...baseEv, id: undefined } as GoogleCalendarEvent
    expect(buildGoogleCacheRows(bad, {
      source: 'google', accountId: 'acc-1', personCode: 'EKS',
      personEmail: 'eks@example.com', sessionEmail: 'eks@example.com',
    })).toHaveLength(0)
  })
})
