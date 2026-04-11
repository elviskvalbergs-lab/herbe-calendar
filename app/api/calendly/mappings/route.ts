import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { pool } from '@/lib/db'

export async function PUT(req: NextRequest) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { eventTypeUri, templateId } = await req.json()
  if (!eventTypeUri) return NextResponse.json({ error: 'eventTypeUri required' }, { status: 400 })

  // Verify ownership
  const { rows } = await pool.query(
    `SELECT m.id FROM user_calendly_event_mappings m
     JOIN user_calendly_tokens t ON t.id = m.calendly_token_id
     WHERE m.event_type_uri = $1 AND t.user_email = $2 AND t.account_id = $3`,
    [eventTypeUri, session.email, session.accountId]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Event type not found' }, { status: 404 })

  await pool.query(
    'UPDATE user_calendly_event_mappings SET template_id = $1 WHERE id = $2',
    [templateId || null, rows[0].id]
  )
  return NextResponse.json({ ok: true })
}
