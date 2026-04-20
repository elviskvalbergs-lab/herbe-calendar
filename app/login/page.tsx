'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('email', { email, redirect: false, callbackUrl: `${window.location.origin}/cal` })
    setLoading(false)
    if (res?.error === 'AccessDenied') {
      setError('This email is not registered in Herbe. Contact your administrator.')
    } else if (res?.error) {
      setError('Something went wrong. If Herbe ERP is not connected yet, visit /setup.')
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm bg-surface border border-border p-8"
        style={{ borderRadius: 4, boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="mb-1" style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
          <span>herbe</span><span style={{ color: 'var(--burti-rowanberry)' }}>.</span><span>calendar</span>
        </div>
        <p className="b-eyebrow" style={{ marginBottom: 'var(--space-5)' }}>Sign in with your company email</p>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-semibold mb-2">Check your email</p>
            <p className="text-text-muted text-sm">We sent a sign-in link to <strong>{email}</strong></p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="email-input" className="sr-only">Email address</label>
            <input
              id="email-input"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@burti.lv"
              className="input"
              style={{ height: 44, fontSize: 14 }}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg w-full disabled:opacity-50"
              style={{ justifyContent: 'center' }}
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
