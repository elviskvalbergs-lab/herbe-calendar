'use client'
import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'
import { useViewerTimezone } from '@/lib/useViewerTimezone'
import type { SyncState } from '@/lib/cache/syncState'

interface Props {
  initialSyncStates: SyncState[]
}

export default function CacheClient({ initialSyncStates }: Props) {
  const viewerTz = useViewerTimezone()
  function formatTs(value: Date | string | null): string {
    if (!value) return '—'
    const d = typeof value === 'string' ? new Date(value) : value
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: viewerTz })
  }
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [nukeAll, setNukeAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { confirmState, confirm: showConfirm, handleConfirm, handleCancel } = useConfirm()

  async function handleForceSync() {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/sync/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo }),
      })
      const data = await res.json()
      setMessage(res.ok ? `Cache refreshed: ${data.eventsUpserted} events synced` : `Error: ${data.error}`)
    } catch (e) {
      setMessage(`Error: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleNukeCache() {
    setLoading(true)
    setMessage(null)
    try {
      const body = nukeAll ? { all: true } : { dateFrom, dateTo }
      if (!nukeAll && (!dateFrom || !dateTo)) {
        setMessage('Enter a date range or check "Clear all"')
        setLoading(false)
        return
      }
      const res = await fetch('/api/sync/nuke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`Cache cleared: ${data.eventsDeleted} events removed`)
        setNukeAll(false)
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setMessage(`Error: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {initialSyncStates.length > 0 && (
        <section className="bg-surface border border-border rounded-xl p-4">
          <h2 className="text-sm font-bold mb-3">Sync status</h2>
          <div className="space-y-2">
            {initialSyncStates.map(s => (
              <div key={`${s.source}:${s.connectionId}`} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.syncStatus === 'idle' ? 'bg-green-500' : s.syncStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-text-muted truncate">{s.source} / {s.connectionId || '(default)'}</span>
                </div>
                <div className="flex gap-3 text-text-muted shrink-0">
                  <span title="Last incremental sync">last: {formatTs(s.lastSyncAt)}</span>
                  <span title="Last full reconciliation">full: {formatTs(s.lastFullSyncAt)}</span>
                  {s.errorMessage && <span className="text-red-500 truncate max-w-[200px]" title={s.errorMessage}>err</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">Re-sync date range</h2>
        <p className="text-text-muted text-xs mb-3">
          ERP data syncs automatically. Use this to force a refresh for a specific date range.
        </p>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-text">
            From
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-border bg-bg text-text text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text">
            To
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-border bg-bg text-text text-xs" />
          </label>
          <button onClick={handleForceSync} disabled={loading || !dateFrom || !dateTo}
            className="px-3 py-1.5 rounded-md bg-primary text-white text-xs whitespace-nowrap disabled:opacity-50">
            {loading ? 'Syncing…' : 'Re-sync range'}
          </button>
        </div>
      </section>

      <section className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">Clear cached data</h2>
        <p className="text-text-muted text-xs mb-3">
          Removes cached ERP data. The next automatic sync will repopulate it.
          Use the date range above to clear a specific period, or check below to clear everything.
        </p>
        <label className="flex items-center gap-2 text-xs text-text mb-3">
          <input type="checkbox" checked={nukeAll} onChange={e => setNukeAll(e.target.checked)} />
          Clear ALL cached data (ignores date range)
        </label>
        <button
          onClick={() => showConfirm(
            nukeAll
              ? 'This will delete ALL cached ERP data. The next sync cycle will re-populate it. Continue?'
              : `This will delete cached ERP data from ${dateFrom} to ${dateTo}. Continue?`,
            handleNukeCache,
            { confirmLabel: 'Clear cache', destructive: true }
          )}
          disabled={loading || (!nukeAll && (!dateFrom || !dateTo))}
          className="px-3 py-1.5 rounded-md border border-error text-error text-xs disabled:opacity-50"
        >
          Clear cache
        </button>
      </section>

      {message && (
        <p className={`text-xs ${message.startsWith('Error') ? 'text-error' : 'text-text-muted'}`}>
          {message}
        </p>
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}
