import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import ConfigClient from './ConfigClient'

export default async function ConfigPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  const { rows: azureRows } = await pool.query(
    'SELECT tenant_id, client_id, sender_email FROM account_azure_config WHERE account_id = $1',
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: erpRows } = await pool.query(
    `SELECT id, name, api_base_url, company_code, client_id, username, active, created_at, serp_uuid
     FROM account_erp_connections WHERE account_id = $1 ORDER BY name`,
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: smtpRows } = await pool.query(
    'SELECT host, port, username, sender_email, sender_name, use_tls FROM account_smtp_config WHERE account_id = $1',
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  const { rows: googleRows } = await pool.query(
    'SELECT service_account_email, admin_email, domain FROM account_google_config WHERE account_id = $1',
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Connections</h1>
      <ConfigClient
        azure={azureRows[0] ?? null}
        erpConnections={erpRows}
        smtp={smtpRows[0] ?? null}
        google={googleRows[0] ?? null}
      />
    </AdminShell>
  )
}
