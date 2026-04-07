import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LandingPage from './landing/page'

export default async function HomePage() {
  const session = await auth()
  if (session) redirect('/cal')
  return <LandingPage />
}
