'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'viewerTimezone'

function readStorage(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Riga'
  } catch {
    return 'Europe/Riga'
  }
}

/**
 * Resolve the viewer's timezone for date rendering.
 * Order: localStorage override (set by Settings modal) → browser TZ → Europe/Riga.
 *
 * Returns a stable initial value during SSR/first paint, then updates after
 * mount once we can read localStorage.
 */
export function useViewerTimezone(): string {
  const [tz, setTz] = useState<string>(browserTimezone)
  useEffect(() => {
    const fromStorage = readStorage()
    if (fromStorage) setTz(fromStorage)
  }, [])
  return tz
}
