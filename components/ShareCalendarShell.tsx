'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { Activity, CalendarState, ShareVisibility } from '@/types'
import CalendarGrid from './CalendarGrid'
import { OUTLOOK_COLOR, FALLBACK_COLOR } from '@/lib/activityColors'
import { personColor } from '@/lib/colors'

interface ShareConfig {
  view: 'day' | '3day' | '5day'
  personCodes: string[]
  visibility: ShareVisibility
  favoriteName: string
  hasPassword: boolean
}

interface Props {
  token: string
}

export default function ShareCalendarShell({ token }: Props) {
  const [config, setConfig] = useState<ShareConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [verifiedPassword, setVerifiedPassword] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // Build person-to-color map based on personCodes order
  const personColorMap = useMemo(() => {
    if (!config) return {}
    return Object.fromEntries(config.personCodes.map((code, i) => [code, personColor(i)]))
  }, [config])

  function getColor(a: Activity): string {
    if (a.icsColor) return a.icsColor
    if (a.source === 'outlook') return OUTLOOK_COLOR
    return personColorMap[a.personCode] ?? FALLBACK_COLOR
  }

  // Fetch link metadata on mount
  useEffect(() => {
    async function fetchMeta() {
      try {
        const res = await fetch(`/api/share/${token}`)
        if (res.status === 410) { setError('This link has expired'); return }
        if (res.status === 404) { setError('Link not found'); return }
        const data = await res.json()
        if (data.hasPassword) {
          setNeedsPassword(true)
          setLoading(false)
          return
        }
        setConfig(data)
      } catch {
        setError('Failed to load calendar')
      }
    }
    fetchMeta()
  }, [token])

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!config) return
    setLoading(true)
    const step = config.view === '5day' ? 4 : config.view === '3day' ? 2 : 0
    const dateFrom = date
    const dateTo = format(addDays(parseISO(date), step), 'yyyy-MM-dd')
    const url = `/api/share/${token}/activities?dateFrom=${dateFrom}&dateTo=${dateTo}`
    const headers: Record<string, string> = {}
    if (verifiedPassword) headers['x-share-auth'] = verifiedPassword
    try {
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        setActivities(data)
      }
    } finally {
      setLoading(false)
    }
  }, [config, date, token, verifiedPassword])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    const res = await fetch(`/api/share/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.status === 403) {
      setPasswordError('Invalid password')
      return
    }
    const data = await res.json()
    setVerifiedPassword(password)
    setConfig(data)
    setNeedsPassword(false)
  }

  function navigate(dir: 'prev' | 'next' | 'prev-multi' | 'next-multi') {
    const viewStep = config?.view === '5day' ? 5 : config?.view === '3day' ? 3 : 1
    const step = (dir === 'prev-multi' || dir === 'next-multi') ? viewStep : 1
    const forward = dir === 'next' || dir === 'next-multi'
    setDate(d =>
      format(
        forward ? addDays(parseISO(d), step) : subDays(parseISO(d), step),
        'yyyy-MM-dd'
      )
    )
  }

  // Error screen
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 px-4 text-center">
        <p className="text-lg font-semibold">{error}</p>
        <p className="text-text-muted text-sm">Contact the person who shared this link.</p>
      </div>
    )
  }

  // Password screen
  if (needsPassword) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-4">
        <p className="text-base font-semibold">This calendar is password protected</p>
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            className="px-3 py-2 rounded border border-border bg-surface text-text text-sm focus:outline-none focus:border-primary"
            autoFocus
          />
          {passwordError && (
            <p className="text-red-500 text-xs">{passwordError}</p>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-white rounded text-sm font-semibold hover:opacity-90"
          >
            Open calendar
          </button>
        </form>
      </div>
    )
  }

  // Loading screen
  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  const state: CalendarState = {
    view: config.view,
    date,
    selectedPersons: config.personCodes.map(code => ({ code, name: code, email: '' })),
  }

  const formattedDate = (() => {
    const step = config.view === '5day' ? 4 : config.view === '3day' ? 2 : 0
    if (step === 0) return format(parseISO(date), 'd MMM yyyy')
    const endDate = addDays(parseISO(date), step)
    return `${format(parseISO(date), 'd MMM')} – ${format(endDate, 'd MMM yyyy')}`
  })()

  const viewStep = config.view === '5day' ? 5 : config.view === '3day' ? 3 : 1

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-1 lg:gap-2 px-2 lg:px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
        {/* Logo */}
        <span className="font-bold text-base mr-auto pr-0.5 lg:pr-1">
          herbe<span className="text-primary">.</span>calendar
        </span>

        {/* Multi-day back */}
        {viewStep > 1 && (
          <button
            onClick={() => navigate('prev-multi')}
            className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
            title={`Back ${viewStep} days`}
          >«</button>
        )}
        {/* Single day back */}
        <button
          onClick={() => navigate('prev')}
          className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
          title="Previous day"
        >‹</button>
        {/* Date display */}
        <span className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border text-sm font-semibold whitespace-nowrap">
          {formattedDate}
        </span>
        {/* Single day forward */}
        <button
          onClick={() => navigate('next')}
          className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
          title="Next day"
        >›</button>
        {/* Multi-day forward */}
        {viewStep > 1 && (
          <button
            onClick={() => navigate('next-multi')}
            className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
            title={`Forward ${viewStep} days`}
          >»</button>
        )}
        {/* Today */}
        <button
          onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}
          className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-xs font-bold"
          title="Today"
        >
          Today
        </button>
      </header>

      {/* Calendar */}
      <div className="flex-1 overflow-hidden">
        <CalendarGrid
          state={state}
          activities={activities}
          loading={loading}
          getActivityColor={getColor}
          onRefresh={fetchActivities}
          onNavigate={navigate}
          onSlotClick={() => {}}
          onActivityClick={() => {}}
          onActivityUpdate={() => {}}
          visibility={config.visibility}
        />
      </div>
    </div>
  )
}
