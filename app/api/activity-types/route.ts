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
    const types = await herbeFetchAll(REGISTERS.activityTypes, {}, 1000)
    return NextResponse.json(types, {
      headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
