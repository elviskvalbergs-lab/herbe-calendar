/**
 * Simple in-memory rate limiter keyed by string (e.g. share token + IP).
 * NOTE: This state is per-process and not shared across Vercel function instances.
 * For stronger guarantees, replace with an external store (e.g. Upstash Redis).
 */
const attempts = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

/** Returns true if the request should be blocked. */
export function isRateLimited(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > MAX_ATTEMPTS) {
    return true
  }
  return false
}

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key)
  }
}, 5 * 60 * 1000).unref()
