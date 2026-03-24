import { NextRequest, NextResponse } from 'next/server'
import { graphFetch } from '@/lib/graph/client'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'

const VALID_ACTIONS = new Set(['accept', 'decline', 'tentativelyAccept'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try { session = await requireSession() } catch { return unauthorized() }

  const { id } = await params
  const { action } = await req.json()

  // Validate id: must not contain path traversal characters
  if (!id || id.includes('/') || id.includes('..') || id.includes('\\')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  // email MUST come from session — never from request body
  const email = session.email
  const res = await graphFetch(`/users/${email}/events/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ sendResponse: true }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  return NextResponse.json({ ok: true })
}
