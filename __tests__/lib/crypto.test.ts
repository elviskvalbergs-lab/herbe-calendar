import { encrypt, decrypt } from '@/lib/crypto'

// A valid 64-char hex key (32 bytes)
const TEST_KEY = 'a'.repeat(64)

describe('crypto', () => {
  beforeAll(() => {
    process.env.CONFIG_ENCRYPTION_KEY = TEST_KEY
  })

  afterAll(() => {
    delete process.env.CONFIG_ENCRYPTION_KEY
  })

  describe('encrypt / decrypt round-trip', () => {
    it('recovers the original plaintext', () => {
      const plaintext = 'hello world — secret 🔑'
      const encrypted = encrypt(plaintext)
      expect(decrypt(encrypted)).toBe(plaintext)
    })

    it('produces different ciphertext each time (random nonce)', () => {
      const plaintext = 'deterministic?'
      const a = encrypt(plaintext)
      const b = encrypt(plaintext)
      expect(a.equals(b)).toBe(false)
    })
  })

  describe('getKey() validation', () => {
    it('throws when CONFIG_ENCRYPTION_KEY is missing', () => {
      const saved = process.env.CONFIG_ENCRYPTION_KEY
      delete process.env.CONFIG_ENCRYPTION_KEY
      expect(() => encrypt('x')).toThrow('CONFIG_ENCRYPTION_KEY must be a 64-char hex string')
      process.env.CONFIG_ENCRYPTION_KEY = saved
    })

    it('throws when key is shorter than 64 hex chars', () => {
      const saved = process.env.CONFIG_ENCRYPTION_KEY
      process.env.CONFIG_ENCRYPTION_KEY = 'abcd1234'
      expect(() => encrypt('x')).toThrow('CONFIG_ENCRYPTION_KEY must be a 64-char hex string')
      process.env.CONFIG_ENCRYPTION_KEY = saved
    })
  })

  describe('tamper detection', () => {
    it('rejects ciphertext with a tampered byte', () => {
      const encrypted = encrypt('sensitive data')
      // Flip a byte in the middle of the ciphertext (past the 12-byte nonce)
      const idx = 14
      encrypted[idx] = encrypted[idx] ^ 0xff
      expect(() => decrypt(encrypted)).toThrow()
    })

    it('rejects truncated ciphertext', () => {
      const encrypted = encrypt('sensitive data')
      const truncated = encrypted.subarray(0, 10)
      expect(() => decrypt(truncated)).toThrow()
    })
  })
})
