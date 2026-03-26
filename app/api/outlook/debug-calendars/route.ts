import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const email = session.email
    if (!email) return NextResponse.json({ error: 'No email in session' }, { status: 400 })

    const res = await graphFetch(`/users/${email}/calendars?$select=id,name,owner,canEdit,canViewStatus`)
    if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `Graph failed: ${res.status}`, detail: err }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json({
        user: email,
        calendars: data.value ?? []
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
