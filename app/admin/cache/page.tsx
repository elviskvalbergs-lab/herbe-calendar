import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import { getAllSyncStates } from '@/lib/cache/syncState'
import AdminShell from '@/components/AdminShell'
import CacheClient from './CacheClient'

export default async function CachePage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const [accounts, syncStates] = await Promise.all([
    session.isSuperAdmin ? getAllAccounts() : Promise.resolve([]),
    getAllSyncStates(session.accountId).catch(() => []),
  ])

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Cache</h1>
      <CacheClient initialSyncStates={syncStates} />
    </AdminShell>
  )
}
