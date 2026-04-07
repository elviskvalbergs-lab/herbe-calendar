import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'

function getAccountIdFromCookie(req: NextRequest): string | undefined {
  return req.cookies.get('adminAccountId')?.value || undefined
}

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10)
  const groupBy = searchParams.get('groupBy') ?? 'day'
  const userEmail = searchParams.get('userEmail')

  const dateExpr = groupBy === 'month' ? `DATE_TRUNC('month', event_date)::date`
    : groupBy === 'week' ? `DATE_TRUNC('week', event_date)::date`
    : 'event_date'

  const conditions = ['account_id = $1', 'event_date >= $2::date', 'event_date <= $3::date']
  const params: unknown[] = [session.accountId, from, to]

  if (userEmail) {
    conditions.push(`user_email = $4`)
    params.push(userEmail)
  }

  const where = conditions.join(' AND ')

  // Aggregated stats
  const { rows: timeline } = await pool.query(
    `SELECT ${dateExpr} AS period, event_type, COUNT(*)::int AS count
     FROM analytics_events WHERE ${where}
     GROUP BY period, event_type ORDER BY period`,
    params
  )

  // Top users
  const { rows: topUsers } = await pool.query(
    `SELECT user_email, COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE event_type = 'login')::int AS logins,
            COUNT(*) FILTER (WHERE event_type = 'activity_created')::int AS created,
            COUNT(*) FILTER (WHERE event_type = 'activity_edited')::int AS edited,
            COUNT(*) FILTER (WHERE event_type = 'day_viewed')::int AS days_viewed
     FROM analytics_events WHERE ${where}
     GROUP BY user_email ORDER BY total DESC LIMIT 20`,
    params
  )

  return NextResponse.json({ timeline, topUsers, from, to, groupBy })
}
