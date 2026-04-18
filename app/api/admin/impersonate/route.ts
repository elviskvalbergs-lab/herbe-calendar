import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { signCookieValue } from '@/lib/signedCookie'

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession('superadmin')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, accountId } = await req.json()
  if (!email || typeof email !== 'string' || !accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'email and accountId required' }, { status: 400 })
  }

  const value = `${encodeURIComponent(email)}|${accountId}`
  const signed = signCookieValue(value)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('impersonateAs', signed, {
    path: '/',
    maxAge: 3600,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

export async function DELETE() {
  try {
    await requireAdminSession('superadmin')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('impersonateAs')
  return res
}
