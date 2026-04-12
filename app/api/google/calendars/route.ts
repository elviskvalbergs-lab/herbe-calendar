import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getUserGoogleAccounts, getValidAccessToken, syncCalendarList } from '@/lib/google/userOAuth'
import { pool } from '@/lib/db'

/** GET: List all connected Google accounts and their calendars */
export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const accounts = await getUserGoogleAccounts(session.email, session.accountId)
  return NextResponse.json(accounts)
}

/** PUT: Toggle enabled or change color for a calendar */
export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { calendarDbId, enabled, color, sharing } = await req.json()
  if (!calendarDbId || typeof calendarDbId !== 'string') {
    return NextResponse.json({ error: 'calendarDbId required' }, { status: 400 })
  }

  // Verify ownership: calendar must belong to this user
  const { rows } = await pool.query(
    `SELECT c.id FROM user_google_calendars c
     JOIN user_google_tokens t ON t.id = c.user_google_token_id
     WHERE c.id = $1 AND t.user_email = $2 AND t.account_id = $3`,
    [calendarDbId, session.email, session.accountId]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  const updates: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (typeof enabled === 'boolean') {
    updates.push(`enabled = $${paramIdx++}`)
    params.push(enabled)
  }
  if (typeof color === 'string') {
    updates.push(`color = $${paramIdx++}`)
    params.push(color || null)
  }
  if (typeof sharing === 'string' && ['private', 'busy', 'titles', 'full'].includes(sharing)) {
    updates.push(`sharing = $${paramIdx++}`)
    params.push(sharing)
  }

  if (updates.length > 0) {
    params.push(calendarDbId)
    await pool.query(
      `UPDATE user_google_calendars SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params
    )
  }

  return NextResponse.json({ ok: true })
}

/** POST: Refresh calendar list from Google */
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { tokenId } = await req.json()
  if (!tokenId || typeof tokenId !== 'string') {
    return NextResponse.json({ error: 'tokenId required' }, { status: 400 })
  }

  // Verify ownership
  const { rows } = await pool.query(
    'SELECT id FROM user_google_tokens WHERE id = $1 AND user_email = $2 AND account_id = $3',
    [tokenId, session.email, session.accountId]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  const accessToken = await getValidAccessToken(tokenId)
  if (!accessToken) {
    return NextResponse.json({ error: 'Could not refresh Google token — reconnect your account' }, { status: 401 })
  }

  await syncCalendarList(tokenId, accessToken)
  const accounts = await getUserGoogleAccounts(session.email, session.accountId)
  return NextResponse.json(accounts)
}
