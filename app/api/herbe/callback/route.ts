import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/herbe/config'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

const TOKEN_URL = 'https://standard-id.hansaworld.com/oauth-token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') // ERP connection ID

  if (error || !code) {
    const msg = error ?? 'missing_code'
    return NextResponse.redirect(new URL(`/admin/config?error=${encodeURIComponent(msg)}`, req.url))
  }

  // If state contains a connection ID, use per-connection flow
  if (state && state.length > 10) {
    return handlePerConnectionOAuth(req, code, state)
  }

  // Legacy flow: use env vars
  const clientId = process.env.HERBE_CLIENT_ID
  const clientSecret = process.env.HERBE_CLIENT_SECRET
  const redirectUri = `${new URL(req.url).origin}/api/herbe/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/admin/config?error=missing_client_credentials', req.url))
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
      return NextResponse.redirect(new URL('/admin/config?error=token_exchange_failed', req.url))
    }

    const data = await res.json()
    if (!data.access_token) {
      return NextResponse.redirect(new URL('/admin/config?error=no_access_token', req.url))
    }

    await saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    })

    return NextResponse.redirect(new URL('/admin/config?success=herbe_connected', req.url))
  } catch (e) {
    console.error('[herbe/callback] error:', e)
    return NextResponse.redirect(new URL('/admin/config?error=unexpected', req.url))
  }
}

async function handlePerConnectionOAuth(req: NextRequest, code: string, connectionId: string) {
  const redirectUri = `${new URL(req.url).origin}/api/herbe/callback`

  try {
    // Look up the connection to get client_id and client_secret
    const { rows } = await pool.query(
      'SELECT id, client_id, client_secret FROM account_erp_connections WHERE id = $1',
      [connectionId]
    )
    if (rows.length === 0) {
      return NextResponse.redirect(new URL('/admin/config?error=connection_not_found', req.url))
    }

    const conn = rows[0]
    let clientSecret = ''
    if (conn.client_secret) {
      try {
        const { decrypt } = await import('@/lib/crypto')
        clientSecret = decrypt(conn.client_secret)
      } catch {
        return NextResponse.redirect(new URL('/admin/config?error=decrypt_failed', req.url))
      }
    }

    if (!conn.client_id || !clientSecret) {
      return NextResponse.redirect(new URL('/admin/config?error=missing_client_credentials', req.url))
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: conn.client_id,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[herbe/callback] per-connection token exchange failed:', res.status, text.substring(0, 200))
      return NextResponse.redirect(new URL('/admin/config?error=token_exchange_failed', req.url))
    }

    const data = await res.json()
    if (!data.access_token) {
      return NextResponse.redirect(new URL('/admin/config?error=no_access_token', req.url))
    }

    // Store tokens in the connection record
    const encAccess = encrypt(data.access_token)
    const encRefresh = data.refresh_token ? encrypt(data.refresh_token) : null
    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000

    await pool.query(
      `UPDATE account_erp_connections
       SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [encAccess, encRefresh, expiresAt, connectionId]
    )

    return NextResponse.redirect(new URL('/admin/config?success=herbe_connected', req.url))
  } catch (e) {
    console.error('[herbe/callback] per-connection error:', e)
    return NextResponse.redirect(new URL('/admin/config?error=unexpected', req.url))
  }
}
