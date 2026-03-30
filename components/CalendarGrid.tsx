'use client'
import { useRef, useEffect } from 'react'
import { Activity, CalendarState } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import CurrentTimeIndicator from './CurrentTimeIndicator'
import { addDays, format, parseISO, isToday } from 'date-fns'
import { minutesToPx, GRID_START_HOUR, PX_PER_HOUR } from '@/lib/time'
import { personColor } from '@/lib/colors'

interface Props {
  state: CalendarState
  activities: Activity[]
  loading: boolean
  sessionUserCode?: string
  getActivityColor: (activity: Activity) => string
  getTypeName?: (typeCode: string) => string
  scale?: number
  onRefresh: () => void
  onNavigate: (dir: 'prev' | 'next') => void
  onSlotClick: (personCode: string, time: string, date: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
  onNewForDate?: (date: string) => void
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const prevScaleRef = useRef(scale)

  // Auto-scroll to 08:00 on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const TARGET_HOUR = 8
    scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - GRID_START_HOUR) * 60, scale)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve scroll position proportionally when zoom changes
  useEffect(() => {
    if (!scrollRef.current) return
    const prev = prevScaleRef.current
    if (prev !== scale) {
      const ratio = scale / prev
      scrollRef.current.scrollTop = scrollRef.current.scrollTop * ratio
      prevScaleRef.current = scale
    }
  }, [scale])

  // Build date list for current view
  const viewDays = state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
  const dates = viewDays === 1
    ? [state.date]
    : Array.from({ length: viewDays }, (_, i) =>
        format(addDays(parseISO(state.date), i), 'yyyy-MM-dd')
      )

  // Touch gesture: pull-down to refresh (when at top) or swipe left/right to navigate days
  const touchStart = useRef({ x: 0, y: 0, atTop: false })
  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      atTop: (scrollRef.current?.scrollTop ?? 1) === 0,
    }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      // Horizontal swipe — navigate days
      onNavigate(dx < 0 ? 'next' : 'prev')
    } else if (dy > 60 && touchStart.current.atTop) {
      // Pull down at top — refresh
      onRefresh()
    }
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
        <TimeColumn is3Day={state.view === '3day' || state.view === '5day'} scale={scale} />

        {/* For each date, a grouped column with shared header */}
        {dates.map((date, dateIdx) => {
          const isMultiDay = state.view === '3day' || state.view === '5day'
          // In multi-day views use narrower columns so they don't overflow portrait
          const colMinW = state.view === '5day' ? 'min-w-[22vw] sm:min-w-0' : state.view === '3day' ? 'min-w-[30vw] sm:min-w-0' : 'min-w-[44vw] sm:min-w-0'
          return (
            <div
              key={date}
              className={`flex-1 min-w-0 flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
            >
              {/* Sticky two-row header for this day */}
              <div className="sticky top-0 z-20 bg-surface">
                {isMultiDay && (
                  <div className="h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold text-text-muted tracking-wide relative">
                    {format(parseISO(date), 'EEE dd/MM')}
                    <button
                      onClick={() => onNewForDate?.(date)}
                      className="absolute right-1 text-primary font-bold text-sm leading-none hover:opacity-70"
                      title={`New activity on ${format(parseISO(date), 'dd/MM')}`}
                    >+</button>
                  </div>
                )}
                <div className="flex border-b border-border h-10">
                  {state.selectedPersons.map((person, personIdx) => (
                    <div
                      key={person.code}
                      className={`flex-1 ${isMultiDay ? colMinW : ''} flex items-center justify-center text-xs font-bold border-r border-border last:border-r-0`}
                      style={{ color: personColor(personIdx) }}
                      title={`${person.name}${person.email ? ` <${person.email}>` : ''}`}
                    >
                      {person.code}
                    </div>
                  ))}
                </div>
              </div>

              {/* Person columns (body only, no header) */}
              <div className="flex flex-1 relative">
                {isToday(parseISO(date)) && <CurrentTimeIndicator scale={scale} />}
                {state.selectedPersons.map((person, personIdx) => {
                  const personActivities = activities.filter(
                    a => a.personCode === person.code && a.date === date
                  )
                  return (
                    <PersonColumn
                      key={person.code}
                      personCode={person.code}
                      date={date}
                      activities={personActivities}
                      sessionUserCode={sessionUserCode}
                      getActivityColor={getActivityColor}
                      getTypeName={getTypeName}
                      scale={scale}
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
