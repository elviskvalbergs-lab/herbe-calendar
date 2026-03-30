import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

let tableChecked = false
async function ensureTable() {
  if (tableChecked) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT NOT NULL,
      name TEXT NOT NULL,
      view TEXT NOT NULL CHECK (view IN ('day', '3day', '5day')),
      person_codes TEXT[] NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_favorites_user_email ON user_favorites(user_email)`)
  tableChecked = true
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { rows } = await pool.query(
      'SELECT id, name, view, person_codes as "personCodes" FROM user_favorites WHERE user_email = $1 ORDER BY created_at',
      [session.user.email]
    )
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { name, view, personCodes } = await req.json()
    if (!name || !view || !personCodes?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { rows } = await pool.query(
      'INSERT INTO user_favorites (user_email, name, view, person_codes) VALUES ($1, $2, $3, $4) RETURNING id',
      [session.user.email, name, view, personCodes]
    )
    return NextResponse.json({ id: rows[0].id, name, view, personCodes }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await req.json()
    await pool.query('DELETE FROM user_favorites WHERE id = $1 AND user_email = $2', [id, session.user.email])
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
