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
  try {
    const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
    const debug = new URL(req.url).searchParams.get('debug')
    if (debug) {
      // Return the raw record for the given user code to inspect field names
      const record = (users as Record<string, unknown>[]).find(u => u['Code'] === debug)
      return NextResponse.json(record ?? { error: `User ${debug} not found` })
    }
    const active = users.filter(u => String((u as Record<string, unknown>)['Closed'] ?? '0') === '0')
    return NextResponse.json(active)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
