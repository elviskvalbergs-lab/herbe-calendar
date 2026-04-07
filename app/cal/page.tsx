import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CalendarShell from '@/components/CalendarShell'
import ErrorBoundary from '@/components/ErrorBoundary'

export default async function CalendarPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <ErrorBoundary>
      <CalendarShell userCode={session.user.userCode ?? ''} companyCode={process.env.HERBE_COMPANY_CODE ?? '1'} />
    </ErrorBoundary>
  )
}
