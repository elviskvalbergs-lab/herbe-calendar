'use client'
import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
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
  holidays?: { dates: Record<string, { name: string; country: string }[]>; personCountries: Record<string, string> }
}

export default function CalendarGrid({
  state, activities, loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, isLightMode = false, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate,
  onDrillDate, onDrillPerson, visibility, holidays
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

  // Responsive max visible columns.
  // - Desktop / tablet: 18 (effectively fits any reasonable view).
  // - Phone (portrait or landscape): 5 — so 1D/3-person fits edge-to-edge
  //   via flex (total ≤ 5), and 3-day view scrolls with ~2.5 person-columns
  //   per date visible at once.
  const [maxVisibleCols, setMaxVisibleCols] = useState(5)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      setMaxVisibleCols(w >= 640 ? 18 : 5)
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

  // When grid expands up, scroll to show the newly visible hours
  // When grid contracts up, keep view stable
  const prevStartHourRef = useRef(effectiveStartHour)
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    const prevStart = prevStartHourRef.current
    if (prevStart !== effectiveStartHour) {
      const expanded = effectiveStartHour < prevStart // expanded up = earlier hours added
      if (expanded) {
        // Scroll to top to show the new early hours
        scrollRef.current.scrollTop = 0
      } else {
        // Contracted up — keep view stable by subtracting removed height
        const deltaHours = prevStart - effectiveStartHour
        const deltaPx = minutesToPx(deltaHours * 60, scale)
        scrollRef.current.scrollTop += deltaPx
      }
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
  const viewDays = state.view === '7day' ? 7 : state.view === '5day' ? 5 : state.view === '3day' ? 3 : 1
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
      {/* Subtle loading indicator — thin animated bar at top */}
      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <div className="absolute top-0 left-0 right-0 z-30 h-0.5 overflow-hidden">
            <div className="h-full" style={{ width: '30%', background: 'var(--app-accent)', animation: 'loading-slide 1s ease-in-out infinite alternate', position: 'relative' }} />
            <style>{`@keyframes loading-slide { from { margin-left: 0% } to { margin-left: 70% } }`}</style>
          </div>
        )}
      </div>

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
          is3Day={state.view !== 'day'}
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
          const isMultiDay = state.view !== 'day'
          const dateGroupMinW = personCount * colMinVw
          const d = parseISO(date)
          const isCurrentDay = isToday(d)
          return (
            <div
              key={date}
              className={`flex-1 ${fitsOnScreen ? '' : 'shrink-0 sm:shrink'} flex flex-col`}
              style={{
                ...(fitsOnScreen ? undefined : { minWidth: `${dateGroupMinW}vw` }),
                ...(dateIdx > 0 ? { borderLeft: '1px solid var(--app-line-strong)' } : undefined),
              }}
            >
              <div
                className={`day-col-header sticky top-0 z-20${isCurrentDay ? ' today' : ''}`}
                style={{
                  background: 'var(--app-bg-alt)',
                  borderBottom: '1px solid var(--app-line)',
                  padding: '4px 8px 0',
                  minWidth: 0,
                }}
              >
                <div className="flex items-center justify-between gap-1" style={{ minHeight: 20 }}>
                  {isMultiDay ? (
                    visibility ? (
                      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--app-fg-subtle)' }}>
                        {format(d, 'EEE')}
                      </span>
                    ) : (
                      <button
                        onClick={() => onDrillDate?.(date)}
                        style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--app-fg-subtle)' }}
                        className="hover:text-text transition-colors"
                        title={`View ${format(d, 'EEE dd/MM')} only`}
                      >
                        {format(d, 'EEE')}
                      </button>
                    )
                  ) : <span />}
                  <span
                    style={{
                      fontSize: isMultiDay ? 15 : 18,
                      fontWeight: 700,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.1,
                      color: isCurrentDay ? 'var(--app-accent)' : 'var(--app-fg)',
                    }}
                  >
                    {format(d, isMultiDay ? 'd' : 'EEE d MMM')}
                  </span>
                  {!visibility && isMultiDay ? (
                    <button
                      onClick={() => onNewForDate?.(date)}
                      className="icon-btn"
                      style={{ width: 18, height: 18, fontSize: 14, lineHeight: 1, color: 'var(--app-accent)' }}
                      title={`New activity on ${format(d, 'dd/MM')}`}
                    >+</button>
                  ) : <span />}
                </div>
                {/* Sub-persons rail */}
                <div
                  style={{
                    display: 'grid',
                    gridAutoFlow: 'column',
                    gridAutoColumns: '1fr',
                    marginTop: 4,
                    marginLeft: -8,
                    marginRight: -8,
                    borderTop: '1px solid var(--app-line)',
                  }}
                >
                  {state.selectedPersons.map((person, personIdx) => {
                    const pcolor = personColor(personIdx)
                    const pa = activities.filter(a => a.personCode === person.code && a.date === date)
                    const hasOffGrid = pa.some(a => !a.isAllDay && (
                      timeToMinutes(a.timeFrom) < effectiveStartHour * 60 ||
                      timeToMinutes(a.timeTo) > effectiveEndHour * 60
                    ))
                    const hasAllDay = pa.some(a => a.isAllDay)
                    const borderBottomColor = hasOffGrid ? '#ef4444' : hasAllDay ? '#e0a83c' : 'transparent'
                    return (
                      <div
                        key={person.code}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '3px 6px 2px',
                          textAlign: 'center',
                          borderLeft: personIdx === 0 ? `2px solid ${pcolor}` : `1px solid var(--app-line)`,
                          borderBottom: `2px solid ${borderBottomColor}`,
                          color: pcolor,
                          background: `color-mix(in oklab, ${pcolor} 12%, transparent)`,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          ...(colMinVw > 0 ? { minWidth: `${colMinVw}vw` } : {}),
                        }}
                        title={`${person.name}${person.email ? ` <${person.email}>` : ''}`}
                      >
                        {!visibility && personCount > 1 ? (
                          <button
                            onClick={() => onDrillPerson?.(person.code)}
                            className="active:opacity-70"
                            style={{ color: 'inherit' }}
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
                      isHoliday={(() => {
                        const cc = holidays?.personCountries?.[person.code]
                        if (!cc) return false
                        return holidays?.dates?.[date]?.some(h => h.country === cc) ?? false
                      })()}
                      holidayName={(() => {
                        const cc = holidays?.personCountries?.[person.code]
                        if (!cc) return undefined
                        return holidays?.dates?.[date]?.find(h => h.country === cc)?.name
                      })()}
                    />
                  )
                })}
              </div>

              {/* Bottom indicator bar — per-person off-grid-after marker */}
              <div className="flex sticky bottom-0 z-20" style={{ background: 'var(--app-bg-alt)' }}>
                {state.selectedPersons.map((person) => {
                  const pa = activities.filter(a => a.personCode === person.code && a.date === date)
                  const hasAfter = pa.some(a => !a.isAllDay && timeToMinutes(a.timeTo) > effectiveEndHour * 60)
                  return (
                    <div
                      key={person.code}
                      className="flex-1 relative"
                      style={{ borderRight: '1px solid var(--app-line)', ...(colMinVw > 0 ? { minWidth: `${colMinVw}vw` } : {}) }}
                    >
                      {hasAfter && <div style={{ height: 1, background: '#ef4444' }} />}
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
