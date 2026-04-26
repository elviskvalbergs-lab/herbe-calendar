import type { NextRequest } from 'next/server'

/**
 * Returns a trusted client IP. On Vercel, x-forwarded-for is appended to by
 * the edge, so the LAST entry is trustworthy and the first is attacker-controlled.
 * Falls back to x-real-ip, then 'unknown'.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
