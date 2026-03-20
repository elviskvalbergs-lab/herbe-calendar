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
    const raw = await herbeFetchAll(REGISTERS.activityTypes, {}, 1000)
    const types = (raw as Record<string, unknown>[]).map(t => ({
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
