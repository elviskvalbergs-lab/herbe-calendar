'use client'
import { useState, useEffect, useRef } from 'react'
import {
  format, parseISO, addMonths, subMonths, addDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, getISOWeek, isSameMonth,
  isWithinInterval, isToday,
} from 'date-fns'

interface Props {
  open: boolean
  currentDate: string           // YYYY-MM-DD
  currentView: 'day' | '3day' | '5day' | '7day'
  persons: string[]
  onSelectDate: (date: string) => void
  onSelectWeek: (mondayDate: string) => void
  onClose: () => void
}

type DaySummary = { sources: string[]; count: number }

function sourceColor(source: string): string {
  if (source === 'herbe') return '#228B22'
  if (source === 'outlook') return '#6264a7'
  if (source === 'google') return '#4285f4'
  if (source.startsWith('google-user:')) return '#34a853'
  return '#888'
}

export default function MonthNavigator({
  open,
  currentDate,
  currentView,
  persons,
  onSelectDate,
  onSelectWeek,
  onClose,
}: Props) {
  const [displayMonth, setDisplayMonth] = useState<string>(() =>
    currentDate.slice(0, 7)
  )
  const [summary, setSummary] = useState<Record<string, DaySummary>>({})
  const [loading, setLoading] = useState(false)
  const touchStart = useRef<{ x: number } | null>(null)

  // Reset displayMonth whenever the overlay opens
  useEffect(() => {
    if (open) {
      setDisplayMonth(currentDate.slice(0, 7))
    }
  }, [open, currentDate])

  // Fetch activity summary
  useEffect(() => {
    if (!open || persons.length === 0) return
    setLoading(true)
    fetch(`/api/activities/summary?persons=${persons.join(',')}&month=${displayMonth}`)
      .then(r => (r.ok ? r.json() : {}))
      .then((data: Record<string, DaySummary>) => setSummary(data))
      .catch(() => setSummary({}))
      .finally(() => setLoading(false))
  }, [open, displayMonth, persons.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Calendar grid
  const monthStart = startOfMonth(parseISO(`${displayMonth}-01`))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  // Current view highlight range
  const viewDays =
    currentView === '7day' ? 7
    : currentView === '5day' ? 5
    : currentView === '3day' ? 3
    : 1
  const rangeStart = parseISO(currentDate)
  const rangeEnd = addDays(rangeStart, viewDays - 1)

  function goToPrevMonth() {
    setDisplayMonth(m => format(subMonths(parseISO(`${m}-01`), 1), 'yyyy-MM'))
  }

  function goToNextMonth() {
    setDisplayMonth(m => format(addMonths(parseISO(`${m}-01`), 1), 'yyyy-MM'))
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return
    const deltaX = e.changedTouches[0].clientX - touchStart.current.x
    touchStart.current = null
    if (deltaX > 50) goToPrevMonth()
    else if (deltaX < -50) goToNextMonth()
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center pt-16 px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-4"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header: prev / month+year / next */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goToPrevMonth}
            className="text-text-muted px-2 py-1 rounded hover:bg-border text-lg font-bold"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="flex items-center gap-1">
            <select
              value={displayMonth.slice(5, 7)}
              onChange={e => setDisplayMonth(`${displayMonth.slice(0, 4)}-${e.target.value}`)}
              className="bg-transparent text-sm font-bold cursor-pointer focus:outline-none appearance-none text-center"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0')
                return <option key={m} value={m}>{format(new Date(2026, i), 'MMMM')}</option>
              })}
            </select>
            <select
              value={displayMonth.slice(0, 4)}
              onChange={e => setDisplayMonth(`${e.target.value}-${displayMonth.slice(5, 7)}`)}
              className="bg-transparent text-sm font-bold cursor-pointer focus:outline-none appearance-none text-center"
            >
              {Array.from({ length: 11 }, (_, i) => {
                const y = String(new Date().getFullYear() - 2 + i)
                return <option key={y} value={y}>{y}</option>
              })}
            </select>
            {loading && (
              <span className="inline-block w-3 h-3 border-2 border-border border-t-primary rounded-full animate-spin" />
            )}
          </div>
          <button
            onClick={goToNextMonth}
            className="text-text-muted px-2 py-1 rounded hover:bg-border text-lg font-bold"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-[2rem_repeat(7,1fr)] text-[10px] text-text-muted font-bold mb-1">
          <div className="text-center">W</div>
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0])
          const monday = format(week[0], 'yyyy-MM-dd')
          return (
            <div key={wi} className="grid grid-cols-[2rem_repeat(7,1fr)] items-center">
              {/* Week number */}
              <button
                onClick={() => onSelectWeek(monday)}
                className="text-[10px] text-text-muted hover:text-primary font-bold text-center py-1"
                title={`Week ${weekNum} → 7-day view`}
              >
                {weekNum}
              </button>

              {/* Day cells */}
              {week.map((day, di) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const inMonth = isSameMonth(day, monthStart)
                const today = isToday(day)
                const inRange = isWithinInterval(day, { start: rangeStart, end: rangeEnd })
                const daySummary = summary[dateStr]

                return (
                  <button
                    key={di}
                    onClick={() => onSelectDate(dateStr)}
                    className={[
                      'flex flex-col items-center py-1 rounded-lg text-xs transition-colors',
                      !inMonth ? 'opacity-30' : '',
                      inRange ? 'bg-primary/15' : 'hover:bg-border/50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold',
                        today ? 'bg-primary text-white' : '',
                      ].join(' ')}
                    >
                      {format(day, 'd')}
                    </span>

                    {/* Source dots */}
                    {daySummary && daySummary.sources.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {daySummary.sources.slice(0, 4).map((src, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: sourceColor(src) }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}

      </div>
    </div>
  )
}
