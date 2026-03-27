'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function DebugCalendarsPage() {
  const { data: session, status } = useSession()
  const [calendars, setCalendars] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      loadCalendars()
    }
  }, [status])

  async function loadCalendars() {
    setLoading(true)
    setError(null)
    try {
      // Use the existing API route or a modified one
      const res = await fetch('/api/outlook/debug-calendars')
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to fetch')
      setCalendars(data.calendars || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') return <div className="p-8">Verifying session...</div>
  
  if (status === 'unauthenticated') {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-bold text-red-500">Not Signed In</h1>
        <p>You must be signed in to view your calendars.</p>
        <Link href="/login" className="px-4 py-2 bg-primary text-white rounded-lg inline-block">Sign In</Link>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Outlook Calendars Debug</h1>
        <button 
          onClick={loadCalendars} 
          disabled={loading}
          className="px-4 py-2 border border-border rounded-lg hover:bg-border text-sm font-bold"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      <div className="p-4 rounded-xl border border-border bg-surface">
        <p className="text-sm text-text-muted">Signed in as: <strong>{session?.user?.email}</strong></p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {calendars.length > 0 ? (
        <div className="grid gap-3">
          {calendars.map(cal => (
            <div key={cal.id} className="p-4 rounded-xl border border-border bg-surface flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-bold">{cal.name}</h3>
                <p className="text-xs text-text-muted font-mono">{cal.id}</p>
                <div className="flex gap-4 text-xs">
                  <span>Owner: <strong>{cal.owner?.address}</strong></span>
                  <span>Can Edit: <strong>{cal.canEdit ? 'Yes' : 'No'}</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !loading && (
        <p className="text-text-muted text-center py-12">No calendars found.</p>
      )}

      <div className="pt-6">
        <Link href="/" className="text-primary hover:underline text-sm font-bold">← Back to Calendar</Link>
      </div>
    </div>
  )
}
