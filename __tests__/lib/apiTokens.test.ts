import { generateToken } from '@/lib/apiTokens'

describe('generateToken', () => {
  it('returns a raw token starting with hcal_ and a hex hash', () => {
    const { raw, hash } = generateToken()
    expect(raw).toMatch(/^hcal_[0-9a-f]{64}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens each call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.raw).not.toBe(b.raw)
    expect(a.hash).not.toBe(b.hash)
  })
})
