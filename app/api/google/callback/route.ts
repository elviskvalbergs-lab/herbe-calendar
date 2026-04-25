import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/herbe/auth-guard'
import { exchangeAndStoreTokens, syncCalendarList, getValidAccessTokenForUser } from '@/lib/google/userOAuth'

const OAUTH_NONCE_COOKIE = 'google_oauth_nonce'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.redirect(new URL('/cal?error=unauthorized', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    const msg = error ?? 'missing_code'
    return NextResponse.redirect(new URL(`/cal?error=${encodeURIComponent(msg)}`, req.url))
  }

  // Validate CSRF nonce
  const storedNonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value
  if (!storedNonce || state !== storedNonce) {
    return NextResponse.redirect(new URL('/cal?error=invalid_oauth_state', req.url))
  }

  try {
    const { googleEmail, tokenId } = await exchangeAndStoreTokens(
      code, session.email, session.accountId
    )

    // Fetch and store calendar list
    const accessToken = await getValidAccessTokenForUser(tokenId, session.email, session.accountId)
    if (accessToken) {
      await syncCalendarList(tokenId, accessToken)
    }

    const response = NextResponse.redirect(new URL('/cal?success=google_connected', req.url))
    response.cookies.delete(OAUTH_NONCE_COOKIE)
    return response
  } catch (e) {
    console.error('[google/callback] error:', e)
    return NextResponse.redirect(new URL('/cal?error=google_auth_failed', req.url))
  }
}
