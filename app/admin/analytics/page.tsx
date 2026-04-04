import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import AdminShell from '@/components/AdminShell'
import AnalyticsClient from './AnalyticsClient'

export default async function AnalyticsPage() {
  let session
  try {
    session = await requireAdminSession()
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/')
  }

  return (
    <AdminShell email={session.email} accountName={session.accountName} isSuperAdmin={session.isSuperAdmin}>
      <h1 className="text-xl font-bold mb-6">Analytics</h1>
      <AnalyticsClient />
    </AdminShell>
  )
}
