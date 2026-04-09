import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import ConfigClient from '../../config/ConfigClient'

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params
  let session
  try {
    session = await requireAdminSession('superadmin')
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/admin')
  }

  // Load account info
  const { rows: accountRows } = await pool.query(
    'SELECT id, slug, display_name FROM tenant_accounts WHERE id = $1',
    [accountId]
  )
  if (accountRows.length === 0) redirect('/admin/accounts')
  const account = accountRows[0]

  // Load configs for this specific account
  const { rows: azureRows } = await pool.query(
    'SELECT tenant_id, client_id, sender_email FROM account_azure_config WHERE account_id = $1',
    [accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: erpRows } = await pool.query(
    `SELECT id, name, api_base_url, company_code, client_id, username, active, created_at, serp_uuid
     FROM account_erp_connections WHERE account_id = $1 ORDER BY name`,
    [accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: smtpRows } = await pool.query(
    'SELECT host, port, username, sender_email, sender_name, use_tls FROM account_smtp_config WHERE account_id = $1',
    [accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: googleRows } = await pool.query(
    'SELECT service_account_email, admin_email, domain FROM account_google_config WHERE account_id = $1',
    [accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: memberRows } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active = true)::int AS active
     FROM account_members WHERE account_id = $1`,
    [accountId]
  ).catch(() => ({ rows: [{ total: 0, active: 0 }] }))

  return (
    <AdminShell email={session.email} accountName={`${account.display_name} (managing)`} accountId={accountId} isSuperAdmin={session.isSuperAdmin}>
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin/accounts" className="text-text-muted hover:text-text text-sm">← Accounts</a>
        <h1 className="text-xl font-bold">{account.display_name}</h1>
        <span className="text-xs text-text-muted font-mono">{account.slug}</span>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 mb-6">
        <div className="flex items-center gap-6 text-sm">
          <div><span className="text-text-muted">Members:</span> <span className="font-bold">{memberRows[0]?.active ?? 0}</span> active / {memberRows[0]?.total ?? 0} total</div>
          <div><span className="text-text-muted">ERP connections:</span> <span className="font-bold">{erpRows.length}</span></div>
          <div><span className="text-text-muted">Azure:</span> <span className="font-bold">{azureRows.length > 0 ? 'configured' : 'not set'}</span></div>
        </div>
      </div>

      <h2 className="text-lg font-bold mb-4">Connections</h2>
      <ConfigClient
        azure={azureRows[0] ?? null}
        erpConnections={erpRows}
        smtp={smtpRows[0] ?? null}
        google={googleRows[0] ?? null}
      />
    </AdminShell>
  )
}
