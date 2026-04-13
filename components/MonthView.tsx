'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, getISOWeek,
} from 'date-fns'
import type { Activity } from '@/types'

interface HolidayData {
  dates: Record<string, { name: string; country: string }[]>
  personCountries: Record<string, string>
}

interface Props {
  activities: Activity[]
  date: string // first of month (YYYY-MM-DD)
  holidays: HolidayData
  personCode: string
  getActivityColor: (activity: Activity) => string
  onSelectDate: (date: string) => void
  onSelectWeek: (monday: string) => void
  onSelectedDayChange?: (date: string) => void
  onActivityClick?: (activity: Activity) => void
  loading?: boolean
  personCount?: number
  dayViewPanel?: React.ReactNode
}

export default function MonthView({
  activities, date, holidays, personCode, getActivityColor,
  onSelectDate, onSelectWeek, onSelectedDayChange, onActivityClick, loading, personCount = 1, dayViewPanel,
}: Props) {
  // date prop IS the selected day; derive month from it
  const selectedDay = date
  const [hoveredEvent, setHoveredEvent] = useState<Activity | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const monthStart = startOfMonth(parseISO(selectedDay))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Layout mode: portrait (mobile), landscape (mobile), desktop
  const [layout, setLayout] = useState<'portrait' | 'landscape' | 'desktop'>('portrait')
  const [splitWidth, setSplitWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 340
    const saved = localStorage.getItem('monthViewSplitWidth')
    return saved ? Number(saved) : 340
  })
  const isDraggingRef = useRef(false)

  useEffect(() => {
    function check() {
      const w = window.innerWidth
      const h = window.innerHeight
      const isWide = w > h
      // Desktop: wide screen AND tall enough (not a phone in landscape)
      // Phone landscape typically has height < 500px
      if (w >= 768 && h >= 500) setLayout('desktop')
      else if (isWide) setLayout('landscape')
      else setLayout('portrait')
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check) }
  }, [])

  const isSplit = layout === 'landscape' || layout === 'desktop'
  const isDesktop = layout === 'desktop'

  // On mobile, filter to user's own person code only
  const filteredActivities = useMemo(() => {
    if (isDesktop) return activities // Desktop shows all persons
    return activities.filter(a => !a.personCode || a.personCode === personCode)
  }, [activities, isDesktop, personCode])

  // Group activities by date (deduplicated by id)
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
    return map
  }, [activities])

  // Detect multi-day events: group consecutive all-day events with same base description
  const multiDaySpans = useMemo(() => {
    const spans: { description: string; color: string; startDate: string; endDate: string; id: string }[] = []
    // Strip day counters like "(day 1/5)", " - Day 2 of 3", " (1/3)" from descriptions
    function normalizeDesc(desc: string): string {
      return desc
        .replace(/\s*\(day \d+\/\d+\)/i, '')
        .replace(/\s*-?\s*day \d+\s*(of|\/)\s*\d+/i, '')
        .replace(/\s*\(\d+\/\d+\)/, '')
        .trim()
    }
    const allDayByKey = new Map<string, { dates: string[]; desc: string }>()
    for (const a of filteredActivities) {
      if (!a.isAllDay || !a.date) continue
      const key = normalizeDesc(a.description ?? '')
      if (!key) continue
      const entry = allDayByKey.get(key) ?? { dates: [], desc: a.description ?? '' }
      if (!entry.dates.includes(a.date)) entry.dates.push(a.date)
      allDayByKey.set(key, entry)
    }
    for (const [key, { dates, desc }] of allDayByKey) {
      if (dates.length < 2) continue
      dates.sort()
      const act = activities.find(a => a.isAllDay && normalizeDesc(a.description ?? '') === key)
      if (!act) continue
      spans.push({ description: key, color: getActivityColor(act), startDate: dates[0], endDate: dates[dates.length - 1], id: act.id })
    }
    return spans
  }, [activities, getActivityColor])

  // Set of normalized descriptions that are shown as multi-day spans (exclude from per-day lists)
  const multiDayDescSet = useMemo(() => {
    return new Set(multiDaySpans.map(s => s.description))
  }, [multiDaySpans])

  // Helper to check if an all-day activity is part of a multi-day span
  function isInMultiDaySpan(act: Activity): boolean {
    if (!act.isAllDay) return false
    const normalized = (act.description ?? '')
      .replace(/\s*\(day \d+\/\d+\)/i, '')
      .replace(/\s*-?\s*day \d+\s*(of|\/)\s*\d+/i, '')
      .replace(/\s*\(\d+\/\d+\)/, '')
      .trim()
    return multiDayDescSet.has(normalized)
  }


  // Build weeks
  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }
  const weekCount = weeks.length

  // Measure grid to calc max events dynamically (all modes with pills)
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxEvents, setMaxEvents] = useState(3)
  useEffect(() => {
    function calc() {
      if (!gridRef.current) return
      const rowHeight = gridRef.current.clientHeight / weekCount
      const available = rowHeight - 20 - 12 // day number row + "+N" line
      setMaxEvents(Math.max(1, Math.floor(available / 16)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [weekCount, layout])

  // Selected day's activities for landscape agenda
  const selectedDayActivities = useMemo(() => {
    const acts = activitiesByDate.get(selectedDay) ?? []
    const allDay = acts.filter(a => a.isAllDay)
    const timed = acts.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
    return [...allDay, ...timed]
  }, [activitiesByDate, selectedDay])

  function handleDayClick(dateStr: string) {
    if (isSplit) {
      // Split modes: select the day (update header + agenda)
      onSelectedDayChange?.(dateStr)
    } else {
      // Portrait: click goes directly to day view
      onSelectDate(dateStr)
    }
  }

  // Compact month grid (shared by both modes, landscape version is smaller)
  function renderMonthGrid(compact: boolean) {
    return (
      <div className={`flex flex-col ${compact ? 'h-full' : 'flex-1'} overflow-hidden`}>
        {/* Day headers — subtle, same style as week numbers */}
        <div className="grid grid-cols-7 shrink-0">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[9px] text-text-muted/30 font-medium py-0.5">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div ref={compact ? undefined : gridRef} className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weekCount}, 1fr)` }}>
          {weeks.map((week, wi) => {
            const weekNum = getISOWeek(week[0])
            const monday = format(week[0], 'yyyy-MM-dd')
            // Multi-day spans crossing this week
            const weekStartStr = format(week[0], 'yyyy-MM-dd')
            const weekEndStr = format(week[6], 'yyyy-MM-dd')
            const weekSpans = multiDaySpans.filter(s => s.startDate <= weekEndStr && s.endDate >= weekStartStr)

            return (
              <div key={wi} className="border-b border-border/30 min-h-0 overflow-hidden flex flex-col relative">
                {/* Day numbers row */}
                <div className="grid grid-cols-7 shrink-0">
                  {week.map((d) => {
                    const ds = format(d, 'yyyy-MM-dd')
                    const inM = isSameMonth(d, monthStart)
                    const isSel = selectedDay === ds
                    return (
                      <div key={ds} className="px-1 pt-0.5 text-center">
                        <span className={`text-xs font-bold leading-tight px-1 rounded ${
                          isToday(d) && isSel ? 'bg-primary text-white'
                          : isToday(d) ? 'bg-primary/20 text-primary'
                          : isSel ? 'bg-text text-bg'
                          : !inM ? 'text-text-muted/40' : 'text-text'
                        }`}>{format(d, 'd')}</span>
                      </div>
                    )
                  })}
                </div>
                {/* Day cell contents (events) */}
                <div className="grid grid-cols-7 flex-1 min-h-0">
                {week.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const inMonth = isSameMonth(day, monthStart)
                  const dayActivities = activitiesByDate.get(dateStr) ?? []
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const dateHolidays = holidays?.dates?.[dateStr]
                  const isHoliday = dateHolidays && dateHolidays.length > 0
                  const isSelected = selectedDay === dateStr

                  // Sort: all-day first, then by time
                  const allDay = dayActivities.filter(a => a.isAllDay)
                  const timed = dayActivities.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
                  const sorted = [...allDay, ...timed]

                  if (compact) {
                    // Landscape compact: dots for all events + multi-day connector line at top
                    const compactMultiDay = dayActivities.find(a => isInMultiDaySpan(a))
                    const compactBorder = compactMultiDay ? `1px solid ${getActivityColor(compactMultiDay)}` : undefined
                    const dotColors = dayActivities.map(a => getActivityColor(a)).slice(0, 8)
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleDayClick(dateStr)}
                        className={`flex flex-col items-center justify-start gap-px py-0.5 border-r border-border/20 last:border-r-0 transition-colors ${
                          isSelected ? 'bg-primary/15' :
                          !inMonth ? 'opacity-30' :
                          isHoliday ? 'bg-red-500/5' :
                          isWeekend ? 'bg-border/10' :
                          'hover:bg-border/10'
                        }`}
                        style={compactBorder ? { borderTop: compactBorder } : undefined}
                      >
                        {/* Source color dots */}
                        {dotColors.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-px">
                            {dotColors.map((color, i) => (
                              <span key={i} className="w-1 h-1 rounded-full" style={{ background: color }} />
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  }

                  // Portrait: full cells with event pills
                  const visible = sorted.slice(0, maxEvents)
                  const moreCount = sorted.length - visible.length
                  // Multi-day connector line (top border)
                  const multiDayAct = dayActivities.find(a => isInMultiDaySpan(a))
                  const multiDayBorder = multiDayAct ? `1px solid ${getActivityColor(multiDayAct)}` : undefined

                  return (
                    <div
                      key={dateStr}
                      className={`border-r border-border/20 last:border-r-0 flex flex-col min-h-0 overflow-hidden cursor-pointer hover:bg-border/10 transition-colors ${
                        !inMonth ? 'opacity-30' :
                        isHoliday ? 'bg-red-500/5' :
                        isWeekend ? 'bg-border/10' : ''
                      }`}
                      style={multiDayBorder ? { borderTop: multiDayBorder } : undefined}
                      onClick={() => handleDayClick(dateStr)}
                    >

                      {/* Event pills */}
                      <div className="flex-1 min-h-0 overflow-hidden px-0.5 pb-0.5">
                        {isHoliday && (
                          <div
                            className="text-[8px] font-bold truncate rounded px-1 py-px mb-px"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                            title={dateHolidays.map(h => h.name).join(', ')}
                          >
                            {dateHolidays[0].name}
                          </div>
                        )}
                        {visible.map(act => {
                          const color = getActivityColor(act)
                          return (
                            <div
                              key={act.id}
                              className="w-full mb-px cursor-pointer hover:brightness-125 rounded px-1 py-px truncate text-[9px] font-medium"
                              style={{ background: color + '20', color }}
                              onMouseEnter={isDesktop ? (e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setHoverPos({ x: rect.right + 4, y: rect.top })
                                setHoveredEvent(act)
                              } : undefined}
                              onMouseLeave={isDesktop ? () => setHoveredEvent(null) : undefined}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isDesktop) onActivityClick?.(act)
                              }}
                              title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                            >
                              {act.description}
                            </div>
                          )
                        })}
                        {moreCount > 0 && (
                          <div className="text-[8px] text-text-muted/50 px-1 font-medium">+{moreCount}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                </div>
                {/* Multi-day spanning overlays — positioned after day numbers, above events */}
                {weekSpans.map((span, si) => {
                  const spanStartIdx = allDays.findIndex(d => format(d, 'yyyy-MM-dd') === span.startDate) - wi * 7
                  const spanEndIdx = allDays.findIndex(d => format(d, 'yyyy-MM-dd') === span.endDate) - wi * 7
                  const startCol = Math.max(0, spanStartIdx)
                  const endCol = Math.min(6, spanEndIdx)
                  if (startCol > 6 || endCol < 0) return null
                  const colSpan = endCol - startCol + 1
                  const slotHeight = compact ? 4 : 14
                  const topOffset = 20 + si * slotHeight // 20px = day number row height
                  return (
                    <div
                      key={span.id + '-' + wi}
                      className={`absolute z-10 pointer-events-none ${compact
                        ? 'h-[3px] rounded-sm'
                        : 'h-3 rounded text-[8px] font-bold truncate px-1 leading-3'
                      }`}
                      style={{
                        left: `${(startCol / 7) * 100}%`,
                        width: `${(colSpan / 7) * 100}%`,
                        top: topOffset,
                        background: span.color + (compact ? '' : '40'),
                        color: span.color,
                      }}
                      title={span.description}
                    >
                      {!compact && span.description}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Split view — month grid left + day agenda right
  if (isSplit) {
    const selectedDateHolidays = holidays?.dates?.[selectedDay]
    const leftWidth = isDesktop ? splitWidth : 280

    function handleResizeStart(e: React.PointerEvent) {
      if (!isDesktop) return
      e.preventDefault()
      isDraggingRef.current = true
      const startX = e.clientX
      const startWidth = splitWidth
      function onMove(me: PointerEvent) {
        if (!isDraggingRef.current) return
        const newWidth = Math.max(280, Math.min(window.innerWidth - 300, startWidth + (me.clientX - startX)))
        setSplitWidth(newWidth)
      }
      function onUp() {
        isDraggingRef.current = false
        localStorage.setItem('monthViewSplitWidth', String(splitWidth))
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    return (
      <div className="flex-1 flex overflow-hidden bg-bg relative">
        {loading && (
          <div className="absolute top-0 left-0 right-0 z-30 h-0.5 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '30%', animation: 'loading-slide 1s ease-in-out infinite alternate', position: 'relative' }} />
            <style>{`@keyframes loading-slide { from { margin-left: 0% } to { margin-left: 70% } }`}</style>
          </div>
        )}
        {/* Left: month grid — desktop uses pills, mobile landscape uses compact dots */}
        <div className="shrink-0 border-r border-border flex flex-col" style={{ width: leftWidth }}>
          {renderMonthGrid(!isDesktop)}
        </div>

        {/* Resize handle (desktop only) */}
        {isDesktop && (
          <div
            className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            onPointerDown={handleResizeStart}
          />
        )}

        {/* Right: day view (multi-person) or agenda (single person) */}
        {isDesktop && dayViewPanel ? (
          <div className="flex-1 overflow-hidden">{dayViewPanel}</div>
        ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-text">
              {format(parseISO(selectedDay), 'EEEE, d MMMM yyyy')}
            </h2>
            <button
              onClick={() => onSelectDate(selectedDay)}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              Open day view
            </button>
          </div>

          {selectedDateHolidays && selectedDateHolidays.length > 0 && (
            <div className="text-xs text-red-400 font-bold mb-2">
              {selectedDateHolidays.map(h => h.name).join(', ')}
            </div>
          )}

          {selectedDayActivities.length === 0 ? (
            <p className="text-sm text-text-muted">No events</p>
          ) : (
            <div className="space-y-1">
              {selectedDayActivities.map(act => {
                const color = getActivityColor(act)
                return (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 py-2 border-b border-border/30 cursor-pointer hover:bg-border/10 rounded transition-colors"
                    onClick={() => onActivityClick?.(act)}
                  >
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      {/* Row 1: title + time */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold truncate" style={{ color }}>{act.description || '(no title)'}</span>
                        <span className="text-[10px] text-text-muted shrink-0">
                          {act.isAllDay ? 'all-day' : `${act.timeFrom}–${act.timeTo}`}
                        </span>
                        {act.planned && <span className="text-amber-500 text-[9px] shrink-0">(planned)</span>}
                      </div>
                      {/* Row 2: details inline */}
                      <div className="text-[10px] text-text-muted truncate">
                        {[
                          act.activityTypeCode && (act.activityTypeName ? `${act.activityTypeCode} ${act.activityTypeName}` : act.activityTypeCode),
                          act.customerName,
                          act.projectName,
                          act.location,
                        ].filter(Boolean).join(' · ')}
                      </div>
                      {/* Row 3: source + calendar + join link */}
                      <div className="flex items-center gap-2 text-[10px] text-text-muted/60">
                        <span>{act.source === 'herbe' ? 'ERP' : act.source === 'outlook' ? 'Outlook' : 'Google'}</span>
                        {act.icsCalendarName && <span className="truncate">{act.icsCalendarName}</span>}
                        {act.googleCalendarName && <span className="truncate">{act.googleCalendarName}</span>}
                        {act.attendees && act.attendees.length > 0 && (
                          <span>{act.attendees.length} attendee{act.attendees.length !== 1 ? 's' : ''}</span>
                        )}
                        {act.joinUrl && (
                          <a
                            href={act.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] font-bold shrink-0"
                            style={{ color: act.videoProvider === 'meet' ? '#1a73e8' : act.videoProvider === 'teams' ? '#464EB8' : act.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb' }}
                          >
                            {act.videoProvider === 'meet' ? 'Meet'
                              : act.videoProvider === 'teams' ? 'Teams'
                              : act.videoProvider === 'zoom' ? 'Zoom'
                              : 'Join'}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
        {renderHoverCard()}
      </div>
    )
  }

  // Hover preview card for desktop month grid
  function renderHoverCard() {
    if (!hoveredEvent || !isDesktop) return null
    const act = hoveredEvent
    const color = getActivityColor(act)
    return (
      <div
        className="fixed z-[60] bg-surface border border-border rounded-xl shadow-2xl p-3 min-w-[200px] max-w-[280px] pointer-events-none"
        style={{ left: Math.min(hoverPos.x, window.innerWidth - 300), top: Math.min(hoverPos.y, window.innerHeight - 200) }}
      >
        <p className="text-xs font-bold leading-snug mb-1" style={{ color }}>{act.description || '(no title)'}</p>
        <p className="text-[10px] text-text-muted">{act.isAllDay ? 'All day' : `${act.timeFrom} – ${act.timeTo}`}</p>
        {act.activityTypeName && <p className="text-[10px] text-text-muted mt-0.5">{act.activityTypeCode} {act.activityTypeName}</p>}
        {act.customerName && <p className="text-[10px] text-text-muted">{act.customerName}</p>}
        {act.projectName && <p className="text-[10px] text-text-muted">{act.projectName}</p>}
        {act.location && <p className="text-[10px] text-text-muted">{act.location}</p>}
        {act.icsCalendarName && <p className="text-[10px] text-text-muted/60">{act.icsCalendarName}</p>}
        {act.googleCalendarName && <p className="text-[10px] text-text-muted/60">{act.googleCalendarName}</p>}
        <p className="text-[9px] text-text-muted/40 mt-1">Click to edit</p>
      </div>
    )
  }

  // Portrait: full month grid with event pills
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg relative">
      {loading && (
        <div className="absolute top-0 left-0 right-0 z-30 h-0.5 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: '30%', animation: 'loading-slide 1s ease-in-out infinite alternate', position: 'relative' }} />
          <style>{`@keyframes loading-slide { from { margin-left: 0% } to { margin-left: 70% } }`}</style>
        </div>
      )}
      {renderMonthGrid(false)}
      {renderHoverCard()}
    </div>
  )
}
