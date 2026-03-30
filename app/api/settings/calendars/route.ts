import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { validateIcsUrl } from '@/lib/ics-allowlist'

// Simple auto-migration helper
let tableCheckedAt = 0
const TABLE_CHECK_TTL = 60 * 60 * 1000 // 1 hour
async function ensureTable() {
  if (Date.now() - tableCheckedAt < TABLE_CHECK_TTL) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_calendars (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT NOT NULL,
      target_person_code TEXT NOT NULL,
      name TEXT NOT NULL,
      ics_url TEXT NOT NULL,
      color TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_calendars_user_email ON user_calendars(user_email)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_calendars_target_person_code ON user_calendars(target_person_code)`)
  // Add color column if missing (existing tables)
  await pool.query(`ALTER TABLE user_calendars ADD COLUMN IF NOT EXISTS color TEXT`)
  tableCheckedAt = Date.now()
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { rows } = await pool.query(
      'SELECT id, target_person_code as "personCode", name, ics_url as "icsUrl", color FROM user_calendars WHERE user_email = $1 ORDER BY created_at DESC',
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

    const urlCheck = validateIcsUrl(icsUrl)
    if (!urlCheck.valid) {
      return NextResponse.json({ error: urlCheck.error }, { status: 400 })
    }

    const { rows } = await pool.query(
      'INSERT INTO user_calendars (user_email, target_person_code, name, ics_url, color) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [session.user.email, personCode, name, icsUrl, null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { id, name, icsUrl, personCode, color } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    if (icsUrl !== undefined) {
      const urlCheck = validateIcsUrl(icsUrl)
      if (!urlCheck.valid) {
        return NextResponse.json({ error: urlCheck.error }, { status: 400 })
      }
    }

    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name) }
    if (icsUrl !== undefined) { sets.push(`ics_url = $${idx++}`); vals.push(icsUrl) }
    if (personCode !== undefined) { sets.push(`target_person_code = $${idx++}`); vals.push(personCode) }
    if (color !== undefined) { sets.push(`color = $${idx++}`); vals.push(color || null) }

    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    vals.push(id, session.user.email)
    await pool.query(
      `UPDATE user_calendars SET ${sets.join(', ')} WHERE id = $${idx++} AND user_email = $${idx}`,
      vals
    )
    return NextResponse.json({ success: true })
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
