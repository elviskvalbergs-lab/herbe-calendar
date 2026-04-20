'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay,
} from 'date-fns'
import type { Activity } from '@/types'

interface HolidayData {
  dates: Record<string, { name: string; country: string }[]>
  personCountries: Record<string, string>
}

interface Props {
  activities: Activity[]
  date: string
  holidays: HolidayData
  personCode: string
  getActivityColor: (activity: Activity) => string
  onSelectDate: (date: string) => void
  onSelectWeek: (monday: string) => void
  onSelectedDayChange?: (date: string) => void
  onActivityClick?: (activity: Activity) => void
  onNavigateMonth?: (dir: 1 | -1) => void
  loading?: boolean
  isLightMode?: boolean
  personCount?: number
  dayViewPanel?: React.ReactNode
}

export default function MonthView({
  activities, date, holidays, personCode, getActivityColor,
  onSelectDate, onSelectedDayChange, onActivityClick, loading, personCount = 1, dayViewPanel, onNavigateMonth,
}: Props) {
  const selectedDay = date
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const [hoveredEvent, setHoveredEvent] = useState<Activity | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxChips, setMaxChips] = useState(4)
  const monthStart = startOfMonth(parseISO(selectedDay))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Layout mode: portrait (narrow), landscape (short wide), desktop (full)
  const [layout, setLayout] = useState<'portrait' | 'landscape' | 'desktop'>('portrait')
  const [splitWidth, setSplitWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 600
    const saved = localStorage.getItem('monthViewSplitWidth')
    return saved ? Number(saved) : Math.round(window.innerWidth * 0.58)
  })
  const isDraggingRef = useRef(false)
  const latestWidthRef = useRef(splitWidth)

  useEffect(() => {
    function check() {
      const w = window.innerWidth
      const h = window.innerHeight
      if (w >= 768 && h >= 500) setLayout('desktop')
      else if (w > h) setLayout('landscape')
      else setLayout('portrait')
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check) }
  }, [])

  const isDesktop = layout === 'desktop'
  // Agenda is visible in every layout now (portrait stacks it below the grid via CSS).
  const showSide = true

  // Dynamic fit — measure cell height to decide how many chips fit
  useEffect(() => {
    function calc() {
      if (!gridRef.current) return
      // 6 rows of cells
      const rowH = gridRef.current.clientHeight / 6
      // cell: ~24px day-num row + ~4px padding + ~16px "+N more" reserve + 2px gap per chip
      // chip row height ≈ 18px (14px line + 4px padding)
      const chipH = 18
      const reserve = 24 + 4 + 16
      const available = Math.max(0, rowH - reserve)
      const fit = Math.max(1, Math.floor(available / chipH))
      setMaxChips(fit)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [layout, splitWidth])

  // On non-desktop, restrict to selected person
  const filteredActivities = useMemo(() => {
    if (isDesktop) return activities
    return activities.filter(a => !a.personCode || a.personCode === personCode)
  }, [activities, isDesktop, personCode])

  // Activities by date (deduped)
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>()
    const seen = new Set<string>()
    for (const a of filteredActivities) {
      if (!a.date) continue
      const key = `${a.id}:${a.date}`
      if (seen.has(key)) continue
      seen.add(key)
      const existing = map.get(a.date) ?? []
      existing.push(a)
      map.set(a.date, existing)
    }
    // Sort each day: all-day first, then by start time
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1
        if (!a.isAllDay && b.isAllDay) return 1
        return (a.timeFrom ?? '').localeCompare(b.timeFrom ?? '')
      })
    }
    return map
  }, [filteredActivities])

  // Multi-day event detection (ERP all-day split across days)
  const multiDaySpans = useMemo(() => {
    const spans = new Map<string, string>() // date -> color
    function normalizeDesc(desc: string): string {
      return desc
        .replace(/\s*\(day \d+\/\d+\)/i, '')
        .replace(/\s*-?\s*day \d+\s*(of|\/)\s*\d+/i, '')
        .replace(/\s*\(\d+\/\d+\)/, '')
        .trim()
    }
    const byKey = new Map<string, Activity[]>()
    for (const a of filteredActivities) {
      if (!a.isAllDay || !a.date) continue
      const key = normalizeDesc(a.description ?? '')
      if (!key) continue
      const list = byKey.get(key) ?? []
      list.push(a)
      byKey.set(key, list)
    }
    for (const list of byKey.values()) {
      if (list.length < 2) continue
      const color = getActivityColor(list[0])
      for (const a of list) spans.set(a.date, color)
    }
    return spans
  }, [filteredActivities, getActivityColor])

  // Selected day's events
  const selectedDayEvents = useMemo(() =>
    activitiesByDate.get(selectedDay) ?? []
  , [activitiesByDate, selectedDay])

  function handleCellClick(dateStr: string) {
    if (showSide) {
      onSelectedDayChange?.(dateStr)
    } else {
      onSelectDate(dateStr)
    }
  }

  function handleResizeStart(e: React.PointerEvent) {
    if (!isDesktop) return
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = splitWidth
    function onMove(me: PointerEvent) {
      if (!isDraggingRef.current) return
      const newWidth = Math.max(280, Math.min(window.innerWidth - 300, startWidth + (me.clientX - startX)))
      latestWidthRef.current = newWidth
      setSplitWidth(newWidth)
    }
    function onUp() {
      isDraggingRef.current = false
      try { localStorage.setItem('monthViewSplitWidth', String(latestWidthRef.current)) } catch {}
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Detect per-person day view mode (desktop, multiple people — shows day view on the side instead of agenda)
  const showDayViewPanel = isDesktop && personCount > 1 && !!dayViewPanel

  const wrapStyle: React.CSSProperties = { background: 'var(--app-bg)' }
  if (isDesktop) {
    wrapStyle.gridTemplateColumns = `${splitWidth}px 4px 1fr`
  }

  return (
    <div
      className={`month-wrap flex-1 overflow-hidden relative${showDayViewPanel ? '' : ''}`}
      style={wrapStyle}
    >
      {loading && (
        <div className="absolute top-0 left-0 right-0 z-30 h-0.5 overflow-hidden" style={{ gridColumn: '1 / -1' }}>
          <div className="h-full" style={{ width: '30%', background: 'var(--app-accent)', animation: 'loading-slide 1s ease-in-out infinite alternate', position: 'relative' }} />
          <style>{`@keyframes loading-slide { from { margin-left: 0% } to { margin-left: 70% } }`}</style>
        </div>
      )}

      {/* Main grid */}
      <div
        className="month-main min-w-0"
        onTouchStart={e => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (!swipeRef.current) return
          const dx = e.changedTouches[0].clientX - swipeRef.current.x
          const dy = e.changedTouches[0].clientY - swipeRef.current.y
          swipeRef.current = null
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) onNavigateMonth?.(dx < 0 ? 1 : -1)
        }}
      >
        <div className="month-head">
          {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div ref={gridRef} className="month-grid">
          {allDays.map(d => {
            const ds = format(d, 'yyyy-MM-dd')
            const inMonth = isSameMonth(d, monthStart)
            const isSel = isSameDay(d, parseISO(selectedDay))
            const today = isToday(d)
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            const dateHolidays = holidays?.dates?.[ds]
            const isHoliday = dateHolidays && dateHolidays.length > 0
            const dayActs = activitiesByDate.get(ds) ?? []
            const spanColor = multiDaySpans.get(ds)

            const cellClasses = [
              'month-cell',
              !inMonth && 'other',
              isSel && 'sel',
              isWeekend && 'weekend',
              isHoliday && 'holiday',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={ds}
                role="button"
                tabIndex={0}
                className={cellClasses}
                style={spanColor ? { borderTop: `1px solid ${spanColor}` } : undefined}
                onClick={() => handleCellClick(ds)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onSelectDate(ds) }
                  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCellClick(ds) }
                }}
              >
                <div className="mh-top">
                  <span className={`mh-num ${today ? 'today' : ''}`}>{format(d, 'd')}</span>
                  {isHoliday && dateHolidays && (
                    <span className="mh-holiday" title={dateHolidays.map(h => h.name).join(', ')}>
                      {dateHolidays[0].name}
                    </span>
                  )}
                </div>

                {/* Event chips — dynamic fit (maxChips) */}
                {dayActs.slice(0, maxChips).map(act => {
                  const color = getActivityColor(act)
                  return (
                    <div
                      key={act.id}
                      className="mh-chip"
                      style={{ ['--ev-bg' as string]: color }}
                      onClick={e => { e.stopPropagation(); onActivityClick?.(act) }}
                      onMouseEnter={isDesktop ? e => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setHoverPos({ x: rect.right + 6, y: rect.top })
                        setHoveredEvent(act)
                      } : undefined}
                      onMouseLeave={isDesktop ? () => setHoveredEvent(null) : undefined}
                      title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                    >
                      {act.isAllDay ? '' : `${act.timeFrom} `}{act.description || '(no title)'}
                    </div>
                  )
                })}
                {dayActs.length > maxChips && (
                  <div className="mh-more">+{dayActs.length - maxChips} more</div>
                )}

                {/* Dots row (visible only in compact landscape via CSS) */}
                <div className="dots-row">
                  {dayActs.slice(0, 6).map(act => (
                    <span key={act.id} className="dot" style={{ background: getActivityColor(act) }} />
                  ))}
                  {dayActs.length > 6 && <span className="dot-more">+{dayActs.length - 6}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hover preview card (desktop only) */}
      {hoveredEvent && isDesktop && (() => {
        const act = hoveredEvent
        const color = getActivityColor(act)
        const sourceLabel = act.source === 'herbe' ? (act.erpConnectionName ? `ERP · ${act.erpConnectionName}` : 'ERP')
          : act.source === 'outlook' ? 'Outlook'
          : act.source === 'google' ? (act.googleCalendarName ?? 'Google')
          : act.icsCalendarName ?? ''
        const variantClass = act.planned ? 'planned' : ''
        const rsvpMap: Record<string, string> = { accepted: 'accepted', tentative: 'tentative', declined: 'declined', pending: 'pending' }
        const cardWidth = 320
        const cardMaxH = 360
        const left = Math.max(8, Math.min(hoverPos.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - cardWidth - 8))
        const top = Math.max(8, Math.min(hoverPos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - cardMaxH - 8))
        return (
          <div
            className={`ev-preview ${variantClass}`}
            style={{ left, top, ['--ev-bg' as string]: color, pointerEvents: 'none' }}
            role="tooltip"
          >
            <div className="evp-accent" />
            <div className="evp-head">
              <div className="evp-chips">
                <span className="evp-chip brand">{act.source === 'herbe' ? 'ERP' : act.source === 'outlook' ? 'OUT' : act.source === 'google' ? 'GOO' : (act.icsCalendarName ? 'ICS' : 'EXT')}</span>
                {act.planned && <span className="evp-chip planned">Planned</span>}
                {act.isExternal && <span className="evp-chip">External</span>}
                {act.attendees && act.attendees.length > 0 && <span className="evp-chip">{act.attendees.length} attendees</span>}
              </div>
              <div className="evp-title">{act.description || '(no title)'}</div>
              <div className="evp-when">
                {act.isAllDay ? 'All day' : `${act.timeFrom} – ${act.timeTo}`}
                {act.date && <> · {format(parseISO(act.date), 'EEE d MMM')}</>}
              </div>
            </div>
            <div className="evp-body">
              {act.activityTypeCode && (
                <div className="evp-row">
                  <span className="k">Type</span>
                  <span className="v">{act.activityTypeCode}{act.activityTypeName ? ` · ${act.activityTypeName}` : ''}</span>
                </div>
              )}
              {act.customerName && (
                <div className="evp-row">
                  <span className="k">Customer</span>
                  <span className="v">{act.customerName}</span>
                </div>
              )}
              {act.projectName && (
                <div className="evp-row">
                  <span className="k">Project</span>
                  <span className="v">{act.projectName}</span>
                </div>
              )}
              {act.location && (
                <div className="evp-row">
                  <span className="k">Location</span>
                  <span className="v">{act.location}</span>
                </div>
              )}
              {sourceLabel && (
                <div className="evp-row">
                  <span className="k">Calendar</span>
                  <span className="v">{sourceLabel}</span>
                </div>
              )}
              {act.attendees && act.attendees.length > 0 && (
                <div className="evp-attendees">
                  {act.attendees.slice(0, 5).map((att, i) => {
                    const initials = (att.name ?? att.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
                    const rsvp = att.responseStatus && rsvpMap[att.responseStatus as string]
                    return (
                      <div key={`${att.email}-${i}`} className="evp-att">
                        <span className="evp-avatar" style={{ background: color }}>{initials || '?'}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name ?? att.email}</span>
                        {rsvp && <span className={`evp-rsvp ${rsvp}`}>{rsvp}</span>}
                      </div>
                    )
                  })}
                  {act.attendees.length > 5 && (
                    <div style={{ fontSize: 10.5, color: 'var(--app-fg-subtle)', paddingLeft: 24 }}>+{act.attendees.length - 5} more</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Resize handle (desktop only, when sidebar is visible) */}
      {isDesktop && showSide && (
        <div
          className="w-1 shrink-0 cursor-col-resize transition-colors"
          style={{ background: 'var(--app-line)' }}
          onPointerDown={handleResizeStart}
        />
      )}

      {/* Right side: day view panel (multi-person desktop) OR agenda */}
      {showSide && (
        showDayViewPanel ? (
          <div className="flex-1 min-w-0 overflow-hidden">{dayViewPanel}</div>
        ) : (
          <aside className="month-side">
            <header className="month-side-hdr">
              <div className="dow">{format(parseISO(selectedDay), 'EEEE')}</div>
              <div className="dnum">
                {format(parseISO(selectedDay), 'd')}
                <span style={{ fontSize: 14, color: 'var(--app-fg-subtle)', fontWeight: 500, marginLeft: 6 }}>
                  {format(parseISO(selectedDay), 'MMMM yyyy')}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => onSelectDate(selectedDay)}
                  className="btn btn-outline btn-sm"
                  title="Open day view"
                >
                  Open day view
                </button>
              </div>
            </header>
            <div className="month-side-body">
              {holidays?.dates?.[selectedDay]?.length ? (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--app-accent)',
                    padding: '4px 0 10px',
                    borderBottom: '1px solid var(--app-line)',
                    marginBottom: 6,
                  }}
                >
                  {holidays.dates[selectedDay].map(h => h.name).join(' · ')}
                </div>
              ) : null}

              {selectedDayEvents.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--app-fg-subtle)', fontSize: 12 }}>
                  Nothing scheduled
                </div>
              ) : (
                selectedDayEvents.map(act => {
                  const color = getActivityColor(act)
                  const sourceLabel = act.source === 'herbe' ? 'ERP'
                    : act.source === 'outlook' ? 'OUT'
                    : act.source === 'google' ? 'GOO'
                    : act.source?.toUpperCase() ?? ''
                  return (
                    <div
                      key={act.id}
                      className="ms-event"
                      onClick={() => onActivityClick?.(act)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivityClick?.(act) } }}
                    >
                      <div className="ms-time">
                        {act.isAllDay ? (
                          <span>all<br/>day</span>
                        ) : (
                          <>{act.timeFrom}<br/>{act.timeTo}</>
                        )}
                      </div>
                      <div className="ms-bar" style={{ background: color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ms-title">{act.description || '(no title)'}</div>
                        <div className="ms-sub">
                          <span style={{ color, fontWeight: 600 }}>{sourceLabel}</span>
                          {act.activityTypeCode && <> · {act.activityTypeCode}</>}
                          {act.customerName && <> · {act.customerName}</>}
                          {act.location && <> · {act.location}</>}
                          {act.icsCalendarName && <> · {act.icsCalendarName}</>}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        )
      )}
    </div>
  )
}
