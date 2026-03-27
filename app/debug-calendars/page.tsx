import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { graphFetch } from '@/lib/graph/client'
import Link from 'next/link'

export default async function DebugCalendarsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const email = session.user.email
  let calendars: any[] = []
  let error: string | null = null

  try {
    const res = await graphFetch(`/users/${email}/calendars?$select=id,name,owner,canEdit`)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Graph failed: ${res.status} ${err}`)
    }
    const data = await res.json()
    calendars = data.value ?? []
  } catch (e) {
    error = String(e)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Outlook Calendars Debug (Server)</h1>
        <Link 
          href="/debug-calendars"
          className="px-4 py-2 border border-border rounded-lg hover:bg-border text-sm font-bold"
        >
          ↻ Refresh
        </Link>
      </div>

      <div className="p-4 rounded-xl border border-border bg-surface">
        <p className="text-sm text-text-muted">Signed in as: <strong>{email}</strong></p>
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
      ) : !error && (
        <p className="text-text-muted text-center py-12">No calendars found.</p>
      )}

      <div className="pt-6">
        <Link href="/" className="text-primary hover:underline text-sm font-bold">← Back to Calendar</Link>
      </div>
    </div>
  )
}
