import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import ConfigClient from './ConfigClient'

export default async function ConfigPage() {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/')
  }

  // Load Azure config (redact secrets)
  const { rows: azureRows } = await pool.query(
    'SELECT tenant_id, client_id, sender_email FROM account_azure_config WHERE account_id = $1',
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  // Load ERP connections (redact secrets)
  const { rows: erpRows } = await pool.query(
    `SELECT id, name, api_base_url, company_code, client_id, username, active, created_at, serp_uuid
     FROM account_erp_connections WHERE account_id = $1 ORDER BY name`,
    [session.accountId]
  ).catch(() => ({ rows: [] }))

  const azure = azureRows[0] ?? null
  const erpConnections = erpRows

  return (
    <AdminShell email={session.email} accountName={session.accountName} isSuperAdmin={session.isSuperAdmin}>
      <h1 className="text-xl font-bold mb-6">Connections</h1>
      <ConfigClient azure={azure} erpConnections={erpConnections} />
    </AdminShell>
  )
}
