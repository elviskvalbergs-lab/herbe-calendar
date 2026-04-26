import { pool } from '@/lib/db'
import { ok, serviceUnavailable } from '@/lib/api/respond'

export const dynamic = 'force-dynamic'

const REQUIRED_ENV = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'CONFIG_ENCRYPTION_KEY',
  'CRON_SECRET',
] as const

export async function GET() {
  const missing = REQUIRED_ENV.filter(name => !process.env[name])

  let dbOk = false
  try {
    await pool.query('SELECT 1')
    dbOk = true
  } catch (e) {
    console.error('[health] db check failed:', e)
  }

  if (!dbOk || missing.length > 0) {
    return serviceUnavailable('degraded', {
      status: 'degraded',
      db: dbOk ? 'ok' : 'fail',
      env: { missing },
    })
  }

  return ok({
    status: 'ok',
    db: 'ok',
    env: 'ok',
    uptime: process.uptime(),
  })
}
