import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'

const itemCache = new Map<string, { data: Record<string, unknown>[]; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const all = searchParams.get('all')
  const connectionId = searchParams.get('connectionId')

  const connections = await getErpConnections(session.accountId)
  const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]
  const cacheKey = `${session.accountId}:${conn?.id ?? 'default'}`

  async function getAllItems(): Promise<Record<string, unknown>[]> {
    const cached = itemCache.get(cacheKey)
    if (cached && Date.now() < cached.expiry) return cached.data
    const raw = await herbeFetchAll(REGISTERS.items, {}, 200, conn) as Record<string, unknown>[]
    itemCache.set(cacheKey, { data: raw, expiry: Date.now() + CACHE_TTL })
    return raw
  }

  if (all === '1') {
    try {
      const raw = await getAllItems()
      const results = raw
        .map(c => ({ Code: String(c['Code'] ?? ''), Name: String(c['Name'] ?? '') }))
        .filter(r => r.Code)
      return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
    } catch (e) {
      console.error('[items] operation failed:', e)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  if (q.length < 2) return NextResponse.json([])
  try {
    const raw = await getAllItems()
    const lower = q.toLowerCase()
    const results = raw
      .filter(c => {
        return String(c['Name'] ?? '').toLowerCase().includes(lower) || String(c['Code'] ?? '').toLowerCase().includes(lower)
      })
      .slice(0, 20)
      .map(c => ({ Code: String(c['Code'] ?? ''), Name: String(c['Name'] ?? '') }))
      .filter(r => r.Code)

    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  } catch (e) {
    console.error('[items] operation failed:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
