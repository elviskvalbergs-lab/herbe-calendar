import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CalendarShell from '@/components/CalendarShell'

export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <CalendarShell userCode={session.user.userCode ?? ''} />
}
