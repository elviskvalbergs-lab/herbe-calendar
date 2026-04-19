import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'

const groupCache = new Map<string, { data: Record<string, unknown>[]; expiry: number }>()
const CACHE_TTL = 60 * 60 * 1000

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const connectionId = new URL(req.url).searchParams.get('connectionId')

  try {
    const connections = await getErpConnections(session.accountId)
    const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]
    const cacheKey = `${session.accountId}:${conn?.id ?? 'default'}`

    const cached = groupCache.get(cacheKey)
    let raw: Record<string, unknown>[]
    if (cached && Date.now() < cached.expiry) {
      raw = cached.data
    } else {
      raw = await herbeFetchAll(REGISTERS.activityClassGroups, {}, 100, conn) as Record<string, unknown>[]
      groupCache.set(cacheKey, { data: raw, expiry: Date.now() + CACHE_TTL })
    }

    const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'
    const groups = raw.map(g => ({
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
    console.error('[activity-class-groups] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
