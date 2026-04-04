'use client'
import { useState, useEffect } from 'react'

interface TimelineEntry { period: string; event_type: string; count: number }
interface TopUser { user_email: string; total: number; logins: number; created: number; edited: number; days_viewed: number }

export default function AnalyticsClient() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [topUsers, setTopUsers] = useState<TopUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/analytics?from=${from}&to=${to}&groupBy=${groupBy}`)
      .then(r => r.json())
      .then(data => {
        setTimeline(data.timeline ?? [])
        setTopUsers(data.topUsers ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [from, to, groupBy])

  // Aggregate timeline by period for simple bar display
  const periodTotals = new Map<string, Record<string, number>>()
  for (const entry of timeline) {
    const p = periodTotals.get(entry.period) ?? {}
    p[entry.event_type] = (p[entry.event_type] ?? 0) + entry.count
    periodTotals.set(entry.period, p)
  }
  const maxTotal = Math.max(1, ...Array.from(periodTotals.values()).map(p =>
    Object.values(p).reduce((a, b) => a + b, 0)
  ))

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase block mb-0.5">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-bg border border-border rounded-lg px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase block mb-0.5">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-bg border border-border rounded-lg px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase block mb-0.5">Group by</label>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs font-bold">
            {(['day', 'week', 'month'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`px-3 py-1 ${groupBy === g ? 'bg-primary text-white' : 'text-text-muted hover:bg-border/30'}`}
              >{g}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted animate-pulse">Loading analytics...</p>
      ) : (
        <>
          {/* Timeline chart (simple CSS bars) */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Activity Timeline</h2>
            {periodTotals.size === 0 ? (
              <p className="text-xs text-text-muted">No data for this period</p>
            ) : (
              <div className="space-y-1">
                {Array.from(periodTotals.entries()).map(([period, types]) => {
                  const total = Object.values(types).reduce((a, b) => a + b, 0)
                  const pct = (total / maxTotal) * 100
                  return (
                    <div key={period} className="flex items-center gap-2">
                      <span className="text-[10px] text-text-muted w-20 shrink-0 text-right">
                        {new Date(period).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                      <div className="flex-1 h-4 bg-border/20 rounded overflow-hidden">
                        <div className="h-full bg-primary/60 rounded" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-text-muted w-8 text-right">{total}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top users table */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Top Users</h2>
            {topUsers.length === 0 ? (
              <p className="text-xs text-text-muted">No data for this period</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="pb-1">User</th>
                    <th className="pb-1 text-right">Logins</th>
                    <th className="pb-1 text-right">Created</th>
                    <th className="pb-1 text-right">Edited</th>
                    <th className="pb-1 text-right">Days</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map(u => (
                    <tr key={u.user_email} className="border-b border-border/20">
                      <td className="py-1 truncate max-w-[200px]">{u.user_email}</td>
                      <td className="py-1 text-right">{u.logins}</td>
                      <td className="py-1 text-right">{u.created}</td>
                      <td className="py-1 text-right">{u.edited}</td>
                      <td className="py-1 text-right">{u.days_viewed}</td>
                      <td className="py-1 text-right font-bold">{u.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
