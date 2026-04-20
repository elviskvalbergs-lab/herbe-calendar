'use client'
import { useState, useEffect } from 'react'
import { timeToTopPx } from '@/lib/time'

export default function CurrentTimeIndicator({ scale = 1, startHour }: { scale?: number; startHour?: number }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const hh = now.getHours().toString().padStart(2, '0')
  const mm = now.getMinutes().toString().padStart(2, '0')
  const top = timeToTopPx(`${hh}:${mm}`, scale, startHour)

  return (
    <div className="now-line" style={{ top }}>
      <span className="now-label">{`${hh}:${mm}`}</span>
    </div>
  )
}
