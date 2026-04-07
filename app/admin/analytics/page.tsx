import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import AnalyticsClient from './AnalyticsClient'

export default async function AnalyticsPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Analytics</h1>
      <AnalyticsClient />
    </AdminShell>
  )
}
