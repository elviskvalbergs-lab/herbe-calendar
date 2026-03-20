'use client'
import { useRef, useEffect } from 'react'
import { Activity, CalendarState } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import { addDays, format, parseISO } from 'date-fns'
import { minutesToPx, GRID_START_HOUR } from '@/lib/time'
import { personColor } from '@/lib/colors'

interface Props {
  state: CalendarState
  activities: Activity[]
  loading: boolean
  sessionUserCode?: string
  onRefresh: () => void
  onSlotClick: (personCode: string, time: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '',
  onRefresh, onSlotClick, onActivityClick, onActivityUpdate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to 08:00 on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const HEADER_HEIGHT = 40
    const TARGET_HOUR = 8
    scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - GRID_START_HOUR) * 60)
  }, [])

  // Build date list for current view
  const dates = state.view === 'day'
    ? [state.date]
    : Array.from({ length: 3 }, (_, i) =>
        format(addDays(parseISO(state.date), i), 'yyyy-MM-dd')
      )

  // Pull-to-refresh via touch
  let touchStartY = 0
  function handleTouchStart(e: React.TouchEvent) {
    if (scrollRef.current?.scrollTop === 0) touchStartY = e.touches[0].clientY
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].clientY - touchStartY
    if (delta > 60 && scrollRef.current?.scrollTop === 0) onRefresh()
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {loading && (
        <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center pointer-events-auto">
          <div className="bg-surface border border-border rounded-xl px-5 py-3 text-sm font-bold text-text-muted animate-pulse">
            Loading…
          </div>
        </div>
      )}

      <div className="flex min-w-0">
        <TimeColumn is3Day={state.view === '3day'} />

        {/* For each date, a grouped column with shared header */}
        {dates.map((date, dateIdx) => {
          const is3Day = state.view === '3day'
          // In 3-day view use narrower columns so they don't overflow portrait
          const colMinW = is3Day ? 'min-w-[30vw] sm:min-w-0' : 'min-w-[44vw] sm:min-w-0'
          return (
            <div
              key={date}
              className={`flex-1 min-w-0 flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
            >
              {/* Sticky two-row header for this day */}
              <div className="sticky top-0 z-10 bg-surface">
                {is3Day && (
                  <div className="h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold text-text-muted tracking-wide">
                    {format(parseISO(date), 'EEE dd/MM')}
                  </div>
                )}
                <div className="flex border-b border-border h-10">
                  {state.selectedPersons.map((person, personIdx) => (
                    <div
                      key={person.code}
                      className={`flex-1 ${colMinW} flex items-center justify-center text-xs font-bold border-r border-border last:border-r-0`}
                      style={{ color: personColor(personIdx) }}
                    >
                      {person.code}
                    </div>
                  ))}
                </div>
              </div>

              {/* Person columns (body only, no header) */}
              <div className="flex flex-1">
                {state.selectedPersons.map((person, personIdx) => {
                  const personActivities = activities.filter(
                    a => a.personCode === person.code && a.date === date
                  )
                  return (
                    <PersonColumn
                      key={person.code}
                      personCode={person.code}
                      personIndex={personIdx}
                      date={date}
                      activities={personActivities}
                      sessionUserCode={sessionUserCode}
                      onSlotClick={onSlotClick}
                      onActivityClick={onActivityClick}
                      onActivityUpdate={onActivityUpdate}
                      colMinW={colMinW}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
