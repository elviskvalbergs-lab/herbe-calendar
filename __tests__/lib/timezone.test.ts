import {
  isValidTimezone,
  formatInTz,
  toIsoInTz,
  bucketDateInTz,
  resolveMemberTimezone,
  resolveSourceTimezone,
} from '@/lib/timezone'

describe('isValidTimezone', () => {
  it('accepts IANA names', () => {
    expect(isValidTimezone('Europe/Riga')).toBe(true)
    expect(isValidTimezone('Asia/Tokyo')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })
  it('rejects garbage', () => {
    expect(isValidTimezone('Not/A/Real/Zone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone('+03:00')).toBe(false)
  })
  it('rejects non-canonical case', () => {
    expect(isValidTimezone('europe/riga')).toBe(false)
    expect(isValidTimezone('EUROPE/RIGA')).toBe(false)
  })
})

describe('formatInTz', () => {
  it('renders a UTC instant in target TZ', () => {
    // 2026-04-27T10:00:00Z is 13:00 in Riga (DST), 19:00 in Tokyo
    const d = new Date('2026-04-27T10:00:00Z')
    expect(formatInTz(d, 'Europe/Riga', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('13:00')
    expect(formatInTz(d, 'Asia/Tokyo', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('19:00')
  })
})

describe('toIsoInTz', () => {
  it('produces an ISO string with the TZ offset preserved', () => {
    expect(toIsoInTz('2026-04-27', '09:00', 'Europe/Riga')).toBe('2026-04-27T09:00:00+03:00')
    expect(toIsoInTz('2026-04-27', '09:00', 'Asia/Tokyo')).toBe('2026-04-27T09:00:00+09:00')
    expect(toIsoInTz('2026-04-27', '09:00', 'UTC')).toBe('2026-04-27T09:00:00+00:00')
  })
  it('handles half-hour and quarter-hour offsets', () => {
    expect(toIsoInTz('2026-04-27', '09:00', 'Asia/Kolkata')).toBe('2026-04-27T09:00:00+05:30')
    expect(toIsoInTz('2026-04-27', '09:00', 'Pacific/Chatham')).toBe('2026-04-27T09:00:00+12:45')
  })
  it('handles negative offsets in winter (no DST)', () => {
    expect(toIsoInTz('2026-01-01', '12:00', 'America/Los_Angeles')).toBe('2026-01-01T12:00:00-08:00')
  })
})

describe('bucketDateInTz', () => {
  it('returns YYYY-MM-DD for the given TZ', () => {
    // 2026-04-27T22:30:00Z is 01:30 next day in Riga (DST UTC+3) and 18:30 same day in NY
    const d = new Date('2026-04-27T22:30:00Z')
    expect(bucketDateInTz(d, 'Europe/Riga')).toBe('2026-04-28')
    expect(bucketDateInTz(d, 'America/New_York')).toBe('2026-04-27')
  })
})

describe('resolveMemberTimezone', () => {
  it('prefers member.timezone over account.default_timezone', () => {
    expect(resolveMemberTimezone({ memberTz: 'Asia/Tokyo', accountTz: 'Europe/Riga' })).toBe('Asia/Tokyo')
  })
  it('falls back to account default when member is null', () => {
    expect(resolveMemberTimezone({ memberTz: null, accountTz: 'Europe/Riga' })).toBe('Europe/Riga')
  })
  it('falls back to Europe/Riga when both are null/garbage', () => {
    expect(resolveMemberTimezone({ memberTz: null, accountTz: null as unknown as string })).toBe('Europe/Riga')
    expect(resolveMemberTimezone({ memberTz: 'Bogus/Zone', accountTz: 'Europe/Riga' })).toBe('Europe/Riga')
  })
})

describe('resolveSourceTimezone', () => {
  it('prefers source TZ over account default', () => {
    expect(resolveSourceTimezone({ sourceTz: 'Asia/Tokyo', accountTz: 'Europe/Riga' })).toBe('Asia/Tokyo')
  })
  it('falls back to account default when source is null', () => {
    expect(resolveSourceTimezone({ sourceTz: null, accountTz: 'Europe/London' })).toBe('Europe/London')
  })
  it('falls back to Europe/Riga when both are null/garbage', () => {
    expect(resolveSourceTimezone({ sourceTz: null, accountTz: null as unknown as string })).toBe('Europe/Riga')
  })
})
