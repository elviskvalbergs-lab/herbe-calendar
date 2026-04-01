import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { compare } from 'bcryptjs'

const LINK_QUERY = `
  SELECT
    sl.id,
    sl.visibility,
    sl.expires_at,
    sl.password_hash IS NOT NULL AS "hasPassword",
    sl.name AS "linkName",
    f.name AS "favoriteName",
    f.view,
    f.person_codes AS "personCodes",
    f.hidden_calendars AS "hiddenCalendars",
    f.user_email AS "ownerEmail"
  FROM favorite_share_links sl
  JOIN user_favorites f ON f.id = sl.favorite_id
  WHERE sl.token = $1
`

const LINK_QUERY_WITH_HASH = `
  SELECT
    sl.id,
    sl.visibility,
    sl.expires_at,
    sl.password_hash IS NOT NULL AS "hasPassword",
    sl.password_hash AS "passwordHash",
    sl.name AS "linkName",
    f.name AS "favoriteName",
    f.view,
    f.person_codes AS "personCodes",
    f.hidden_calendars AS "hiddenCalendars",
    f.user_email AS "ownerEmail"
  FROM favorite_share_links sl
  JOIN user_favorites f ON f.id = sl.favorite_id
  WHERE sl.token = $1
`

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const { rows } = await pool.query(LINK_QUERY, [token])
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = rows[0]
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  return NextResponse.json({
    favoriteName: link.favoriteName,
    view: link.view,
    personCodes: link.personCodes,
    hiddenCalendars: link.hiddenCalendars ?? [],
    visibility: link.visibility,
    hasPassword: link.hasPassword,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const { password } = body as { password?: string }

  const { rows } = await pool.query(LINK_QUERY_WITH_HASH, [token])
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const link = rows[0]
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  if (link.passwordHash) {
    const valid = await compare(password ?? '', link.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
    }
  }

  await pool.query(
    'UPDATE favorite_share_links SET last_accessed_at = NOW(), access_count = access_count + 1 WHERE id = $1',
    [link.id]
  )

  return NextResponse.json({
    favoriteName: link.favoriteName,
    view: link.view,
    personCodes: link.personCodes,
    hiddenCalendars: link.hiddenCalendars ?? [],
    visibility: link.visibility,
    hasPassword: false,
  })
}
