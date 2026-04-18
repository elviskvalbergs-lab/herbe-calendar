import { createHmac, timingSafeEqual } from 'crypto'

const HMAC_ALGO = 'sha256'

function getKey(): string {
  const key = (process.env.CONFIG_ENCRYPTION_KEY ?? '').trim()
  if (!key) throw new Error('CONFIG_ENCRYPTION_KEY required for cookie signing')
  return key
}

/** Sign a cookie value: returns "hmac.value" */
export function signCookieValue(value: string): string {
  const hmac = createHmac(HMAC_ALGO, getKey()).update(value).digest('hex')
  return `${hmac}.${value}`
}

/** Verify and extract a signed cookie value. Returns the original value or null if invalid. */
export function verifyCookieValue(signed: string): string | null {
  const dotIdx = signed.indexOf('.')
  if (dotIdx < 0) return null
  const hmac = signed.slice(0, dotIdx)
  const value = signed.slice(dotIdx + 1)
  const expected = createHmac(HMAC_ALGO, getKey()).update(value).digest('hex')
  const hmacBuf = Buffer.from(hmac, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (hmacBuf.length !== expectedBuf.length) return null
  const valid = timingSafeEqual(hmacBuf, expectedBuf)
  return valid ? value : null
}
