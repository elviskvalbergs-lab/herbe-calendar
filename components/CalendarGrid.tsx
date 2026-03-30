'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
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
  isLightMode?: boolean
  onRefresh: () => void
  onNavigate: (dir: 'prev' | 'next') => void
  onSlotClick: (personCode: string, time: string, date: string) => void
  onActivityClick: (activity: Activity) => void
  onActivityUpdate: () => void
  onNewForDate?: (date: string) => void
  onDrillDate?: (date: string) => void
  onDrillPerson?: (personCode: string) => void
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, isLightMode = false, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate,
  onDrillDate, onDrillPerson
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)

  // Responsive max visible columns
  const [maxVisibleCols, setMaxVisibleCols] = useState(2)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w >= 640) setMaxVisibleCols(12)
      else if (w > h) setMaxVisibleCols(5)
      else setMaxVisibleCols(2)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

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

  // --- Column sizing ---
  const personCount = state.selectedPersons.length
  const totalColumns = personCount * dates.length
  const availableVw = 90
  let colMinVw: number
  if (totalColumns <= maxVisibleCols) {
    colMinVw = availableVw / totalColumns
  } else {
    colMinVw = availableVw / (maxVisibleCols + 0.3)
  }
  colMinVw = Math.max(colMinVw, 12)
  colMinVw = Math.min(colMinVw, 80)

  // --- Edge navigation buttons (visible on mobile when scrolled to edge) ---
  const [atLeft, setAtLeft] = useState(true)
  const [atRight, setAtRight] = useState(false)
  const needsHScroll = totalColumns > maxVisibleCols

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtLeft(el.scrollLeft <= 1)
    setAtRight(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateEdges, { passive: true })
    updateEdges()
    return () => el.removeEventListener('scroll', updateEdges)
  }, [updateEdges])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto relative"
    >
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center pointer-events-auto">
          <div className="bg-surface border border-border rounded-xl px-5 py-3 text-sm font-bold text-text-muted animate-pulse">
            Loading…
          </div>
        </div>
      )}

      {/* Edge navigation: prev button (left edge) */}
      {atLeft && needsHScroll && (
        <button
          onClick={() => onNavigate('prev')}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 lg:hidden
            w-8 h-20 flex items-center justify-center
            bg-primary/80 text-white rounded-r-xl shadow-lg
            active:bg-primary transition-opacity"
          aria-label={`Previous ${viewDays} days`}
        >
          <span className="flex flex-col items-center gap-0.5">
            <span className="text-lg leading-none">‹</span>
            <span className="text-[8px]">−{viewDays}d</span>
          </span>
        </button>
      )}

      {/* Edge navigation: next button (right edge) */}
      {atRight && needsHScroll && (
        <button
          onClick={() => onNavigate('next')}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 lg:hidden
            w-8 h-20 flex items-center justify-center
            bg-primary/80 text-white rounded-l-xl shadow-lg
            active:bg-primary transition-opacity"
          aria-label={`Next ${viewDays} days`}
        >
          <span className="flex flex-col items-center gap-0.5">
            <span className="text-lg leading-none">›</span>
            <span className="text-[8px]">+{viewDays}d</span>
          </span>
        </button>
      )}

      <div className="flex">
        <TimeColumn is3Day={state.view === '3day' || state.view === '5day'} scale={scale} />

        {dates.map((date, dateIdx) => {
          const isMultiDay = state.view === '3day' || state.view === '5day'
          const dateGroupMinW = personCount * colMinVw
          return (
            <div
              key={date}
              className={`flex-1 shrink-0 sm:shrink flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
              style={{ minWidth: `${dateGroupMinW}vw` }}
            >
              <div className="sticky top-0 z-20 bg-surface">
                {isMultiDay && (
                  <div className="h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold tracking-wide relative">
                    <button
                      onClick={() => onDrillDate?.(date)}
                      className="text-text-muted underline decoration-border hover:text-text hover:decoration-text-muted active:text-primary transition-colors"
                      title={`View ${format(parseISO(date), 'EEE dd/MM')} only`}
                    >
                      {format(parseISO(date), 'EEE dd/MM')}
                    </button>
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
                      className="flex-1 flex items-center justify-center text-xs font-bold border-r border-border last:border-r-0"
                      style={{ color: personColor(personIdx), minWidth: `${colMinVw}vw` }}
                      title={`${person.name}${person.email ? ` <${person.email}>` : ''}`}
                    >
                      {personCount > 1 ? (
                        <button
                          onClick={() => onDrillPerson?.(person.code)}
                          className="underline decoration-border hover:decoration-current active:opacity-70"
                        >
                          {person.code}
                        </button>
                      ) : person.code}
                    </div>
                  ))}
                </div>
              </div>

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
                      isLightMode={isLightMode}
                      colMinVw={colMinVw}
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
