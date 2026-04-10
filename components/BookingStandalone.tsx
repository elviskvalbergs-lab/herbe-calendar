'use client'
import { useState, useEffect } from 'react'
import BookingPage from './BookingPage'

interface Template {
  id: string
  name: string
  duration_minutes: number
  custom_fields: { label: string; type: string; required: boolean }[]
}

export default function BookingStandalone({ token }: { token: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Link not found' : r.status === 410 ? 'Link expired' : 'Failed to load')
        return r.json()
      })
      .then(data => {
        if (!data.bookingEnabled || !data.templates?.length) {
          setError('Booking is not available on this link.')
          return
        }
        setTemplates(data.templates)
      })
      .catch(e => setError(e.message))
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">{error}</p>
          <p className="text-text-muted text-sm">Contact the person who shared this link.</p>
        </div>
      </div>
    )
  }

  if (!templates) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-muted animate-pulse">Loading...</p>
      </div>
    )
  }

  return (
    <BookingPage
      token={token}
      templates={templates}
      onBack={() => window.close()}
    />
  )
}
