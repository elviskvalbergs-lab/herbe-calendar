import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getImpersonation } from '@/lib/impersonation'
import { requireSession } from '@/lib/herbe/auth-guard'
import CalendarShell from '@/components/CalendarShell'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import ErrorBoundary from '@/components/ErrorBoundary'

export default async function CalendarPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const impersonation = await getImpersonation()

  let userCode: string
  let accountId: string
  if (impersonation?.active) {
    userCode = impersonation.targetUserCode
    accountId = impersonation.targetAccountId ?? ''
  } else {
    try {
      const sess = await requireSession()
      userCode = sess.userCode
      accountId = sess.accountId
    } catch {
      userCode = (session.user.userCode ?? '')
      accountId = ''
    }
  }

  return (
    <ErrorBoundary>
      {impersonation?.active && (
        <ImpersonationBanner
          targetEmail={impersonation.targetEmail}
          originalEmail={impersonation.originalEmail}
        />
      )}
      <CalendarShell userCode={userCode} companyCode={process.env.HERBE_COMPANY_CODE ?? '1'} accountId={accountId} />
    </ErrorBoundary>
  )
}
