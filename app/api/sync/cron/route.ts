import { NextRequest, NextResponse } from 'next/server'
import { syncAllErp } from '@/lib/sync/erp'
import { syncAllOutlook } from '@/lib/sync/graph'
import { syncAllGoogle } from '@/lib/sync/google'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental'

  try {
    const [erp, outlook, google] = await Promise.all([
      syncAllErp(mode),
      syncAllOutlook(mode),
      syncAllGoogle(mode),
    ])
    const summary = { erp, outlook, google }
    console.log(`[sync/cron] ${mode} sync complete:`, JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (e) {
    console.error('[sync/cron] sync failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
