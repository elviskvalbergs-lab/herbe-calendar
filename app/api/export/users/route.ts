import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { validateToken } from '@/lib/apiTokens'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Bearer token required' }, { status: 401 })
  }
  const tokenInfo = await validateToken(auth.slice(7))
  if (!tokenInfo) {
    return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 })
  }

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (tokenInfo.scope !== 'super') {
    conditions.push(`pc.account_id = $${paramIdx++}`)
    params.push(tokenInfo.accountId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await pool.query(
    `SELECT pc.generated_code AS code, pc.display_name AS name, pc.email, pc.source,
            pc.erp_code, pc.account_id,
            am.role, am.active, am.last_login
     FROM person_codes pc
     LEFT JOIN account_members am ON am.email = pc.email AND am.account_id = pc.account_id
     ${where}
     ORDER BY pc.display_name`,
    params
  )

  return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'no-store' } })
}
