import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await req.json()
  const { name, apiBaseUrl, companyCode, clientId, clientSecret, username, password } = body

  if (!name || !apiBaseUrl || !companyCode) {
    return NextResponse.json({ error: 'name, apiBaseUrl, and companyCode are required' }, { status: 400 })
  }

  try {
    const encSecret = clientSecret ? encrypt(clientSecret) : null
    const encPassword = password ? encrypt(password) : null

    const { rows } = await pool.query(
      `INSERT INTO account_erp_connections (account_id, name, api_base_url, company_code, client_id, client_secret, username, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, api_base_url, company_code, client_id, username, active, created_at`,
      [session.accountId, name, apiBaseUrl, companyCode, clientId || '', encSecret, username || null, encPassword]
    )

    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    console.error('[admin/erp-connections POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await req.json()
  const { id, name, apiBaseUrl, companyCode, clientId, clientSecret, username, password, active } = body

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
    session = await requireAdminSession()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await pool.query(
    'DELETE FROM account_erp_connections WHERE id = $1 AND account_id = $2',
    [id, session.accountId]
  )

  return NextResponse.json({ ok: true })
}
