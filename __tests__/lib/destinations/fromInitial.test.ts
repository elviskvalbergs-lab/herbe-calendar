import { destinationFromInitial } from '@/lib/destinations/fromInitial'

const CONNS = [
  { id: 'conn-1', name: 'Burti' },
  { id: 'conn-2', name: 'Flex BI' },
]

describe('destinationFromInitial', () => {
  it('returns null when initial is undefined or has no source', () => {
    expect(destinationFromInitial(undefined, 'event', CONNS)).toBeNull()
    expect(destinationFromInitial({}, 'event', CONNS)).toBeNull()
  })

  it('builds an ERP destination from erpConnectionId (event)', () => {
    const d = destinationFromInitial(
      { source: 'herbe', erpConnectionId: 'conn-2', erpConnectionName: 'Flex BI' },
      'event',
      CONNS,
    )
    expect(d?.source).toBe('herbe')
    expect(d?.key).toBe('herbe:conn-2')
    expect(d?.meta.kind).toBe('herbe')
    if (d?.meta.kind === 'herbe') expect(d.meta.connectionId).toBe('conn-2')
  })

  it('falls back to the first ERP connection when erpConnectionId is missing', () => {
    const d = destinationFromInitial({ source: 'herbe' }, 'event', CONNS)
    expect(d?.key).toBe('herbe:conn-1')
  })

  it('returns null for ERP when no connections are configured', () => {
    const d = destinationFromInitial({ source: 'herbe' }, 'event', [])
    expect(d).toBeNull()
  })

  it('builds an Outlook event destination (single "outlook" key)', () => {
    const d = destinationFromInitial({ source: 'outlook' }, 'event', CONNS)
    expect(d?.key).toBe('outlook')
    expect(d?.meta.kind).toBe('outlook-event')
  })

  it('builds an Outlook task destination using listName if present', () => {
    const d = destinationFromInitial({ source: 'outlook', listName: 'Shopping' }, 'task', CONNS)
    expect(d?.source).toBe('outlook')
    expect(d?.meta.kind).toBe('outlook-task')
    expect(d?.label).toBe('Shopping')
  })

  it('builds a Google event destination from googleTokenId + googleCalendarId', () => {
    const d = destinationFromInitial({
      source: 'google',
      googleTokenId: 'TOK-1',
      googleCalendarId: 'cal-abc',
      googleCalendarName: 'Team',
    }, 'event', CONNS)
    expect(d?.source).toBe('google')
    expect(d?.key).toBe('google:TOK-1:cal-abc')
    if (d?.meta.kind === 'google-event') expect(d.meta.calendarName).toBe('Team')
  })

  it('builds a Google task destination with the task sub-kind', () => {
    const d = destinationFromInitial({
      source: 'google',
      googleTokenId: 'TOK-1',
      listName: 'Work',
    }, 'task', CONNS)
    expect(d?.meta.kind).toBe('google-task')
    expect(d?.label).toBe('Work')
  })
})
