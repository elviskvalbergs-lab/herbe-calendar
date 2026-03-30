'use client'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function DebugAuthPage() {
  const { data: session, status } = useSession()

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Auth Debug</h1>
      <div className="p-4 rounded-xl border border-border bg-surface space-y-4">
        <p><strong>Status:</strong> {status}</p>
        <p><strong>Session:</strong></p>
        <pre className="bg-bg p-4 rounded-lg overflow-auto text-xs">
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>

      <div className="flex gap-4">
        <Link href="/login" className="px-4 py-2 rounded-lg bg-primary text-white font-bold">Go to Login</Link>
        <Link href="/" className="px-4 py-2 rounded-lg border border-border hover:bg-border font-bold">Back to Calendar</Link>
      </div>
      
      <p className="text-sm text-text-muted">
        If you see "authenticated" but the session is null, try signing in again. 
        If you see "unauthenticated", you definitely need to sign in.
      </p>
    </div>
  )
}
