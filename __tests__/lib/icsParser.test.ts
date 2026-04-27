import { clearIcsCache } from '@/lib/icsParser'

// We can test clearIcsCache and the module-level cache behavior
describe('icsParser', () => {
  describe('clearIcsCache', () => {
    it('does not throw when called', () => {
      expect(() => clearIcsCache()).not.toThrow()
    })

    it('can be called multiple times', () => {
      clearIcsCache()
      clearIcsCache()
    })
  })
})

import { fetchIcsEvents } from '@/lib/icsParser'

describe('fetchIcsEvents — timezone param', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test1
DTSTART:20260427T220000Z
DTEND:20260427T230000Z
SUMMARY:Late event
END:VEVENT
END:VCALENDAR`

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => ics,
    } as unknown as Response)) as unknown as typeof fetch
  })

  it('formats event times in Europe/Riga by default (backward compat)', async () => {
    const { events, error } = await fetchIcsEvents('http://x/cal.ics', 'P1', '2026-04-27', '2026-04-29', true)
    expect(error).toBeUndefined()
    expect(events).toHaveLength(1)
    expect(events[0].date).toBe('2026-04-28')   // 22:00Z + 3h = 01:00 next day in Riga
    expect(events[0].timeFrom).toBe('01:00')
    expect(events[0].timeTo).toBe('02:00')
  })

  it('formats event times in the supplied timezone (Asia/Tokyo)', async () => {
    const { events, error } = await fetchIcsEvents('http://x/cal.ics', 'P1', '2026-04-27', '2026-04-29', true, 'Asia/Tokyo')
    expect(error).toBeUndefined()
    expect(events).toHaveLength(1)
    expect(events[0].date).toBe('2026-04-28')   // 22:00Z + 9h = 07:00 next day in Tokyo
    expect(events[0].timeFrom).toBe('07:00')
    expect(events[0].timeTo).toBe('08:00')
  })

  it('falls back to Europe/Riga when given an invalid TZ', async () => {
    const { events, error } = await fetchIcsEvents('http://x/cal.ics', 'P1', '2026-04-27', '2026-04-29', true, 'Bogus/Zone')
    expect(error).toBeUndefined()
    expect(events[0].timeFrom).toBe('01:00')
  })
})
