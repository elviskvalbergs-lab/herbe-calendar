import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
const custCache = new Map<string, { data: Record<string, unknown>[]; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const all = searchParams.get('all')
  const connectionId = searchParams.get('connectionId')

  const connections = await getErpConnections(DEFAULT_ACCOUNT_ID)
  const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]
  const cacheKey = conn?.id ?? 'default'

  async function getAllCustomers(): Promise<Record<string, unknown>[]> {
    const cached = custCache.get(cacheKey)
    if (cached && Date.now() < cached.expiry) return cached.data
    const raw = await herbeFetchAll(REGISTERS.customers, {}, 200, conn) as Record<string, unknown>[]
    custCache.set(cacheKey, { data: raw, expiry: Date.now() + CACHE_TTL })
    return raw
  }

  if (all === '1') {
    try {
      const raw = await getAllCustomers()
      const results = raw
        .map(c => ({ Code: String((c as Record<string, unknown>)['Code'] ?? ''), Name: String((c as Record<string, unknown>)['Name'] ?? '') }))
        .filter(r => r.Code)
      return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  if (q.length < 2) return NextResponse.json([])
  try {
    const raw = await getAllCustomers()
    const lower = q.toLowerCase()
    const results = raw
      .filter(c => {
        const r = c as Record<string, unknown>
        return String(r['Name'] ?? '').toLowerCase().includes(lower)
      })
      .slice(0, 20)
      .map(c => {
        const r = c as Record<string, unknown>
        return { Code: String(r['Code'] ?? ''), Name: String(r['Name'] ?? '') }
      })
      .filter(r => r.Code)

    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
