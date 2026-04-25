import { makeKey, parseDestinationKey } from '@/lib/destinations/keys'
import type { Destination } from '@/lib/destinations/types'

function d(partial: Partial<Destination>): Destination {
  return {
    key: '',
    source: 'herbe',
    label: 'Burti',
    sourceLabel: 'ERP',
    color: '#00AEE7',
    meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
    ...partial,
  } as Destination
}

describe('makeKey', () => {
  it('encodes an ERP destination as herbe:<connectionId>', () => {
    const dest = d({ meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' } })
    expect(makeKey(dest)).toBe('herbe:conn-1')
  })

  it('encodes an Outlook task destination as outlook:<listId>', () => {
    const dest = d({ source: 'outlook', meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' } })
    expect(makeKey(dest)).toBe('outlook:LIST-A')
  })

  it('encodes an Outlook event destination as plain "outlook"', () => {
    const dest = d({ source: 'outlook', meta: { kind: 'outlook-event' } })
    expect(makeKey(dest)).toBe('outlook')
  })

  it('encodes a Google task destination as google:<tokenId>:<listId>', () => {
    const dest = d({
      source: 'google',
      meta: { kind: 'google-task', tokenId: 'TOK-1', listId: 'LIST-9', listName: 'Work' },
    })
    expect(makeKey(dest)).toBe('google:TOK-1:LIST-9')
  })

  it('encodes a Google event destination as google:<tokenId>:<calendarId>', () => {
    const dest = d({
      source: 'google',
      meta: { kind: 'google-event', tokenId: 'TOK-1', calendarId: 'primary', calendarName: 'Primary' },
    })
    expect(makeKey(dest)).toBe('google:TOK-1:primary')
  })
})

describe('parseDestinationKey', () => {
  it('parses an ERP key', () => {
    expect(parseDestinationKey('herbe:conn-1')).toEqual({ source: 'herbe', parts: ['conn-1'] })
  })

  it('parses an Outlook task key', () => {
    expect(parseDestinationKey('outlook:LIST-A')).toEqual({ source: 'outlook', parts: ['LIST-A'] })
  })

  it('parses a bare "outlook" key as event destination', () => {
    expect(parseDestinationKey('outlook')).toEqual({ source: 'outlook', parts: [] })
  })

  it('parses a Google key into two parts', () => {
    expect(parseDestinationKey('google:TOK-1:LIST-9')).toEqual({ source: 'google', parts: ['TOK-1', 'LIST-9'] })
  })

  it('returns null for a malformed key', () => {
    expect(parseDestinationKey('')).toBeNull()
    expect(parseDestinationKey('bogus:x')).toBeNull()
    expect(parseDestinationKey('herbe')).toBeNull()      // ERP needs connection id
    expect(parseDestinationKey('google:only-one-part')).toBeNull()
  })
})
