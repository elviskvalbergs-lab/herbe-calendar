import BookingCancelPage from '@/components/BookingCancelPage'

export default async function CancelPage({ params }: { params: Promise<{ cancelToken: string }> }) {
  const { cancelToken } = await params
  return <BookingCancelPage cancelToken={cancelToken} />
}
