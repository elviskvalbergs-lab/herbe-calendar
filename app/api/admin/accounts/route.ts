import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession('superadmin')
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.slug, a.display_name, a.created_at, a.suspended_at,
            (SELECT COUNT(*)::int FROM account_members am WHERE am.account_id = a.id) AS member_count
     FROM tenant_accounts a ORDER BY a.display_name`
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession('superadmin')
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { name, slug } = await req.json()
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

  try {
    const { rows } = await pool.query(
      'INSERT INTO tenant_accounts (slug, display_name) VALUES ($1, $2) RETURNING *',
      [cleanSlug, name]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (e) {
    if (String(e).includes('unique')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession('superadmin')
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { id, name, suspended } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (name) { updates.push(`display_name = $${idx++}`); params.push(name) }
  if (typeof suspended === 'boolean') {
    updates.push(`suspended_at = $${idx++}`)
    params.push(suspended ? new Date().toISOString() : null)
  }

  if (updates.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  params.push(id)
  await pool.query(`UPDATE tenant_accounts SET ${updates.join(', ')}, updated_at = now() WHERE id = $${idx}`, params)
  return NextResponse.json({ ok: true })
}
