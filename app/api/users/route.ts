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
    const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
    return NextResponse.json(users)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
