import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    // Fetch user overrides + admin defaults for this account
    const { rows } = await pool.query(
      `SELECT id, user_email, connection_id, class_group_code, color
       FROM color_overrides
       WHERE account_id = $1 AND (user_email = $2 OR user_email IS NULL)
       ORDER BY user_email NULLS LAST, connection_id NULLS LAST`,
      [session.accountId, session.email]
    )

    return NextResponse.json(rows)
  } catch (e) {
    console.error('[settings/colors] GET failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const { classGroupCode, color, connectionId } = await req.json()
    if (!classGroupCode || !color) {
      return NextResponse.json({ error: 'classGroupCode and color required' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO color_overrides (account_id, user_email, connection_id, class_group_code, color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code)
       DO UPDATE SET color = $5, updated_at = now()`,
      [session.accountId, session.email, connectionId || null, classGroupCode, color]
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[settings/colors] PUT failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const { classGroupCode, connectionId } = await req.json()
    if (!classGroupCode) {
      return NextResponse.json({ error: 'classGroupCode required' }, { status: 400 })
    }

    if (connectionId) {
      await pool.query(
        `DELETE FROM color_overrides WHERE account_id = $1 AND user_email = $2 AND connection_id = $3 AND class_group_code = $4`,
        [session.accountId, session.email, connectionId, classGroupCode]
      )
    } else {
      await pool.query(
        `DELETE FROM color_overrides WHERE account_id = $1 AND user_email = $2 AND connection_id IS NULL AND class_group_code = $3`,
        [session.accountId, session.email, classGroupCode]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[settings/colors] DELETE failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
