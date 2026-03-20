import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 2) return NextResponse.json([])
  try {
    const all = await herbeFetchAll(REGISTERS.projects, {}, 500)
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
