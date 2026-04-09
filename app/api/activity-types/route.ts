import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'

// Per-connection cache
const typeCache = new Map<string, { data: Record<string, unknown>[]; expiry: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

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

    const cached = typeCache.get(cacheKey)
    let raw: Record<string, unknown>[]
    if (cached && Date.now() < cached.expiry) {
      raw = cached.data
    } else {
      raw = await herbeFetchAll(REGISTERS.activityTypes, {}, 1000, conn) as Record<string, unknown>[]
      typeCache.set(cacheKey, { data: raw, expiry: Date.now() + CACHE_TTL })
    }

    const types = raw.map(t => ({
      code: String(t['Code'] ?? ''),
      name: String(t['Comment'] ?? t['Name'] ?? t['Code'] ?? ''),
      classGroupCode: String(t['ActTypeGr'] ?? '') || undefined,
    }))
    return NextResponse.json(types, {
      headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
