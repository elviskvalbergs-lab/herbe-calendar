'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { format, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { Activity, CalendarState, ShareVisibility } from '@/types'
import CalendarGrid from './CalendarGrid'
import MonthView from './MonthView'
// BookingPage is now a standalone route at /book/[token]
import { OUTLOOK_COLOR, FALLBACK_COLOR } from '@/lib/activityColors'
import { personColor } from '@/lib/colors'

type ShareView = 'day' | '3day' | '5day' | '7day' | 'month'

interface ShareConfig {
  view: ShareView
  personCodes: string[]
  visibility: ShareVisibility
  favoriteName: string
  hasPassword: boolean
  bookingEnabled?: boolean
  templates?: { id: string; name: string; duration_minutes: number; custom_fields: { label: string; type: string; required: boolean }[] }[]
}

function viewStepDays(view: ShareView): number {
  switch (view) {
    case '3day': return 3
    case '5day': return 5
    case '7day': return 7
    default: return 1
  }
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
  const [holidays, setHolidays] = useState<{ dates: Record<string, { name: string; country: string }[]>; personCountries: Record<string, string> }>({ dates: {}, personCountries: {} })
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [subscribeCopied, setSubscribeCopied] = useState(false)
  // bookingMode removed — booking is now at /book/[token]
  const dateInputRef = useRef<HTMLInputElement>(null)

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
    let dateFrom: string
    let dateTo: string
    if (config.view === 'month') {
      const anchor = parseISO(date)
      dateFrom = format(startOfMonth(anchor), 'yyyy-MM-dd')
      dateTo = format(endOfMonth(anchor), 'yyyy-MM-dd')
    } else {
      dateFrom = date
      dateTo = format(addDays(parseISO(date), viewStepDays(config.view) - 1), 'yyyy-MM-dd')
    }
    const url = `/api/share/${token}/activities?dateFrom=${dateFrom}&dateTo=${dateTo}`
    const headers: Record<string, string> = {}
    if (verifiedPassword) headers['x-share-auth'] = verifiedPassword
    try {
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setActivities(data)
        } else {
          setActivities(data.activities ?? [])
          if (data.holidays) setHolidays(data.holidays)
        }
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
    if (config?.view === 'month') {
      const forward = dir === 'next' || dir === 'next-multi'
      setDate(d => format(forward ? addMonths(parseISO(d), 1) : subMonths(parseISO(d), 1), 'yyyy-MM-dd'))
      return
    }
    const step = (dir === 'prev-multi' || dir === 'next-multi') ? viewStepDays(config?.view ?? 'day') : 1
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

  // bookingMode no longer used — booking is a separate page

  const state: CalendarState = {
    view: config.view,
    date,
    selectedPersons: config.personCodes.map(code => ({ code, name: code, email: '' })),
  }

  const isMonth = config.view === 'month'
  const formattedDate = isMonth ? format(parseISO(date), 'MMMM yyyy') : format(parseISO(date), 'd MMM yyyy')
  const viewStep = isMonth ? 1 : viewStepDays(config.view)
  const showMultiNav = viewStep > 1 || isMonth

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-1 lg:gap-2 px-2 lg:px-3 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
        {/* Logo */}
        <span className="font-bold text-base mr-auto pr-0.5 lg:pr-1">
          herbe<span className="text-primary">.</span>calendar
        </span>

        {/* Multi-day / month back */}
        {showMultiNav && (
          <button
            onClick={() => navigate('prev-multi')}
            className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
            title={isMonth ? 'Previous month' : `Back ${viewStep} days`}
          >«</button>
        )}
        {/* Single step back */}
        <button
          onClick={() => navigate('prev')}
          className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
          title={isMonth ? 'Previous month' : 'Previous day'}
        >‹</button>
        {/* Date picker */}
        <button
          onClick={() => dateInputRef.current?.showPicker()}
          className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-sm font-semibold whitespace-nowrap relative"
          title="Pick a date"
        >
          {formattedDate}
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={e => { if (e.target.value) setDate(e.target.value) }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            tabIndex={-1}
          />
        </button>
        {/* Single step forward */}
        <button
          onClick={() => navigate('next')}
          className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
          title={isMonth ? 'Next month' : 'Next day'}
        >›</button>
        {/* Multi-day / month forward */}
        {showMultiNav && (
          <button
            onClick={() => navigate('next-multi')}
            className="text-text-muted px-1.5 lg:px-2 py-1.5 rounded border border-border hover:bg-border text-sm leading-none font-bold"
            title={isMonth ? 'Next month' : `Forward ${viewStep} days`}
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
        {/* Subscribe */}
        {!config.hasPassword && (
          <button
            onClick={() => {
              const url = `${window.location.origin}/api/share/${token}/feed.ics`
              navigator.clipboard.writeText(url)
              setSubscribeCopied(true)
              setTimeout(() => setSubscribeCopied(false), 2000)
            }}
            className="text-text-muted px-1.5 lg:px-2 py-1 rounded border border-border hover:bg-border text-xs font-bold ml-1"
            title="Copy ICS calendar subscription link — paste in Apple Calendar, Outlook, or Google Calendar to subscribe"
          >
            {subscribeCopied ? 'ICS link copied!' : 'Subscribe (ICS)'}
          </button>
        )}
        {config.bookingEnabled && config.templates && config.templates.length > 0 && (
          <a
            href={`/book/${token}`}
            className="px-2.5 lg:px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-90 ml-1 no-underline"
          >
            Book a Meeting
          </a>
        )}
      </header>

      {/* Calendar */}
      {isMonth ? (
        <MonthView
          activities={activities}
          date={date}
          holidays={holidays}
          personCode={config.personCodes[0] ?? ''}
          personCount={config.personCodes.length}
          getActivityColor={getColor}
          loading={loading}
          onSelectDate={(d) => setDate(d)}
          onSelectWeek={(monday) => setDate(monday)}
          onSelectedDayChange={(d) => setDate(d)}
          onNavigateMonth={(dir) => {
            setDate(d => format(dir > 0 ? addMonths(parseISO(d), 1) : subMonths(parseISO(d), 1), 'yyyy-MM-dd'))
          }}
        />
      ) : (
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
          holidays={holidays}
        />
      )}
    </div>
  )
}
