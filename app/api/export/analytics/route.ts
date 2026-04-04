import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { validateToken } from '@/lib/apiTokens'

export async function GET(req: NextRequest) {
  // Authenticate via Bearer token
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Bearer token required' }, { status: 401 })
  }
  const tokenInfo = await validateToken(auth.slice(7))
  if (!tokenInfo) {
    return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')        // ISO timestamp for incremental fetch
  const until = searchParams.get('until')         // optional upper bound
  const limit = Math.min(Number(searchParams.get('limit')) || 1000, 10000)
  const eventType = searchParams.get('eventType') // optional filter

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  // Scope to account (unless super token)
  if (tokenInfo.scope !== 'super') {
    conditions.push(`account_id = $${paramIdx++}`)
    params.push(tokenInfo.accountId)
  }

  if (since) {
    conditions.push(`occurred_at > $${paramIdx++}`)
    params.push(since)
  }
  if (until) {
    conditions.push(`occurred_at <= $${paramIdx++}`)
    params.push(until)
  }
  if (eventType) {
    conditions.push(`event_type = $${paramIdx++}`)
    params.push(eventType)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const query = `SELECT id, account_id, user_email, event_type, event_date, occurred_at, metadata
    FROM analytics_events ${where}
    ORDER BY occurred_at ASC
    LIMIT $${paramIdx}`
  params.push(limit)

  const { rows } = await pool.query(query, params)

  // Include cursor for next incremental fetch
  const lastTimestamp = rows.length > 0 ? rows[rows.length - 1].occurred_at : null

  return NextResponse.json({
    data: rows,
    cursor: lastTimestamp,
    hasMore: rows.length === limit,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
