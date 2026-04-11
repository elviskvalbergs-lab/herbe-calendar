import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { fetchEventTypes, getCalendlyConnection } from '@/lib/calendly/client'

export async function POST() {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { rows } = await pool.query(
    'SELECT id, access_token, calendly_user_uri FROM user_calendly_tokens WHERE user_email = $1 AND account_id = $2',
    [session.email, session.accountId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Not connected' }, { status: 404 })

  const pat = decrypt(rows[0].access_token)
  const eventTypes = await fetchEventTypes(pat, rows[0].calendly_user_uri)

  for (const et of eventTypes) {
    await pool.query(
      `INSERT INTO user_calendly_event_mappings (calendly_token_id, event_type_uri, event_type_name, event_type_duration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (calendly_token_id, event_type_uri)
       DO UPDATE SET event_type_name = $3, event_type_duration = $4`,
      [rows[0].id, et.uri, et.name, et.duration]
    )
  }

  // Remove event types no longer in Calendly
  const currentUris = eventTypes.map(et => et.uri)
  if (currentUris.length > 0) {
    await pool.query(
      'DELETE FROM user_calendly_event_mappings WHERE calendly_token_id = $1 AND event_type_uri != ALL($2)',
      [rows[0].id, currentUris]
    )
  }

  const connection = await getCalendlyConnection(session.email, session.accountId)
  return NextResponse.json(connection)
}
