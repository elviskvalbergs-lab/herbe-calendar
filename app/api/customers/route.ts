import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

// Module-level cache — survives across requests on the same serverless instance
let customerCache: Record<string, unknown>[] | null = null
let customerCacheExpiry = 0

async function getAllCustomers(): Promise<Record<string, unknown>[]> {
  if (customerCache && Date.now() < customerCacheExpiry) return customerCache
  const all = await herbeFetchAll(REGISTERS.customers, {}, 200)
  customerCache = all as Record<string, unknown>[]
  customerCacheExpiry = Date.now() + 5 * 60 * 1000 // 5 min TTL
  return customerCache
}

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const debug = url.searchParams.get('debug')

  const preload = url.searchParams.has('preload')

  // Warm the cache in the background without returning data
  if (preload) {
    getAllCustomers().catch(() => {}) // fire and forget
    return NextResponse.json({ ok: true })
  }

  // Return all active customers for client-side caching
  if (url.searchParams.has('all')) {
    const all = await getAllCustomers()
    const results = (all as Record<string, unknown>[])
      .filter(r => String(r['Closed'] ?? r['Inactive'] ?? '0') !== '1')
      .map(r => ({
        Code: String(r['Code'] ?? r['CUCode'] ?? r['CustomerCode'] ?? ''),
        Name: String(r['Name'] ?? r['CUName'] ?? r['CustomerName'] ?? r['Comment'] ?? ''),
      }))
      .filter(r => r.Code)
    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  }

  if (!debug && q.length < 2) return NextResponse.json([])

  try {
    const all = await getAllCustomers()

    // Debug mode: return first 3 raw records to inspect field names
    if (debug) return NextResponse.json((all as Record<string, unknown>[]).slice(0, 3))

    const lower = q.toLowerCase()
    const results = (all as Record<string, unknown>[])
      .filter(r => {
        // Skip closed/inactive customers
        if (String(r['Closed'] ?? r['Inactive'] ?? '0') === '1') return false
        // Match against any plausible name/code field
        const name = String(r['Name'] ?? r['CUName'] ?? r['CustomerName'] ?? r['Comment'] ?? '')
        const code = String(r['Code'] ?? r['CUCode'] ?? r['CustomerCode'] ?? '')
        return name.toLowerCase().includes(lower) || code.toLowerCase().includes(lower)
      })
      .slice(0, 20)
      .map(r => ({
        Code: String(r['Code'] ?? r['CUCode'] ?? r['CustomerCode'] ?? ''),
        Name: String(r['Name'] ?? r['CUName'] ?? r['CustomerName'] ?? r['Comment'] ?? ''),
      }))
      .filter(r => r.Code)

    return NextResponse.json(results, { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=60' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
