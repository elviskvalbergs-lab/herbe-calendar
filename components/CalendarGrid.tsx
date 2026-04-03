'use client'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Activity, CalendarState, ShareVisibility } from '@/types'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import CurrentTimeIndicator from './CurrentTimeIndicator'
import { addDays, format, parseISO, isToday } from 'date-fns'
import { minutesToPx, timeToMinutes, GRID_START_HOUR, GRID_END_HOUR, PX_PER_HOUR } from '@/lib/time'
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
  visibility?: ShareVisibility
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, isLightMode = false, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate,
  onDrillDate, onDrillPerson, visibility
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)
  const [mobileSelectedId, setMobileSelectedId] = useState<string | null>(null)
  const [expandedUp, setExpandedUp] = useState(false)
  const [expandedDown, setExpandedDown] = useState(false)

  // Reset expansion on date/view navigation
  const viewKey = `${state.view}-${state.date}`
  const prevViewKey = useRef(viewKey)
  useEffect(() => {
    if (prevViewKey.current !== viewKey) {
      setExpandedUp(false)
      setExpandedDown(false)
      prevViewKey.current = viewKey
    }
  }, [viewKey])

  // Compute off-grid activity stats for banners
  const { earliestHour, latestHour, beforeCount, afterCount, allDayCount } = useMemo(() => {
    const timed = activities.filter(a => !a.isAllDay)
    let earliest = GRID_START_HOUR
    let latest = GRID_END_HOUR
    let before = 0
    let after = 0
    for (const a of timed) {
      const fromMins = timeToMinutes(a.timeFrom)
      const toMins = timeToMinutes(a.timeTo)
      if (fromMins < GRID_START_HOUR * 60) {
        before++
        earliest = Math.min(earliest, Math.floor(fromMins / 60))
      }
      if (toMins > GRID_END_HOUR * 60) {
        after++
        latest = Math.max(latest, Math.ceil(toMins / 60))
      }
    }
    const allDay = activities.filter(a => a.isAllDay).length
    return { earliestHour: earliest, latestHour: latest, beforeCount: before, afterCount: after, allDayCount: allDay }
  }, [activities])

  const effectiveStartHour = expandedUp ? earliestHour : GRID_START_HOUR
  const effectiveEndHour = expandedDown ? latestHour : GRID_END_HOUR

  // Responsive max visible columns
  const [maxVisibleCols, setMaxVisibleCols] = useState(2)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w >= 640) setMaxVisibleCols(18)
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
    scrollRef.current.scrollTop = minutesToPx((TARGET_HOUR - effectiveStartHour) * 60, scale)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Compensate scroll when grid range changes (expand/contract)
  const prevStartHourRef = useRef(effectiveStartHour)
  useEffect(() => {
    if (!scrollRef.current) return
    const prevStart = prevStartHourRef.current
    if (prevStart !== effectiveStartHour) {
      const deltaHours = prevStart - effectiveStartHour // positive = expanded up (more hours added at top)
      const deltaPx = minutesToPx(deltaHours * 60, scale)
      scrollRef.current.scrollTop += deltaPx
      prevStartHourRef.current = effectiveStartHour
    }
  }, [effectiveStartHour, scale])

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
  const fitsOnScreen = totalColumns <= maxVisibleCols
  // Only set min-width when horizontal scroll needed; otherwise flex handles it
  let colMinVw: number
  if (fitsOnScreen) {
    colMinVw = 0
  } else {
    colMinVw = availableVw / (maxVisibleCols + 0.3)
    colMinVw = Math.max(colMinVw, 12)
    colMinVw = Math.min(colMinVw, 80)
  }

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
        <TimeColumn
          is3Day={state.view === '3day' || state.view === '5day'}
          scale={scale}
          startHour={effectiveStartHour}
          endHour={effectiveEndHour}
          canExpandUp={!expandedUp && beforeCount > 0}
          canExpandDown={!expandedDown && afterCount > 0}
          canContractUp={expandedUp}
          canContractDown={expandedDown}
          onExpandUp={() => setExpandedUp(true)}
          onExpandDown={() => setExpandedDown(true)}
          onContractUp={() => setExpandedUp(false)}
          onContractDown={() => setExpandedDown(false)}
        />

        {dates.map((date, dateIdx) => {
          const isMultiDay = state.view === '3day' || state.view === '5day'
          const dateGroupMinW = personCount * colMinVw
          return (
            <div
              key={date}
              className={`flex-1 ${fitsOnScreen ? '' : 'shrink-0 sm:shrink'} flex flex-col${dateIdx > 0 ? ' border-l-2 border-border' : ''}`}
              style={fitsOnScreen ? undefined : { minWidth: `${dateGroupMinW}vw` }}
            >
              <div className="sticky top-0 z-20 bg-surface">
                {isMultiDay && (
                  <div className="h-6 flex items-center justify-center border-b border-border/40 text-[11px] font-semibold tracking-wide relative">
                    {visibility ? (
                      <span className="text-text-muted">{format(parseISO(date), 'EEE dd/MM')}</span>
                    ) : (
                      <button
                        onClick={() => onDrillDate?.(date)}
                        className="text-text-muted underline decoration-border hover:text-text hover:decoration-text-muted active:text-primary transition-colors"
                        title={`View ${format(parseISO(date), 'EEE dd/MM')} only`}
                      >
                        {format(parseISO(date), 'EEE dd/MM')}
                      </button>
                    )}
                    {!visibility && (
                      <button
                        onClick={() => onNewForDate?.(date)}
                        className="absolute right-1 text-primary font-bold text-sm leading-none hover:opacity-70"
                        title={`New activity on ${format(parseISO(date), 'dd/MM')}`}
                      >+</button>
                    )}
                  </div>
                )}
                <div className="flex h-10">
                  {state.selectedPersons.map((person, personIdx) => {
                    const pa = activities.filter(a => a.personCode === person.code && a.date === date)
                    const hasOffGrid = pa.some(a => !a.isAllDay && (
                      timeToMinutes(a.timeFrom) < effectiveStartHour * 60 ||
                      timeToMinutes(a.timeTo) > effectiveEndHour * 60
                    ))
                    const hasAllDay = pa.some(a => a.isAllDay)
                    const hasIndicator = hasOffGrid || hasAllDay
                    return (
                      <div
                        key={person.code}
                        className={`flex-1 flex items-center justify-center text-xs font-bold border-r border-border last:border-r-0 border-b ${hasIndicator ? 'border-b-red-500' : 'border-b-border'}`}
                        style={{ color: personColor(personIdx), ...(colMinVw > 0 ? { minWidth: `${colMinVw}vw` } : {}) }}
                        title={`${person.name}${person.email ? ` <${person.email}>` : ''}`}
                      >
                        {!visibility && personCount > 1 ? (
                          <button
                            onClick={() => onDrillPerson?.(person.code)}
                            className="underline decoration-border hover:decoration-current active:opacity-70"
                          >
                            {person.code}
                          </button>
                        ) : person.code}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-1 relative">
                {isToday(parseISO(date)) && <CurrentTimeIndicator scale={scale} startHour={effectiveStartHour} />}
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
                      mobileSelectedId={mobileSelectedId}
                      onMobileSelect={setMobileSelectedId}
                      visibility={visibility}
                      startHour={effectiveStartHour}
                      endHour={effectiveEndHour}
                    />
                  )
                })}
              </div>

              {/* Bottom indicator bar — shows per person if they have activities past grid end */}
              <div className="flex sticky bottom-0 z-20 bg-surface">
                {state.selectedPersons.map((person) => {
                  const pa = activities.filter(a => a.personCode === person.code && a.date === date)
                  const hasAfter = pa.some(a => !a.isAllDay && timeToMinutes(a.timeTo) > effectiveEndHour * 60)
                  return (
                    <div
                      key={person.code}
                      className="flex-1 border-r border-border last:border-r-0 relative"
                      style={colMinVw > 0 ? { minWidth: `${colMinVw}vw` } : undefined}
                    >
                      {hasAfter && (
                        <div className="h-px bg-red-500" />
                      )}
                    </div>
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
