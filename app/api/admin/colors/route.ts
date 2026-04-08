import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId } from '@/lib/adminAccountId'

export async function GET() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { rows } = await pool.query(
    `SELECT id, user_email, connection_id, class_group_code, color
     FROM color_overrides
     WHERE account_id = $1 AND user_email IS NULL
     ORDER BY connection_id NULLS LAST`,
    [session.accountId]
  )

  return NextResponse.json(rows)
}

export async function PUT(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { classGroupCode, color, connectionId } = await req.json()
  if (!classGroupCode || !color) {
    return NextResponse.json({ error: 'classGroupCode and color required' }, { status: 400 })
  }

  await pool.query(
    `INSERT INTO color_overrides (account_id, user_email, connection_id, class_group_code, color)
     VALUES ($1, NULL, $2, $3, $4)
     ON CONFLICT (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code)
     DO UPDATE SET color = $4, updated_at = now()`,
    [session.accountId, connectionId || null, classGroupCode, color]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { classGroupCode, connectionId } = await req.json()
  if (!classGroupCode) {
    return NextResponse.json({ error: 'classGroupCode required' }, { status: 400 })
  }

  if (connectionId) {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email IS NULL AND connection_id = $2 AND class_group_code = $3`,
      [session.accountId, connectionId, classGroupCode]
    )
  } else {
    await pool.query(
      `DELETE FROM color_overrides WHERE account_id = $1 AND user_email IS NULL AND connection_id IS NULL AND class_group_code = $2`,
      [session.accountId, classGroupCode]
    )
  }

  return NextResponse.json({ ok: true })
}
