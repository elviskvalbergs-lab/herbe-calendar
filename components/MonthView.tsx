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
}

export default function MonthView({
  activities, date, holidays, getActivityColor,
  onSelectDate, onSelectWeek, onSelectedDayChange, onActivityClick, loading,
}: Props) {
  // date prop IS the selected day; derive month from it
  const selectedDay = date
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

  // Group activities by date
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const a of activities) {
      if (!a.date) continue
      const existing = map.get(a.date) ?? []
      existing.push(a)
      map.set(a.date, existing)
    }
    return map
  }, [activities])

  // Build weeks
  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }
  const weekCount = weeks.length

  // Portrait: measure grid to calc max events
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxEvents, setMaxEvents] = useState(3)
  useEffect(() => {
    if (isSplit) return
    function calc() {
      if (!gridRef.current) return
      const rowHeight = gridRef.current.clientHeight / weekCount
      const available = rowHeight - 22 - 14 // day number + "+N" line
      setMaxEvents(Math.max(1, Math.floor(available / 16)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [weekCount, isSplit])

  // Selected day's activities for landscape agenda
  const selectedDayActivities = useMemo(() => {
    const acts = activitiesByDate.get(selectedDay) ?? []
    const allDay = acts.filter(a => a.isAllDay)
    const timed = acts.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
    return [...allDay, ...timed]
  }, [activitiesByDate, selectedDay])

  function handleDayClick(dateStr: string) {
    // In all modes, selecting a day updates state.date (shown in header)
    // In portrait, this also navigates the month if clicking adjacent month days
    onSelectedDayChange?.(dateStr)
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
            return (
              <div key={wi} className="grid grid-cols-7 border-b border-border/30 min-h-0 overflow-hidden">
                {week.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const inMonth = isSameMonth(day, monthStart)
                  const dayActivities = activitiesByDate.get(dateStr) ?? []
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const dateHolidays = holidays?.dates?.[dateStr]
                  const isHoliday = dateHolidays && dateHolidays.length > 0
                  const isSelected = isSplit && selectedDay === dateStr

                  // Sort: all-day first, then by time
                  const allDay = dayActivities.filter(a => a.isAllDay)
                  const timed = dayActivities.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
                  const sorted = [...allDay, ...timed]

                  if (compact) {
                    // Landscape compact: just day number + colored dots
                    const dotSources = new Set(dayActivities.map(a => getActivityColor(a)))
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleDayClick(dateStr)}
                        className={`flex flex-col items-center py-1 border-r border-border/20 last:border-r-0 transition-colors ${
                          isSelected ? 'bg-primary/15' :
                          !inMonth ? 'opacity-30' :
                          isHoliday ? 'bg-red-500/5' :
                          isWeekend ? 'bg-border/10' :
                          'hover:bg-border/10'
                        }`}
                      >
                        <span className={`text-xs font-bold leading-tight ${
                          isToday(day)
                            ? 'bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                            : isSelected ? 'text-primary'
                            : !inMonth ? 'text-text-muted/40' : 'text-text'
                        }`}>
                          {format(day, 'd')}
                        </span>
                        {/* Source color dots */}
                        {dotSources.size > 0 && (
                          <div className="flex gap-px mt-0.5">
                            {[...dotSources].slice(0, 4).map((color, i) => (
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

                  return (
                    <div
                      key={dateStr}
                      className={`border-r border-border/20 last:border-r-0 flex flex-col min-h-0 overflow-hidden cursor-pointer hover:bg-border/10 transition-colors ${
                        !inMonth ? 'opacity-30' :
                        isHoliday ? 'bg-red-500/5' :
                        isWeekend ? 'bg-border/10' : ''
                      }`}
                      onClick={() => handleDayClick(dateStr)}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between px-1 pt-0.5 shrink-0">
                        <span className={`text-xs font-bold leading-tight ${
                          isToday(day)
                            ? 'bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                            : !inMonth ? 'text-text-muted/40' : 'text-text'
                        }`}>
                          {format(day, 'd')}
                        </span>
                        {day.getDay() === 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectWeek(monday) }}
                            className="text-[8px] text-text-muted/30 hover:text-primary font-medium"
                            title={`W${weekNum} → 7-day view`}
                          >
                            W{weekNum}
                          </button>
                        )}
                      </div>

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
                              className="w-full rounded px-1 py-px mb-px truncate text-[9px] font-medium"
                              style={{ background: color + '20', color }}
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
      <div className="flex-1 flex overflow-hidden bg-bg">
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

        {/* Right: day agenda */}
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
                      <p className="text-xs font-bold leading-snug" style={{ color }}>
                        {act.description || '(no title)'}
                      </p>
                      <p className="text-xs text-text-muted">
                        {act.isAllDay ? 'all-day' : `${act.timeFrom} – ${act.timeTo}`}
                        {act.planned && <span className="ml-1 text-amber-500 text-[10px]">(planned)</span>}
                      </p>
                      {act.activityTypeCode && (
                        <p className="text-[10px] mt-0.5" style={{ color }}>
                          <span className="font-mono">{act.activityTypeCode}</span>
                          {act.activityTypeName && <span className="ml-1">{act.activityTypeName}</span>}
                        </p>
                      )}
                      {act.projectName && <p className="text-xs text-text-muted mt-0.5 truncate">{act.projectName}</p>}
                      {act.customerName && <p className="text-xs text-text-muted truncate">{act.customerName}</p>}
                      {act.location && <p className="text-[10px] mt-0.5 text-text-muted truncate">{act.location}</p>}
                      {act.icsCalendarName && <p className="text-[10px] mt-0.5 text-text-muted truncate">{act.icsCalendarName}</p>}
                      {act.googleCalendarName && <p className="text-[10px] mt-0.5 text-text-muted truncate">{act.googleCalendarName}</p>}
                      {act.source === 'herbe' && <p className="text-[10px] mt-0.5 text-text-muted truncate">ERP</p>}
                      {act.source === 'outlook' && !act.icsCalendarName && <p className="text-[10px] mt-0.5 text-text-muted truncate">Outlook</p>}
                      {act.source === 'google' && !act.googleCalendarName && !act.icsCalendarName && <p className="text-[10px] mt-0.5 text-text-muted truncate">Google Calendar</p>}
                      {act.attendees && act.attendees.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {act.attendees.slice(0, 6).map(att => (
                            <span key={att.email} className="px-1.5 py-0 rounded-full text-[9px] font-bold border border-border/50 text-text-muted bg-border/20 truncate max-w-[80px]">
                              {att.email.split('@')[0]}
                            </span>
                          ))}
                          {act.attendees.length > 6 && <span className="text-[9px] text-text-muted">+{act.attendees.length - 6}</span>}
                        </div>
                      )}
                      {act.joinUrl && (
                        <a
                          href={act.joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold text-white"
                          style={{ background: act.videoProvider === 'meet' ? '#1a73e8' : act.videoProvider === 'teams' ? '#464EB8' : act.videoProvider === 'zoom' ? '#2D8CFF' : '#2563eb' }}
                        >
                          {act.videoProvider === 'meet' ? 'Join Google Meet'
                            : act.videoProvider === 'teams' ? 'Join in Teams'
                            : act.videoProvider === 'zoom' ? 'Join Zoom'
                            : 'Join meeting'}
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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
    </div>
  )
}
