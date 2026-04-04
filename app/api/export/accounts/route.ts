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

  // Only super-scoped tokens can list all accounts
  if (tokenInfo.scope !== 'super') {
    return NextResponse.json({ error: 'Super-scoped token required' }, { status: 403 })
  }

  const { rows } = await pool.query(
    `SELECT a.id, a.slug, a.display_name, a.created_at, a.suspended_at,
            (SELECT COUNT(*)::int FROM account_members am WHERE am.account_id = a.id AND am.active = true) AS member_count,
            (SELECT COUNT(*)::int FROM account_erp_connections ec WHERE ec.account_id = a.id AND ec.active = true) AS erp_connection_count,
            (SELECT COUNT(*)::int FROM account_azure_config ac WHERE ac.account_id = a.id AND ac.tenant_id != '') AS has_azure
     FROM accounts a
     ORDER BY a.display_name`
  )

  return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'no-store' } })
}
