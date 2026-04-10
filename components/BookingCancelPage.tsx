'use client'
import { useState, useEffect } from 'react'

interface BookingDetails {
  id: string
  booker_email: string
  booked_date: string
  booked_time: string
  duration_minutes: number
  field_values: Record<string, string>
  status: string
  template_name: string
  custom_fields: { label: string; type: string; required: boolean }[]
  share_link_id: string
  share_token: string
}

export default function BookingCancelPage({ cancelToken }: { cancelToken: string }) {
  const [booking, setBooking] = useState<BookingDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    fetch(`/api/bookings/${cancelToken}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Booking not found' : 'Failed to load booking')
        return r.json()
      })
      .then(data => {
        setBooking(data)
        if (data.status === 'cancelled') setCancelled(true)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [cancelToken])

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/bookings/${cancelToken}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed (${res.status})`)
      }
      setCancelled(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-text-muted animate-pulse">Loading booking...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-4 text-center">
        <p className="text-lg font-semibold">{error}</p>
        <p className="text-text-muted text-sm">The booking may have already been cancelled.</p>
      </div>
    )
  }

  if (!booking) return null

  const date = typeof booking.booked_date === 'string'
    ? booking.booked_date.slice(0, 10)
    : new Date(booking.booked_date).toISOString().slice(0, 10)
  const time = typeof booking.booked_time === 'string'
    ? booking.booked_time.slice(0, 5)
    : ''

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-bold">
            {cancelled ? 'Booking Cancelled' : 'Manage Booking'}
          </h1>
          <p className="text-text-muted text-sm mt-1">
            {booking.template_name}
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-text-muted">Date</span>
            <span className="font-bold">{date}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-text-muted">Time</span>
            <span className="font-bold">{time} ({booking.duration_minutes} min)</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border">
            <span className="text-text-muted">Booked by</span>
            <span>{booking.booker_email}</span>
          </div>
          {Object.entries(booking.field_values ?? {}).map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-border">
              <span className="text-text-muted">{label}</span>
              <span>{value || '—'}</span>
            </div>
          ))}
        </div>

        {cancelled ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-green-500 font-bold">This booking has been cancelled.</p>
            <p className="text-text-muted text-xs">All participants have been notified.</p>
            {booking.share_token && (
              <a
                href={`/book/${booking.share_token}`}
                className="inline-block px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:opacity-90"
              >
                Book a new time
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {booking.share_token && (
              <button
                onClick={async () => {
                  setCancelling(true)
                  try {
                    const res = await fetch(`/api/bookings/${cancelToken}`, { method: 'DELETE' })
                    if (res.ok) {
                      window.location.href = `/book/${booking.share_token}`
                    } else {
                      const data = await res.json().catch(() => ({}))
                      setError(data.error || 'Failed to cancel')
                      setCancelling(false)
                    }
                  } catch (e) {
                    setError(String(e))
                    setCancelling(false)
                  }
                }}
                disabled={cancelling}
                className="w-full py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
              >
                {cancelling ? 'Rescheduling...' : 'Reschedule'}
              </button>
            )}
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full py-2.5 rounded-lg border border-red-500/50 text-red-500 font-bold text-sm hover:bg-red-500/10 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Booking'}
            </button>
            <p className="text-[10px] text-text-muted text-center">
              Reschedule cancels this booking and lets you pick a new time. Cancel removes it entirely.
            </p>
          </div>
        )}

        <div className="text-center pt-2">
          <span className="text-[10px] text-text-muted">
            herbe<span className="text-primary">.</span>calendar
          </span>
        </div>
      </div>
    </div>
  )
}
