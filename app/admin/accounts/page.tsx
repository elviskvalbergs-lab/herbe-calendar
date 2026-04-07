import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import AccountsClient from './AccountsClient'

export default async function AccountsPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('superadmin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/admin')
  }
  const accounts = await getAllAccounts()

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Accounts</h1>
      <AccountsClient />
    </AdminShell>
  )
}
