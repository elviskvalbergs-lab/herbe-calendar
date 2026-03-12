'use client'
import { useRef, useEffect } from 'react'
import { Activity, CalendarState } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import { addDays, format, parseISO } from 'date-fns'
import { minutesToPx, GRID_START_HOUR } from '@/lib/time'

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
    scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - GRID_START_HOUR) * 60) + HEADER_HEIGHT
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
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-pulse z-20" />
      )}

      <div className="flex min-w-0">
        <TimeColumn />

        {/* For each date, render each person's column */}
        {dates.map(date => (
          <div key={date} className="flex flex-1 min-w-0">
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
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
