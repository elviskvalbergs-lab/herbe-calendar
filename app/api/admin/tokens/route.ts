import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId } from '@/lib/adminAccountId'
import { generateToken } from '@/lib/apiTokens'

export async function GET() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rows } = await pool.query(
    `SELECT id, name, scope, created_by, created_at, last_used, expires_at, revoked_at
     FROM api_tokens WHERE account_id = $1
     ORDER BY created_at DESC`,
    [session.accountId]
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, scope, expiresAt } = await req.json()
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const tokenScope = scope === 'super' && session.isSuperAdmin ? 'super' : 'account'
  const { raw, hash } = generateToken()

  const { rows } = await pool.query(
    `INSERT INTO api_tokens (account_id, token_hash, name, scope, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [session.accountId, hash, name.trim(), tokenScope, session.email, expiresAt || null]
  )

  return NextResponse.json({ id: rows[0].id, token: raw }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  await pool.query(
    `UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL`,
    [id, session.accountId]
  )

  return NextResponse.json({ ok: true })
}
