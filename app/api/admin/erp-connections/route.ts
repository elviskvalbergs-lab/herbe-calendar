import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { herbeFetchAll } from '@/lib/herbe/client'
import type { ErpConnection } from '@/lib/accountConfig'
import { getAccountIdFromCookie } from '@/lib/adminAccountId'

/** Test an ERP connection by fetching from UserVc */
async function testErpConnection(conn: ErpConnection): Promise<{ ok: boolean; userCount?: number; error?: string }> {
  try {
    const users = await herbeFetchAll('UserVc', {}, 5, conn)
    return { ok: true, userCount: users.length }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Test existing connection
  if (body.action === 'test' && body.id) {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM account_erp_connections WHERE id = $1 AND account_id = $2',
        [body.id, session.accountId]
      )
      if (rows.length === 0) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      const r = rows[0]
      const conn: ErpConnection = {
        id: r.id, name: r.name, apiBaseUrl: r.api_base_url, companyCode: r.company_code,
        clientId: r.client_id, clientSecret: r.client_secret ? decrypt(r.client_secret) : '',
        accessToken: r.access_token ? decrypt(r.access_token) : null,
        refreshToken: r.refresh_token ? decrypt(r.refresh_token) : null,
        tokenExpiresAt: Number(r.token_expires_at) || 0,
        username: r.username || null, password: r.password ? decrypt(r.password) : null, active: r.active,
      }
      const result = await testErpConnection(conn)
      return NextResponse.json(result)
    } catch (e) {
      console.error('[admin/erp-connections] operation failed:', e)
      return NextResponse.json({ ok: false, error: 'Internal server error' })
    }
  }

  // Create new connection
  const { name, apiBaseUrl, companyCode, clientId, clientSecret, username, password, serpUuid } = body

  if (!name || !apiBaseUrl || !companyCode) {
    return NextResponse.json({ error: 'name, apiBaseUrl, and companyCode are required' }, { status: 400 })
  }

  try {
    const encSecret = clientSecret ? encrypt(clientSecret) : null
    const encPassword = password ? encrypt(password) : null

    const { rows } = await pool.query(
      `INSERT INTO account_erp_connections (account_id, name, api_base_url, company_code, client_id, client_secret, username, password, serp_uuid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, api_base_url, company_code, client_id, username, active, created_at, serp_uuid`,
      [session.accountId, name, apiBaseUrl, companyCode, clientId || '', encSecret, username || null, encPassword, serpUuid || null]
    )

    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    console.error('[admin/erp-connections] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, name, apiBaseUrl, companyCode, clientId, clientSecret, username, password, active, serpUuid } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name) }
  if (apiBaseUrl !== undefined) { updates.push(`api_base_url = $${idx++}`); params.push(apiBaseUrl) }
  if (companyCode !== undefined) { updates.push(`company_code = $${idx++}`); params.push(companyCode) }
  if (clientId !== undefined) { updates.push(`client_id = $${idx++}`); params.push(clientId) }
  if (clientSecret) { updates.push(`client_secret = $${idx++}`); params.push(encrypt(clientSecret)) }
  if (username !== undefined) { updates.push(`username = $${idx++}`); params.push(username || null) }
  if (password) { updates.push(`password = $${idx++}`); params.push(encrypt(password)) }
  if (typeof active === 'boolean') { updates.push(`active = $${idx++}`); params.push(active) }
  if (serpUuid !== undefined) { updates.push(`serp_uuid = $${idx++}`); params.push(serpUuid || null) }

  if (updates.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  updates.push(`updated_at = now()`)
  params.push(id, session.accountId)
  await pool.query(
    `UPDATE account_erp_connections SET ${updates.join(', ')} WHERE id = $${idx++} AND account_id = $${idx}`,
    params
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await pool.query(
    'DELETE FROM account_erp_connections WHERE id = $1 AND account_id = $2',
    [id, session.accountId]
  )

  return NextResponse.json({ ok: true })
}
