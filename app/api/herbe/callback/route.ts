import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { requireAdminSession } from '@/lib/adminAuth'

const TOKEN_URL = 'https://standard-id.hansaworld.com/oauth-token'
const OAUTH_NONCE_COOKIE = 'herbe_oauth_nonce'

export async function GET(req: NextRequest) {
  // SEC-9: Require authenticated admin session
  try {
    await requireAdminSession()
  } catch {
    return NextResponse.redirect(new URL('/admin/config?error=unauthorized', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error || !code) {
    const msg = error ?? 'missing_code'
    return NextResponse.redirect(new URL(`/admin/config?error=${encodeURIComponent(msg)}`, req.url))
  }

  // SEC-1: Validate CSRF nonce from state parameter
  const storedNonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value
  if (!storedNonce || !state) {
    return NextResponse.redirect(new URL('/admin/config?error=invalid_oauth_state', req.url))
  }

  // State format: "nonce:connectionId" or just "nonce" for legacy flow
  const separatorIdx = state.indexOf(':')
  const stateNonce = separatorIdx >= 0 ? state.slice(0, separatorIdx) : state
  const connectionId = separatorIdx >= 0 ? state.slice(separatorIdx + 1) : null

  if (stateNonce !== storedNonce) {
    return NextResponse.redirect(new URL('/admin/config?error=invalid_oauth_state', req.url))
  }

  // Per-connection flow only — legacy global flow removed
  if (!connectionId || connectionId.length <= 10) {
    return NextResponse.redirect(new URL('/admin/config?error=missing_connection_id', req.url))
  }

  return handlePerConnectionOAuth(req, code, connectionId)
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

    const response = NextResponse.redirect(new URL('/admin/config?success=herbe_connected', req.url))
    response.cookies.delete(OAUTH_NONCE_COOKIE)
    return response
  } catch (e) {
    console.error('[herbe/callback] per-connection error:', e)
    return NextResponse.redirect(new URL('/admin/config?error=unexpected', req.url))
  }
}
