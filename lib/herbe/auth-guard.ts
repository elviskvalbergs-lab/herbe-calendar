import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export interface SessionUser {
  userCode: string
  email: string
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.email) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  return {
    userCode: (session.user as { userCode?: string }).userCode ?? '',
    email: session.user.email,
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
