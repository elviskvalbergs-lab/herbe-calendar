import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

let projectCache: Record<string, unknown>[] | null = null
let projectCacheExpiry = 0

async function getAllProjects(): Promise<Record<string, unknown>[]> {
  if (projectCache && Date.now() < projectCacheExpiry) return projectCache
  const all = await herbeFetchAll(REGISTERS.projects, {}, 500)
  projectCache = all as Record<string, unknown>[]
  projectCacheExpiry = Date.now() + 5 * 60 * 1000
  return projectCache
}

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''

  if (url.searchParams.has('preload')) {
    getAllProjects().catch(() => {})
    return NextResponse.json({ ok: true })
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
          // Try all known field name variants for the linked customer
          CUCode: String(r['CUCode'] ?? r['CustomerCode'] ?? r['CustCode'] ?? r['CU'] ?? '') || null,
          CUName: String(r['CUName'] ?? r['CustomerName'] ?? r['CustName'] ?? r['CUComment'] ?? '') || null,
        }
      })
    return NextResponse.json(results)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
