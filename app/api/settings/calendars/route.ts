import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'

// Simple auto-migration helper
let tableChecked = false
async function ensureTable() {
  if (tableChecked) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_calendars (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT NOT NULL,
      target_person_code TEXT NOT NULL,
      name TEXT NOT NULL,
      ics_url TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_calendars_user_email ON user_calendars(user_email)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_calendars_target_person_code ON user_calendars(target_person_code)`)
  tableChecked = true
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { rows } = await pool.query(
      'SELECT id, target_person_code as "personCode", name, ics_url as "icsUrl" FROM user_calendars WHERE user_email = $1 ORDER BY created_at DESC',
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
    const { personCode, name, icsUrl } = await req.json()
    if (!personCode || !name || !icsUrl) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { rows } = await pool.query(
      'INSERT INTO user_calendars (user_email, target_person_code, name, ics_url) VALUES ($1, $2, $3, $4) RETURNING id',
      [session.user.email, personCode, name, icsUrl]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await req.json()
    await pool.query('DELETE FROM user_calendars WHERE id = $1 AND user_email = $2', [id, session.user.email])
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
