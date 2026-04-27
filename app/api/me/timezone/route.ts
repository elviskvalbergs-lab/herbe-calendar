import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { isValidTimezone } from '@/lib/timezone'

export async function PATCH(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  let body: { timezone?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const tz = body?.timezone
  if (tz !== null && !isValidTimezone(tz)) {
    return NextResponse.json({ error: 'invalid timezone' }, { status: 400 })
  }

  await pool.query(
    'UPDATE account_members SET timezone = $1 WHERE account_id = $2 AND LOWER(email) = LOWER($3)',
    [tz, session.accountId, session.email],
  )

  return NextResponse.json({ ok: true })
}
