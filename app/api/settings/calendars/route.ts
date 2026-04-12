import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireSession } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'
import { validateIcsUrl, normalizeIcsUrl } from '@/lib/ics-allowlist'

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
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureTable()
    const { rows } = await pool.query(
      'SELECT id, target_person_code as "personCode", name, ics_url as "icsUrl", color, sharing FROM user_calendars WHERE user_email = $1 AND account_id = $2 ORDER BY created_at DESC',
      [session.email, session.accountId]
    )
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
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
    await ensureTable()
    const { name, icsUrl } = await req.json()
    if (!name || !icsUrl) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Always assign to the logged-in user's own person code
    const personCode = session.userCode
    if (!personCode) {
      return NextResponse.json({ error: 'No person code found for your account' }, { status: 400 })
    }

    const urlCheck = validateIcsUrl(icsUrl)
    if (!urlCheck.valid) {
      return NextResponse.json({ error: urlCheck.error }, { status: 400 })
    }

    const { rows } = await pool.query(
      'INSERT INTO user_calendars (user_email, account_id, target_person_code, name, ics_url, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [session.email, session.accountId, personCode, name, normalizeIcsUrl(icsUrl), null]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureTable()
    const { id, name, icsUrl, color, sharing } = await req.json()
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
    if (icsUrl !== undefined) { sets.push(`ics_url = $${idx++}`); vals.push(normalizeIcsUrl(icsUrl)) }
    if (color !== undefined) { sets.push(`color = $${idx++}`); vals.push(color || null) }
    if (sharing !== undefined) { sets.push(`sharing = $${idx++}`); vals.push(sharing) }

    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    vals.push(id, session.email, session.accountId)
    await pool.query(
      `UPDATE user_calendars SET ${sets.join(', ')} WHERE id = $${idx++} AND user_email = $${idx++} AND account_id = $${idx}`,
      vals
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
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
    await pool.query('DELETE FROM user_calendars WHERE id = $1 AND user_email = $2 AND account_id = $3', [id, session.email, session.accountId])
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
