import { NextRequest, NextResponse } from 'next/server'
import { syncAllErp } from '@/lib/sync/erp'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verify request is from Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = new URL(req.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental'

  try {
    const result = await syncAllErp(mode)
    console.log(`[sync/cron] ${mode} sync complete:`, JSON.stringify(result))
    return NextResponse.json(result)
  } catch (e) {
    console.error('[sync/cron] sync failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
