import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import AdminShell from '@/components/AdminShell'
import AccountsClient from './AccountsClient'

export default async function AccountsPage() {
  let session
  try {
    session = await requireAdminSession('superadmin')
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/admin')
  }

  return (
    <AdminShell email={session.email} accountName={session.accountName} isSuperAdmin={session.isSuperAdmin}>
      <h1 className="text-xl font-bold mb-6">Accounts</h1>
      <AccountsClient />
    </AdminShell>
  )
}
