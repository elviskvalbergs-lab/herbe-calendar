import { NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

// Debug endpoint: shows the color mapping chain
export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }
  try {
    const [rawTypes, rawGroups] = await Promise.all([
      herbeFetchAll(REGISTERS.activityTypes, {}, 5),
      herbeFetchAll(REGISTERS.activityClassGroups, {}, 100),
    ])

    const mappedTypes = (rawTypes as Record<string, unknown>[]).map(t => ({
      code: t['Code'],
      ActTypeGr: t['ActTypeGr'],   // this should match a group Code below
      _allFields: Object.keys(t),
    }))

    const mappedGroups = (rawGroups as Record<string, unknown>[]).map(g => ({
      code: g['Code'],
      CalColNr: g['CalColNr'],
      _allFields: Object.keys(g),
    }))

    return NextResponse.json({ types_sample: mappedTypes, groups: mappedGroups }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
