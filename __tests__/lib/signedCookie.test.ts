import { signCookieValue, verifyCookieValue } from '@/lib/signedCookie'

beforeAll(() => {
  process.env.CONFIG_ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('signedCookie', () => {
  it('round-trips a signed value', () => {
    const signed = signCookieValue('hello')
    expect(verifyCookieValue(signed)).toBe('hello')
  })

  it('returns null for tampered value', () => {
    const signed = signCookieValue('hello')
    const tampered = signed.replace('hello', 'world')
    expect(verifyCookieValue(tampered)).toBeNull()
  })

  it('returns null for missing dot separator', () => {
    expect(verifyCookieValue('nodothere')).toBeNull()
  })

  it('returns null for malformed hex HMAC (non-hex chars)', () => {
    // This previously would throw a RangeError in timingSafeEqual
    // because Buffer.from('zz...', 'hex') silently produces shorter output
    const badHex = 'zz'.repeat(32) + '.somevalue'
    expect(verifyCookieValue(badHex)).toBeNull()
  })

  it('returns null for truncated HMAC', () => {
    const signed = signCookieValue('test')
    const truncated = signed.slice(0, 10) + signed.slice(32)
    expect(verifyCookieValue(truncated)).toBeNull()
  })
})
