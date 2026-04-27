jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/adminAccountId', () => ({ getAdminAccountId: jest.fn() }))

import { resolveTimezoneFromRows } from '@/lib/accountTimezone'

describe('resolveTimezoneFromRows', () => {
  it('uses member.timezone when present', () => {
    expect(resolveTimezoneFromRows({
      member: { timezone: 'Asia/Tokyo' },
      account: { default_timezone: 'Europe/Riga' },
    })).toBe('Asia/Tokyo')
  })
  it('falls back to account default', () => {
    expect(resolveTimezoneFromRows({
      member: { timezone: null },
      account: { default_timezone: 'Europe/London' },
    })).toBe('Europe/London')
  })
  it('falls back to Europe/Riga when both missing', () => {
    expect(resolveTimezoneFromRows({
      member: null,
      account: null,
    })).toBe('Europe/Riga')
  })
  it('falls back to Europe/Riga when account default is invalid', () => {
    expect(resolveTimezoneFromRows({
      member: null,
      account: { default_timezone: 'lol/notazone' },
    })).toBe('Europe/Riga')
  })
})
