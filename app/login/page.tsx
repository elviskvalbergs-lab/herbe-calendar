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
    const res = await signIn('email', { email, redirect: false })
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
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border p-8">
        <h1 className="text-2xl font-bold mb-1">herbe<span className="text-primary">.</span>calendar</h1>
        <p className="text-text-muted text-sm mb-6">Sign in with your company email</p>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <p className="font-semibold mb-2">Check your email</p>
            <p className="text-text-muted text-sm">We sent a sign-in link to <strong>{email}</strong></p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@burti.lv"
              className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:border-primary"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
