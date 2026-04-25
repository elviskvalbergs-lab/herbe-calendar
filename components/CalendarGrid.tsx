'use client'
import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import { Activity, CalendarState, ShareVisibility } from '@/types'
import type { Task } from '@/types/task'
import TimeColumn from './TimeColumn'
import PersonColumn from './PersonColumn'
import CurrentTimeIndicator from './CurrentTimeIndicator'
import MultiDayStrip from './MultiDayStrip'
import { addDays, format, parseISO, isToday } from 'date-fns'
import { minutesToPx, timeToMinutes, GRID_START_HOUR, GRID_END_HOUR, PX_PER_HOUR } from '@/lib/time'
import { personColor } from '@/lib/colors'

interface Props {
  state: CalendarState
  activities: Activity[]
  tasks?: Task[]
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
  onSwitchToMonth?: () => void
  onTaskToggle?: (task: Task, next: boolean) => void
  onTaskClick?: (task: Task) => void
  visibility?: ShareVisibility
  holidays?: { dates: Record<string, { name: string; country: string }[]>; personCountries: Record<string, string> }
}

export default function CalendarGrid({
  state, activities, tasks = [], loading, sessionUserCode = '', getActivityColor, getTypeName,
  scale = 1, isLightMode = false, onRefresh, onNavigate, onSlotClick, onActivityClick, onActivityUpdate, onNewForDate,
  onDrillDate, onDrillPerson, onSwitchToMonth, onTaskToggle, onTaskClick, visibility, holidays
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)
  const [mobileSelectedId, setMobileSelectedId] = useState<string | null>(null)
  const [expandedUp, setExpandedUp] = useState(false)
  const [expandedDown, setExpandedDown] = useState(false)
  const [stripCollapsed, setStripCollapsed] = useState<boolean>(false)
  useEffect(() => {
    try { setStripCollapsed(localStorage.getItem('herbe-strip-collapsed') === '1') } catch {}
  }, [])
  const toggleStrip = useCallback(() => {
    setStripCollapsed(v => {
      const next = !v
      try { localStorage.setItem('herbe-strip-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

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

  // --- Compute the all-day band geometry across every (date, person) pair so
  // each sub-cell of the band lands at the same height. The band shows, per
  // person column: the holiday for that person's country, that person's
  // all-day activities, and (only in the session user's column) tasks whose
  // dueDate matches.
  const ROW_H = 20
  const ROW_GAP = 2
  const BAND_PAD = 8
  const COLLAPSED_BAND_HEIGHT = 24
  const bandPerDate = useMemo(() => {
    return dates.map(date => {
      const allDay = activities.filter(a => a.isAllDay && a.date === date)
      const dayTasks = tasks.filter(t => t.dueDate === date && !t.done)
      // Compute per-person rows so the max accounts for the person with the
      // most stacked items in any (date, person) cell.
      const perPersonRows = state.selectedPersons.map(p => {
        const cc = holidays?.personCountries?.[p.code]
        const hol = cc ? holidays?.dates?.[date]?.find(h => h.country === cc) : undefined
        const personAllDayCount = allDay.filter(a => a.personCode === p.code).length
        const personTaskCount = sessionUserCode === p.code ? dayTasks.length : 0
        return (hol ? 1 : 0) + personAllDayCount + personTaskCount
      })
      const cellMax = perPersonRows.reduce((m, n) => Math.max(m, n), 0)
      return { date, allDay, dayTasks, cellMax }
    })
  }, [dates, activities, tasks, holidays, state.selectedPersons, sessionUserCode])
  const maxBandRows = bandPerDate.reduce((max, b) => Math.max(max, b.cellMax), 0)
  const totalAllDayInBand = bandPerDate.reduce((s, b) => s + b.allDay.length, 0)
  const totalTasksInBand = bandPerDate.reduce((s, b) => s + b.dayTasks.length, 0)
  const expandedBandHeight = maxBandRows > 0
    ? maxBandRows * ROW_H + (maxBandRows - 1) * ROW_GAP + BAND_PAD
    : 0
  const bandHeightPx = stripCollapsed ? COLLAPSED_BAND_HEIGHT : expandedBandHeight

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

      {/* Mobile time-jump side tabs — stacked at left edge, always visible. */}
      <div className="time-jump-tabs lg:hidden">
        <button
          type="button"
          onClick={() => onNavigate('prev')}
          className="tj-tab"
          aria-label={`Previous ${viewDays} days`}
        >
          −{viewDays}d
        </button>
        <button
          type="button"
          onClick={() => onNavigate('next')}
          className="tj-tab"
          aria-label={`Next ${viewDays} days`}
        >
          +{viewDays}d
        </button>
      </div>

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
          bandHeight={bandHeightPx}
          bandCollapsed={stripCollapsed}
          bandTotalAllDay={totalAllDayInBand}
          bandTotalTasks={totalTasksInBand}
          onToggleBand={(totalAllDayInBand + totalTasksInBand) > 0 ? toggleStrip : undefined}
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
                // minWidth: 0 prevents long all-day chip text inside the strip
                // from expanding the date column past its flex-1 share. The
                // chips already truncate via overflow:hidden + text-ellipsis.
                minWidth: fitsOnScreen ? 0 : `${dateGroupMinW}vw`,
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
                  {!visibility && isMultiDay ? (
                    <button
                      onClick={() => onDrillDate?.(date)}
                      className="hover:underline transition-colors"
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                        color: isCurrentDay ? 'var(--app-accent)' : 'var(--app-fg)',
                        cursor: 'pointer',
                      }}
                      title={`View ${format(d, 'EEE dd/MM')} only`}
                    >
                      {format(d, 'd')}
                    </button>
                  ) : (
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
                  )}
                  {!visibility && isMultiDay ? (
                    <button
                      onClick={() => onNewForDate?.(date)}
                      className="icon-btn"
                      style={{ width: 18, height: 18, fontSize: 14, lineHeight: 1, color: 'var(--app-accent)' }}
                      title={`New activity on ${format(d, 'dd/MM')}`}
                    >+</button>
                  ) : !visibility && !isMultiDay && onSwitchToMonth ? (
                    <div className="segmented" title="Switch view" style={{ height: 22 }}>
                      <button aria-pressed={true} disabled style={{ height: 18, fontSize: 10, padding: '0 6px' }}>Day</button>
                      <button aria-pressed={false} onClick={() => onSwitchToMonth?.()} style={{ height: 18, fontSize: 10, padding: '0 6px' }}>Agenda</button>
                    </div>
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

              {/* Multi-day / all-day / tasks strip — per-column, between header and body.
                  Heights are equalized via bandHeightPx so the band reads as a
                  single row. When collapsed it shrinks to a thin marker row matching
                  TimeColumn's collapsed gutter. */}
              {(() => {
                const bd = bandPerDate.find(b => b.date === date)
                if (!bd) return null
                if (stripCollapsed) {
                  return (
                    <div
                      onClick={toggleStrip}
                      style={{
                        height: COLLAPSED_BAND_HEIGHT,
                        background: 'var(--app-bg-alt)',
                        borderBottom: '1px solid var(--app-line)',
                        borderRight: '1px solid var(--app-line)',
                        cursor: 'pointer',
                      }}
                      title="Expand all-day band"
                    />
                  )
                }
                return (
                  <MultiDayStrip
                    date={date}
                    persons={state.selectedPersons}
                    sessionUserCode={sessionUserCode}
                    allDayActivities={bd.allDay}
                    tasks={bd.dayTasks}
                    holidays={holidays}
                    collapsed={false}
                    minBodyHeight={expandedBandHeight}
                    getActivityColor={getActivityColor}
                    onActivityClick={onActivityClick}
                    onTaskToggle={onTaskToggle}
                    onTaskClick={onTaskClick}
                  />
                )
              })()}

              {/* Morning outside-hours bar — reserve a uniform slot across
                  all columns whenever any column has early events, so the
                  hour grid below stays vertically aligned. Per-column shows
                  the count + earliest time only where this date has events. */}
              {!expandedUp && beforeCount > 0 && (() => {
                const dayBefore = activities.filter(a =>
                  !a.isAllDay && a.date === date &&
                  timeToMinutes(a.timeFrom) < effectiveStartHour * 60
                )
                if (dayBefore.length === 0) {
                  return <div className="ohbar-btn ohbar-morning ohbar-empty" aria-hidden="true" />
                }
                const earliest = dayBefore.reduce((min, a) => {
                  const m = timeToMinutes(a.timeFrom)
                  return m < min ? m : min
                }, effectiveStartHour * 60)
                const hh = String(Math.floor(earliest / 60)).padStart(2, '0')
                const mm = String(earliest % 60).padStart(2, '0')
                return (
                  <button
                    type="button"
                    onClick={() => setExpandedUp(true)}
                    className="ohbar-btn ohbar-morning"
                    title="Expand morning hours"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    <span className="ohbar-count">{dayBefore.length} event{dayBefore.length !== 1 ? 's' : ''}</span>
                    <span className="ohbar-time">· from {hh}:{mm}</span>
                  </button>
                )
              })()}

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

              {/* Evening outside-hours bar — uniform-slot reservation
                  identical to the morning bar. */}
              {!expandedDown && afterCount > 0 && (() => {
                const dayAfter = activities.filter(a =>
                  !a.isAllDay && a.date === date &&
                  timeToMinutes(a.timeTo) > effectiveEndHour * 60
                )
                if (dayAfter.length === 0) {
                  return <div className="ohbar-btn ohbar-evening ohbar-empty" aria-hidden="true" />
                }
                const latest = dayAfter.reduce((max, a) => {
                  const m = timeToMinutes(a.timeTo)
                  return m > max ? m : max
                }, effectiveEndHour * 60)
                const hh = String(Math.floor(latest / 60)).padStart(2, '0')
                const mm = String(latest % 60).padStart(2, '0')
                return (
                  <button
                    type="button"
                    onClick={() => setExpandedDown(true)}
                    className="ohbar-btn ohbar-evening"
                    title="Expand evening hours"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    <span className="ohbar-count">{dayAfter.length} event{dayAfter.length !== 1 ? 's' : ''}</span>
                    <span className="ohbar-time">· until {hh}:{mm}</span>
                  </button>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
