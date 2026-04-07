import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getErpConnections } from '@/lib/accountConfig'

const projCache = new Map<string, { data: Record<string, unknown>[]; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const connectionId = url.searchParams.get('connectionId')

  const connections = await getErpConnections(session.accountId)
  const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]
  const cacheKey = conn?.id ?? 'default'

  async function getAllProjects(): Promise<Record<string, unknown>[]> {
    const cached = projCache.get(cacheKey)
    if (cached && Date.now() < cached.expiry) return cached.data
    const raw = await herbeFetchAll(REGISTERS.projects, {}, 500, conn) as Record<string, unknown>[]
    projCache.set(cacheKey, { data: raw, expiry: Date.now() + CACHE_TTL })
    return raw
  }

  if (url.searchParams.has('preload')) {
    getAllProjects().catch(() => {})
    return NextResponse.json({ ok: true })
  }

  if (url.searchParams.has('all')) {
    const all = await getAllProjects()
    const results = all
      .filter(p => String((p as Record<string, unknown>)['Terminated'] ?? '0') === '0')
      .map(p => {
        const r = p as Record<string, unknown>
        return {
          Code: String(r['Code'] ?? r['PRCode'] ?? ''),
          Name: String(r['Name'] ?? ''),
          CUCode: String(r['CUCode'] ?? r['CustomerCode'] ?? r['CustCode'] ?? r['CU'] ?? '') || null,
          CUName: String(r['CUName'] ?? r['CustomerName'] ?? r['CustName'] ?? r['CUComment'] ?? '') || null,
        }
      })
      .filter(r => r.Code)
    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  }

  if (q.length < 2) return NextResponse.json([])
  try {
    const all = await getAllProjects()
    const lower = q.toLowerCase()
    const results = all
      .filter(p => {
        const r = p as Record<string, unknown>
        return String(r['Terminated'] ?? '0') === '0' &&
          String(r['Name'] ?? '').toLowerCase().includes(lower)
      })
      .slice(0, 20)
      .map(p => {
        const r = p as Record<string, unknown>
        return {
          Code: String(r['Code'] ?? r['PRCode'] ?? ''),
          Name: String(r['Name'] ?? ''),
          CUCode: String(r['CUCode'] ?? r['CustomerCode'] ?? r['CustCode'] ?? r['CU'] ?? '') || null,
          CUName: String(r['CUName'] ?? r['CustomerName'] ?? r['CustName'] ?? r['CUComment'] ?? '') || null,
        }
      })
    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
