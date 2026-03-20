import { NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

// Debug endpoint: returns first 5 raw activity type records with all fields
export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  try {
    const raw = await herbeFetchAll(REGISTERS.activityTypes, {}, 5)
    return NextResponse.json(raw.slice(0, 5))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
