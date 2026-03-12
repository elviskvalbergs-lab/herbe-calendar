import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from 'pg'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { sendMail } from '@/lib/graph/client'
import type { EmailConfig } from 'next-auth/providers/email'
import { AccessDenied } from '@auth/core/errors'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function isEmailRegistered(email: string): Promise<{ registered: boolean; userCode: string }> {
  const users = await herbeFetchAll(REGISTERS.users, {}, 500)
  const lower = email.toLowerCase()
  const user = users.find((u) => {
    const r = u as Record<string, unknown>
    return (
      String(r['emailAddr'] ?? '').toLowerCase() === lower ||
      String(r['LoginEmailAddr'] ?? '').toLowerCase() === lower
    )
  }) as Record<string, unknown> | undefined
  if (!user) return { registered: false, userCode: '' }
  return { registered: true, userCode: String(user['Code'] ?? '') }
}

const emailProvider: EmailConfig = {
  id: 'email',
  type: 'email',
  name: 'Email',
  from: process.env.AZURE_SENDER_EMAIL!,
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier: email, url }) {
    let registered: boolean
    try {
      const result = await isEmailRegistered(email)
      registered = result.registered
    } catch (e) {
      if ((e as Error).message === 'HERBE_NOT_CONFIGURED') {
        throw new Error('HERBE_NOT_CONFIGURED')
      }
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
       <p>If you did not request this, you can safely ignore this email.</p>`
    )
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
