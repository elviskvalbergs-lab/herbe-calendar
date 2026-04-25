import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts, getAccountLogoUrl } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'

export default async function DashboardPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []
  const accountLogoUrl = await getAccountLogoUrl(session.accountId)

  // Fetch dashboard stats
  const accountId = session.accountId
  const [memberStats, recentLogins, activityStats] = await Promise.all([
    pool.query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active = true)::int AS active
       FROM account_members WHERE account_id = $1`,
      [accountId]
    ).then(r => r.rows[0] ?? { total: 0, active: 0 }).catch(() => ({ total: 0, active: 0 })),

    pool.query<{ email: string; last_login: string }>(
      `SELECT email, last_login FROM account_members
       WHERE account_id = $1 AND last_login IS NOT NULL
       ORDER BY last_login DESC LIMIT 10`,
      [accountId]
    ).then(r => r.rows).catch(() => []),

    pool.query<{ event_type: string; cnt: number }>(
      `SELECT event_type, COUNT(*)::int AS cnt FROM analytics_events
       WHERE account_id = $1 AND event_date >= CURRENT_DATE - 30
       GROUP BY event_type`,
      [accountId]
    ).then(r => r.rows).catch(() => []),
  ])

  const statsByType = Object.fromEntries(activityStats.map(r => [r.event_type, r.cnt]))

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} accountLogoUrl={accountLogoUrl ?? undefined} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <a href="/admin/members"><StatCard label="Members" value={memberStats.active} sub={`${memberStats.total} total`} /></a>
        <StatCard label="Logins (30d)" value={statsByType['login'] ?? 0} />
        <StatCard label="Created (30d)" value={statsByType['activity_created'] ?? 0} />
        <StatCard label="Edited (30d)" value={statsByType['activity_edited'] ?? 0} />
      </div>

      {/* Recent logins */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">Recent Logins</h2>
        {recentLogins.length === 0 ? (
          <p className="text-xs text-text-muted">No login data yet</p>
        ) : (
          <div className="space-y-1.5">
            {recentLogins.map(r => (
              <div key={r.email} className="flex justify-between text-xs">
                <span className="text-text-muted truncate">{r.email}</span>
                <span className="text-text-muted shrink-0 ml-2">
                  {new Date(r.last_login).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
      {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
    </div>
  )
}
