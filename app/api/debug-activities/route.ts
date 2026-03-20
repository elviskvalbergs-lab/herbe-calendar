import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

// Debug endpoint: shows raw fields on a few activities
// Usage: /api/debug-activities?date=2026-03-20
export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  try {
    const raw = await herbeFetchAll(REGISTERS.activities, { sort: 'TransDate', range: `${date}:${date}` }, 5)
    const sample = (raw as Record<string, unknown>[]).slice(0, 5).map(r => ({
      SerNr: r['SerNr'],
      ActType: r['ActType'],
      MainPersons: r['MainPersons'],
      _allFields: Object.keys(r),
    }))
    return NextResponse.json({ date, count: raw.length, sample }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
