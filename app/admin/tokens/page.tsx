import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import TokensClient from './TokensClient'

export default async function TokensPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  const { rows: tokens } = await pool.query(
    `SELECT id, name, scope, created_by, created_at, last_used, expires_at, revoked_at
     FROM api_tokens WHERE account_id = $1
     ORDER BY created_at DESC`,
    [session.accountId]
  )

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">API Tokens</h1>
      <TokensClient tokens={tokens} isSuperAdmin={session.isSuperAdmin} />
    </AdminShell>
  )
}
