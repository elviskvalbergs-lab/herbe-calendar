import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import crypto from 'crypto'

let tableCheckedAt = 0
const TABLE_CHECK_TTL = 60 * 60 * 1000 // 1 hour

async function ensureTable() {
  if (Date.now() - tableCheckedAt < TABLE_CHECK_TTL) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorite_share_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      favorite_id UUID NOT NULL REFERENCES user_favorites(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT,
      visibility TEXT NOT NULL CHECK (visibility IN ('busy', 'titles', 'full')),
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at TIMESTAMP WITH TIME ZONE,
      access_count INTEGER NOT NULL DEFAULT 0
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_favorite_share_links_favorite_id ON favorite_share_links(favorite_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_favorite_share_links_token ON favorite_share_links(token)`)
  tableCheckedAt = Date.now()
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    favoriteId: row.favorite_id,
    token: row.token,
    name: row.name,
    visibility: row.visibility,
    hasPassword: row.password_hash !== null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at ?? null,
    accessCount: row.access_count,
    bookingEnabled: row.booking_enabled ?? false,
    templateIds: row.template_ids ?? [],
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { searchParams } = new URL(req.url)
    const favoriteId = searchParams.get('favoriteId')
    if (!favoriteId) return NextResponse.json({ error: 'Missing favoriteId' }, { status: 400 })

    // Verify favorite belongs to current user
    const { rows: favRows } = await pool.query(
      'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
      [favoriteId, session.user.email]
    )
    if (!favRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { rows } = await pool.query(
      `SELECT sl.*,
        COALESCE((SELECT json_agg(slt.template_id) FROM share_link_templates slt WHERE slt.share_link_id = sl.id), '[]') AS template_ids
       FROM favorite_share_links sl WHERE sl.favorite_id = $1 ORDER BY sl.created_at DESC`,
      [favoriteId]
    )
    return NextResponse.json(rows.map(mapRow))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { favoriteId, name, visibility, expiresAt, password } = await req.json()

    if (!favoriteId || !name || !visibility) {
      return NextResponse.json({ error: 'Missing required fields: favoriteId, name, visibility' }, { status: 400 })
    }

    // Verify favorite belongs to current user
    const { rows: favRows } = await pool.query(
      'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
      [favoriteId, session.user.email]
    )
    if (!favRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const token = crypto.randomBytes(32).toString('hex')

    let passwordHash: string | null = null
    if (password) {
      const bcrypt = (await import('bcryptjs')).default
      passwordHash = await bcrypt.hash(password, 10)
    }

    const { rows } = await pool.query(
      `INSERT INTO favorite_share_links (favorite_id, token, name, password_hash, visibility, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [favoriteId, token, name, passwordHash, visibility, expiresAt ?? null]
    )
    return NextResponse.json(mapRow(rows[0]), { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureTable()
    const { id, name, visibility, expiresAt, password, bookingEnabled, templateIds } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Verify ownership
    const { rows: check } = await pool.query(
      `SELECT sl.id FROM favorite_share_links sl
       JOIN user_favorites f ON f.id = sl.favorite_id
       WHERE sl.id = $1 AND f.user_email = $2`,
      [id, session.user.email]
    )
    if (!check.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Build update dynamically
    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name) }
    if (visibility !== undefined) { updates.push(`visibility = $${idx++}`); values.push(visibility) }
    if (expiresAt !== undefined) { updates.push(`expires_at = $${idx++}`); values.push(expiresAt || null) }
    if (password !== undefined) {
      if (password === '') {
        // Remove password
        updates.push(`password_hash = $${idx++}`); values.push(null)
      } else {
        const bcrypt = (await import('bcryptjs')).default
        updates.push(`password_hash = $${idx++}`); values.push(await bcrypt.hash(password, 10))
      }
    }

    if (bookingEnabled !== undefined) { updates.push(`booking_enabled = $${idx++}`); values.push(!!bookingEnabled) }

    if (!updates.length && !templateIds) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    if (updates.length) {
      values.push(id)
      await pool.query(
        `UPDATE favorite_share_links SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      )
    }

    // Sync template links if provided
    if (Array.isArray(templateIds)) {
      await pool.query('DELETE FROM share_link_templates WHERE share_link_id = $1', [id])
      for (const tid of templateIds) {
        await pool.query(
          'INSERT INTO share_link_templates (share_link_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, tid]
        )
      }
    }

    const { rows } = await pool.query(
      `SELECT sl.*,
        COALESCE((SELECT json_agg(slt.template_id) FROM share_link_templates slt WHERE slt.share_link_id = sl.id), '[]') AS template_ids
       FROM favorite_share_links sl WHERE sl.id = $1`,
      [id]
    )
    return NextResponse.json(mapRow(rows[0]))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, favoriteId } = body

    if (id) {
      // Delete single link — verify ownership through favorite join
      await pool.query(
        `DELETE FROM favorite_share_links
         WHERE id = $1
           AND favorite_id IN (SELECT id FROM user_favorites WHERE user_email = $2)`,
        [id, session.user.email]
      )
    } else if (favoriteId) {
      // Kill switch — delete ALL links for a favorite
      // Verify favorite belongs to current user first
      const { rows: favRows } = await pool.query(
        'SELECT id FROM user_favorites WHERE id = $1 AND user_email = $2',
        [favoriteId, session.user.email]
      )
      if (!favRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      await pool.query('DELETE FROM favorite_share_links WHERE favorite_id = $1', [favoriteId])
    } else {
      return NextResponse.json({ error: 'Missing id or favoriteId' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
