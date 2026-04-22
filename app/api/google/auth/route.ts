import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getOAuthAppClient } from '@/lib/google/client'
import { revokeGoogleAccount } from '@/lib/google/userOAuth'
import { randomUUID } from 'crypto'

const OAUTH_NONCE_COOKIE = 'google_oauth_nonce'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/tasks',
]

/** GET: Redirect to Google consent screen */
export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const nonce = randomUUID()
  const client = getOAuthAppClient()
  const authorizeUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: nonce,
  })

  const response = NextResponse.redirect(authorizeUrl, { status: 302 })
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    path: '/',
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  })
  return response
}

/** DELETE: Disconnect a Google account */
export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { googleEmail } = await req.json()
  if (!googleEmail || typeof googleEmail !== 'string') {
    return NextResponse.json({ error: 'googleEmail required' }, { status: 400 })
  }

  await revokeGoogleAccount(session.email, session.accountId, googleEmail)
  return NextResponse.json({ ok: true })
}
