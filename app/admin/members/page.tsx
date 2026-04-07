import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import MembersClient from './MembersClient'

export default async function MembersPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  const { rows: members } = await pool.query(
    `SELECT am.email, am.role, am.active, am.last_login, am.created_at,
            pc.generated_code, pc.display_name, pc.source
     FROM account_members am
     LEFT JOIN person_codes pc ON pc.email = am.email AND pc.account_id = am.account_id
     WHERE am.account_id = $1
     ORDER BY am.active DESC, pc.display_name ASC NULLS LAST`,
    [session.accountId]
  )

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Members</h1>
      <MembersClient members={members} accountId={session.accountId} />
    </AdminShell>
  )
}
