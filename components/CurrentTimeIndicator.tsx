'use client'
import { useState, useEffect } from 'react'
import { timeToTopPx } from '@/lib/time'

export default function CurrentTimeIndicator({ scale = 1 }: { scale?: number }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const top = timeToTopPx(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`, scale)

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
      style={{ top }}
    >
      <div className="w-2 h-2 rounded-full bg-primary ml-[-4px]" />
      <div className="flex-1 h-[1.5px] bg-primary/40" />
    </div>
  )
}
