import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireSession } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.name, f.view, f.person_codes as "personCodes", f.hidden_calendars as "hiddenCalendars",
        (SELECT COUNT(*)::int FROM favorite_share_links sl WHERE sl.favorite_id = f.id) AS "linkCount"
       FROM user_favorites f WHERE f.user_email = $1 AND f.account_id = $2 ORDER BY f.created_at`,
      [session.email, session.accountId]
    )
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[settings/favorites] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { name, view, personCodes, hiddenCalendars = [] } = await req.json()
    if (!name || !view || !personCodes?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { rows } = await pool.query(
      'INSERT INTO user_favorites (user_email, account_id, name, view, person_codes, hidden_calendars) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [session.email, session.accountId, name, view, personCodes, hiddenCalendars]
    )
    return NextResponse.json({ id: rows[0].id, name, view, personCodes, hiddenCalendars }, { status: 201 })
  } catch (e) {
    console.error('[settings/favorites] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await req.json()
    await pool.query('DELETE FROM user_favorites WHERE id = $1 AND user_email = $2 AND account_id = $3', [id, session.email, session.accountId])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[settings/favorites] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
