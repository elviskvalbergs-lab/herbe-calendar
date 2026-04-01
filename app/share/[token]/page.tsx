import ShareCalendarShell from '@/components/ShareCalendarShell'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ShareCalendarShell token={token} />
}
