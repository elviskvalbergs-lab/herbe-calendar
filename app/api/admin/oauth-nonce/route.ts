import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { randomUUID } from 'crypto'

const OAUTH_NONCE_COOKIE = 'herbe_oauth_nonce'

/** Generate a CSRF nonce for OAuth flows and set it as an httpOnly cookie. */
export async function POST() {
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const nonce = randomUUID()
  const res = NextResponse.json({ nonce })
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  })
  return res
}
