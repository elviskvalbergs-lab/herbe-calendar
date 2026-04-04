import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const NONCE_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const hex = (process.env.CONFIG_ENCRYPTION_KEY ?? '').trim()
  if (!hex || hex.length !== 64) {
    throw new Error(`CONFIG_ENCRYPTION_KEY must be a 64-char hex string (32 bytes), got ${hex.length} chars. Generate with: openssl rand -hex 32`)
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt a string. Returns Buffer: nonce (12) + ciphertext + authTag (16) */
export function encrypt(plaintext: string): Buffer {
  const key = getKey()
  const nonce = randomBytes(NONCE_LEN)
  const cipher = createCipheriv(ALGO, key, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([nonce, encrypted, tag])
}

/** Decrypt a Buffer produced by encrypt(). Returns the plaintext string. */
export function decrypt(data: Buffer): string {
  const key = getKey()
  const nonce = data.subarray(0, NONCE_LEN)
  const tag = data.subarray(data.length - TAG_LEN)
  const ciphertext = data.subarray(NONCE_LEN, data.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
