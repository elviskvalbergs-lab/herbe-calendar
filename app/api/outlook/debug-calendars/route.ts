import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { graphFetch } from '@/lib/graph/client'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    const email = session?.user?.email
    const host = req.headers.get('host')

    if (!email) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        message: 'No session found. Please sign in first.',
        host,
        hint: 'Make sure you are signed in on this same domain.'
      }, { status: 401 })
    }

    const res = await graphFetch(`/users/${email}/calendars?$select=id,name,owner,canEdit`)
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
