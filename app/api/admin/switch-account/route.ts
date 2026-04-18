import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { signCookieValue } from '@/lib/signedCookie'

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession('superadmin')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { accountId } = await req.json()
  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  }

  const signed = signCookieValue(accountId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('adminAccountId', signed, {
    path: '/',
    maxAge: 86400,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
