import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getImpersonation } from '@/lib/impersonation'
import CalendarShell from '@/components/CalendarShell'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import ErrorBoundary from '@/components/ErrorBoundary'

export default async function CalendarPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const impersonation = await getImpersonation()

  const userCode = impersonation?.active
    ? impersonation.targetUserCode
    : (session.user.userCode ?? '')

  return (
    <ErrorBoundary>
      {impersonation?.active && (
        <ImpersonationBanner
          targetEmail={impersonation.targetEmail}
          originalEmail={impersonation.originalEmail}
        />
      )}
      <CalendarShell userCode={userCode} companyCode={process.env.HERBE_COMPANY_CODE ?? '1'} />
    </ErrorBoundary>
  )
}
