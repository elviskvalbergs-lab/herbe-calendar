import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/herbe/config'

const TOKEN_URL = 'https://standard-id.hansaworld.com/oauth-token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    const msg = error ?? 'missing_code'
    return NextResponse.redirect(new URL(`/setup?error=${encodeURIComponent(msg)}`, req.url))
  }

  const clientId = process.env.HERBE_CLIENT_ID
  const clientSecret = process.env.HERBE_CLIENT_SECRET
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/herbe/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/setup?error=missing_client_credentials', req.url))
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[herbe/callback] token exchange failed:', res.status, text.substring(0, 200))
      return NextResponse.redirect(new URL(`/setup?error=token_exchange_failed`, req.url))
    }

    const data = await res.json()
    if (!data.access_token) {
      return NextResponse.redirect(new URL('/setup?error=no_access_token', req.url))
    }

    await saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    })

    return NextResponse.redirect(new URL('/setup?success=1', req.url))
  } catch (e) {
    console.error('[herbe/callback] error:', e)
    return NextResponse.redirect(new URL('/setup?error=unexpected', req.url))
  }
}
