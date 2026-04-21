'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay,
} from 'date-fns'
import type { Activity } from '@/types'
import { textOnAccent, readableAccentColor } from '@/lib/activityColors'
import { useEvStyle } from '@/lib/useEvStyle'
import { EventPreviewCard } from './EventPreviewCard'

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
  onSelectDate, onSelectedDayChange, onActivityClick, loading, isLightMode = false, personCount = 1, dayViewPanel, onNavigateMonth,
}: Props) {
  const selectedDay = date
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const [hoveredEvent, setHoveredEvent] = useState<Activity | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [pickedEvent, setPickedEvent] = useState<{ act: Activity; pos: { x: number; y: number } } | null>(null)
  // Right-side panel mode: 'agenda' (default) shows the events list,
  // 'day' shows a full day view of the selected day inline.
  const [rightSide, setRightSide] = useState<'agenda' | 'day'>('agenda')
  const gridRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [maxChips, setMaxChips] = useState(4)
  const evStyle = useEvStyle()

  // Hover bridge: when the cursor leaves a chip, schedule a hide. If it
  // enters the preview within the timeout, cancel — so the user can
  // actually move into and click inside the preview.
  function scheduleHide() {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setHoveredEvent(null), 120)
  }
  function cancelHide() {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  // Close picked preview on Esc, and on click-outside. The click-outside
  // handler ignores chips/agenda rows so clicking another event swaps the
  // preview to that event instead of just closing it.
  useEffect(() => {
    if (!pickedEvent) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickedEvent(null) }
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('.ev-preview') || t.closest('.mh-chip') || t.closest('.ms-event')) return
      setPickedEvent(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [pickedEvent])
  const monthStart = startOfMonth(parseISO(selectedDay))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Layout mode: portrait (narrow), landscape (short wide), desktop (full)
  const [layout, setLayout] = useState<'portrait' | 'landscape' | 'desktop'>('portrait')
  const [splitWidth, setSplitWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 1000
    const saved = localStorage.getItem('monthViewSplitWidth')
    if (saved) return Number(saved)
    // Default: give the agenda ~320px, calendar takes the rest. Floor at
    // 600 so very narrow desktops still show a usable grid.
    return Math.max(600, window.innerWidth - 320)
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

  // Dynamic fit — measure cell height to decide how many chips fit.
  // Portrait always shows 2 chips. Desktop/landscape fit as many as the
  // cell height allows (chips are tightened via CSS so more fit).
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const chipH = 14   // tighter desktop chips ≈ 14px row
    const reserve = 20 + 2 + 13   // day-num + top padding + "+N more" line
    function calc() {
      if (!el) return
      if (layout === 'portrait') {
        setMaxChips(2)
        return
      }
      const rowH = el.clientHeight / 6
      const available = Math.max(0, rowH - reserve)
      const fit = Math.max(1, Math.floor(available / chipH))
      setMaxChips(prev => (prev === fit ? prev : fit))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout])

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
    // Agenda is always-visible now. A cell tap updates the selected day;
    // "Open day view" in the agenda header drills in.
    onSelectedDayChange?.(dateStr)
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

  const weekCount = Math.max(1, Math.ceil(allDays.length / 7))
  const wrapStyle: React.CSSProperties = { background: 'var(--app-bg)', ['--month-rows' as string]: weekCount }
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
                    <span
                      className="mh-holiday"
                      title={dateHolidays.map(h => h.name).join(', ')}
                      data-full={dateHolidays.map(h => h.name).join(' · ')}
                    >
                      {dateHolidays[0].name}
                    </span>
                  )}
                </div>

                {/* Event chips — dynamic fit (maxChips).
                    Click selects the chip's day (updates the agenda);
                    drilling in happens via the agenda's "Open day view". */}
                {dayActs.slice(0, maxChips).map(act => {
                  const color = getActivityColor(act)
                  return (
                    <div
                      key={act.id}
                      className="mh-chip"
                      style={{
                        ['--ev-bg' as string]: color,
                        // Only force a contrasted text colour for the SOLID variant
                        // (chip is the full event colour). In tinted/outlined the
                        // chip bg is a faded version and the design CSS already
                        // computes a colour-mixed readable text.
                        ...(evStyle === 'solid' ? { color: textOnAccent(color) } : {}),
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        if (act.date) onSelectedDayChange?.(act.date)
                      }}
                      onMouseEnter={isDesktop ? e => {
                        cancelHide()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setHoverPos({ x: rect.right + 6, y: rect.top })
                        setHoveredEvent(act)
                      } : undefined}
                      onMouseLeave={isDesktop ? () => scheduleHide() : undefined}
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

      {/* Preview card — hover (desktop) or clicked (sticky, any) */}
      {((hoveredEvent && isDesktop && !pickedEvent) || pickedEvent) && (() => {
        const isSticky = !!pickedEvent
        const act = pickedEvent?.act ?? hoveredEvent!
        const pos = pickedEvent?.pos ?? hoverPos
        const color = getActivityColor(act)
        const cardWidth = 320
        const cardMaxH = 360
        const left = Math.max(8, Math.min(pos.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - cardWidth - 8))
        const top = Math.max(8, Math.min(pos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - cardMaxH - 8))
        return (
          <EventPreviewCard
            activity={act}
            color={color}
            position={{ left, top }}
            isSticky={isSticky}
            positionMode="fixed"
            showDate
            isLightMode={isLightMode}
            onClose={isSticky ? () => setPickedEvent(null) : undefined}
            onEdit={() => {
              setPickedEvent(null)
              setHoveredEvent(null)
              onActivityClick?.(act)
            }}
            onMouseEnter={isSticky ? undefined : cancelHide}
            onMouseLeave={isSticky ? undefined : scheduleHide}
          />
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

      {/* Right side: day view panel (Day toggle, or multi-person desktop)
          OR agenda (default). Toggle swaps the right panel inline; the
          month grid on the left stays put. */}
      {showSide && (
        rightSide === 'day' && dayViewPanel ? (
          <aside className="month-side">
            <header className="month-side-hdr">
              <div className="dow">{format(parseISO(selectedDay), 'EEEE')}</div>
              <div className="dnum">
                <span>{format(parseISO(selectedDay), 'd')}</span>
                <span>{format(parseISO(selectedDay), 'MMMM yyyy')}</span>
              </div>
              <div className="segmented agenda-open" title="Switch view">
                <button aria-pressed={true}>1D</button>
                <button onClick={() => setRightSide('agenda')} aria-pressed={false}>Agenda</button>
              </div>
            </header>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {dayViewPanel}
            </div>
          </aside>
        ) : (
          <aside className="month-side">
            <header className="month-side-hdr">
              <div className="dow">{format(parseISO(selectedDay), 'EEEE')}</div>
              <div className="dnum">
                <span>{format(parseISO(selectedDay), 'd')}</span>
                <span>
                  {format(parseISO(selectedDay), 'MMMM yyyy')}
                </span>
              </div>
              <div className="segmented agenda-open" title="Switch view">
                <button
                  onClick={() => {
                    if (dayViewPanel) setRightSide('day')
                    else onSelectDate(selectedDay)
                  }}
                  aria-pressed={false}
                  title={dayViewPanel ? 'Show day view in this panel' : 'Open day view'}
                >1D</button>
                <button aria-pressed={true}>Agenda</button>
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
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setPickedEvent({ act, pos: { x: rect.right + 6, y: rect.top } })
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setPickedEvent({ act, pos: { x: rect.right + 6, y: rect.top } })
                        }
                      }}
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
                          <span style={{ color: readableAccentColor(color, !isLightMode), fontWeight: 600 }}>{sourceLabel}</span>
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
