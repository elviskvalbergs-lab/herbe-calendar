import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { pool } from '@/lib/db'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { sendMail } from '@/lib/graph/client'
import type { EmailConfig } from 'next-auth/providers/email'
import { AccessDenied } from '@auth/core/errors'

// Cache email → userCode lookups for 1 hour to avoid fetching all users on every session callback
const userCache = new Map<string, { userCode: string; expiresAt: number }>()
const USER_CACHE_TTL_MS = 60 * 60 * 1000

async function isEmailRegistered(email: string): Promise<{ registered: boolean; userCode: string }> {
  const lower = email.toLowerCase()
  const cached = userCache.get(lower)
  if (cached && cached.expiresAt > Date.now()) {
    return { registered: !!cached.userCode, userCode: cached.userCode }
  }

  let users: unknown[]
  try {
    users = await herbeFetchAll(REGISTERS.users, {}, 500)
  } catch (e) {
    const msg = String(e)
    // 405 = UserVc endpoint not available on this server — can't validate against Herbe,
    // so allow the request through (sign-in email link already provides security)
    if (msg.includes('405') || msg.includes('HERBE_NOT_CONFIGURED')) {
      console.warn('[auth] UserVc unavailable, skipping Herbe email check:', msg)
      return { registered: true, userCode: '' }
    }
    throw e
  }

  const user = users.find((u) => {
    const r = u as Record<string, unknown>
    return (
      String(r['emailAddr'] ?? '').toLowerCase() === lower ||
      String(r['LoginEmailAddr'] ?? '').toLowerCase() === lower
    )
  }) as Record<string, unknown> | undefined
  const userCode = user ? String(user['Code'] ?? '') : ''
  userCache.set(lower, { userCode, expiresAt: Date.now() + USER_CACHE_TTL_MS })
  if (!user) return { registered: false, userCode: '' }
  return { registered: true, userCode }
}

const emailProvider: EmailConfig = {
  id: 'email',
  type: 'email',
  name: 'Email',
  from: process.env.AZURE_SENDER_EMAIL!,
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier: email, url: rawUrl }) {
    let url = rawUrl
    try {
      // Dynamic host fix: if we're on a test alias, NextAuth might still use production domain.
      // We can detect the intended host from headers if available (or just recommend the manual fix).
      // Since we don't have easy access to 'req' here in Auth.js v5 sendVerificationRequest,
      // we'll advise the user to check their domain in the browser or we can try to guess.
      // Actually, we'll try to find if we can get headers.
      const { headers } = await import('next/headers')
      const host = (await headers()).get('x-forwarded-host') || (await headers()).get('host')
      if (host && !url.includes(host)) {
        const u = new URL(url)
        u.host = host
        u.protocol = 'https:' // Ensure https for dynamic links
        url = u.toString()
        console.log(`[auth] Adjusted verification URL for host ${host}: ${url}`)
      }
    } catch (e) {
      console.warn('[auth] Failed to detect host for URL adjustment:', e)
    }

    let registered: boolean
    try {
      const result = await isEmailRegistered(email)
      registered = result.registered
    } catch (e) {
      throw e
    }
    if (!registered) {
      throw new AccessDenied()
    }
    await sendMail(
      email,
      'Your Herbe Calendar sign-in link',
      `<p>Click the link below to sign in to Herbe Calendar. The link expires in 24 hours.</p>
       <p><a href="${url}" style="background:#cd4c38;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;display:inline-block;">Sign in</a></p>
       <p>If you did not request this, you can safely ignore this email.</p>
       <p style="font-size: 11px; color: #666;">Target environment: ${url}</p>`
    )
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PostgresAdapter(pool),
  providers: [emailProvider],
  callbacks: {
    async session({ session, user }) {
      try {
        const { userCode } = await isEmailRegistered(user.email)
        session.user.userCode = userCode
      } catch (err) {
        console.error('[auth] Failed to fetch userCode from Herbe ERP:', err)
        session.user.userCode = ''
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})
