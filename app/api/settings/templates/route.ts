import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { rows } = await pool.query(
    `SELECT bt.*,
            COALESCE(
              (SELECT json_agg(json_build_object('id', fsl.id, 'name', fsl.name))
               FROM share_link_templates slt
               JOIN favorite_share_links fsl ON fsl.id = slt.share_link_id
               WHERE slt.template_id = bt.id),
              '[]'::json
            ) AS linked_share_links
     FROM booking_templates bt
     WHERE bt.account_id = $1
     ORDER BY bt.name`,
    [session.accountId]
  )

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields } =
    await req.json()

  if (!name || !duration_minutes) {
    return NextResponse.json({ error: 'name and duration_minutes are required' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `INSERT INTO booking_templates
       (account_id, user_email, name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [session.accountId, session.email, name, duration_minutes,
     JSON.stringify(availability_windows ?? []), buffer_minutes ?? 0,
     JSON.stringify(targets ?? {}), JSON.stringify(custom_fields ?? [])]
  )

  return NextResponse.json(rows[0], { status: 201 })
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const fieldMap: Record<string, { column: string; jsonb?: boolean }> = {
    name:                { column: 'name' },
    durationMinutes:     { column: 'duration_minutes' },
    duration_minutes:    { column: 'duration_minutes' },
    availabilityWindows: { column: 'availability_windows', jsonb: true },
    availability_windows:{ column: 'availability_windows', jsonb: true },
    bufferMinutes:       { column: 'buffer_minutes' },
    buffer_minutes:      { column: 'buffer_minutes' },
    targets:             { column: 'targets', jsonb: true },
    customFields:        { column: 'custom_fields', jsonb: true },
    custom_fields:       { column: 'custom_fields', jsonb: true },
    active:              { column: 'active' },
  }

  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const [key, meta] of Object.entries(fieldMap)) {
    if (body[key] !== undefined) {
      updates.push(`${meta.column} = $${idx++}`)
      values.push(meta.jsonb ? JSON.stringify(body[key]) : body[key])
    }
  }

  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  updates.push(`updated_at = now()`)
  values.push(id, session.accountId)
  const { rows } = await pool.query(
    `UPDATE booking_templates SET ${updates.join(', ')} WHERE id = $${idx++} AND account_id = $${idx} RETURNING *`,
    values
  )

  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { id, duplicate } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (duplicate) {
    const { rows } = await pool.query(
      `INSERT INTO booking_templates
         (account_id, user_email, name, duration_minutes, availability_windows, buffer_minutes, targets, custom_fields, active)
       SELECT account_id, user_email, name || ' (copy)', duration_minutes, availability_windows, buffer_minutes, targets, custom_fields, active
       FROM booking_templates WHERE id = $1 AND account_id = $2
       RETURNING *`,
      [id, session.accountId]
    )
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(rows[0], { status: 201 })
  }

  await pool.query('DELETE FROM booking_templates WHERE id = $1 AND account_id = $2', [id, session.accountId])
  return NextResponse.json({ ok: true })
}
