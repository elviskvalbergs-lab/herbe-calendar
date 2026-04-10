import BookingStandalone from '@/components/BookingStandalone'

export default async function BookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <BookingStandalone token={token} />
}
