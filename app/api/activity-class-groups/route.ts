import { NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  try {
    const raw = await herbeFetchAll(REGISTERS.activityClassGroups, {}, 100)
    const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'
    const groups = (raw as Record<string, unknown>[]).map(g => ({
      code: String(g['Code'] ?? ''),
      name: String(g['Comment'] ?? g['Name'] ?? g['Code'] ?? ''),
      calColNr: g['CalColNr'] != null ? String(g['CalColNr']) : undefined,
      forceProj: toBool(g['ForceProj']) || undefined,
      forceCust: toBool(g['ForceCust']) || undefined,
      forceItem: toBool(g['ForceItem']) || undefined,
      forceTextInMatrix: toBool(g['ForceTextInMatrix']) || undefined,
    }))
    return NextResponse.json(groups, {
      headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
