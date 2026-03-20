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
    const all = await herbeFetchAll(REGISTERS.customers, {}, 500)
    const lower = q.toLowerCase()
    const results = all.filter(c => {
      const r = c as Record<string, unknown>
      const name = String(r['Name'] ?? r['CUName'] ?? '')
      const code = String(r['Code'] ?? r['CUCode'] ?? '')
      return name.toLowerCase().includes(lower) || code.toLowerCase().includes(lower)
    }).slice(0, 20)
    return NextResponse.json(results)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
