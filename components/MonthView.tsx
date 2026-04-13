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
}

export default function MonthView({
  activities, date, holidays, getActivityColor,
  onSelectDate, onSelectWeek,
}: Props) {
  const monthStart = startOfMonth(parseISO(date))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Landscape detection
  const [isLandscape, setIsLandscape] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string>(date)

  useEffect(() => {
    function check() { setIsLandscape(window.innerWidth > window.innerHeight) }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check) }
  }, [])

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
    if (isLandscape) return
    function calc() {
      if (!gridRef.current) return
      const rowHeight = gridRef.current.clientHeight / weekCount
      const available = rowHeight - 22 - 14 // day number + "+N" line
      setMaxEvents(Math.max(1, Math.floor(available / 16)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [weekCount, isLandscape])

  // Selected day's activities for landscape agenda
  const selectedDayActivities = useMemo(() => {
    const acts = activitiesByDate.get(selectedDay) ?? []
    const allDay = acts.filter(a => a.isAllDay)
    const timed = acts.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
    return [...allDay, ...timed]
  }, [activitiesByDate, selectedDay])

  function handleDayClick(dateStr: string) {
    if (isLandscape) {
      setSelectedDay(dateStr)
    } else {
      onSelectDate(dateStr)
    }
  }

  // Compact month grid (shared by both modes, landscape version is smaller)
  function renderMonthGrid(compact: boolean) {
    return (
      <div className={`flex flex-col ${compact ? 'h-full' : 'flex-1'} overflow-hidden`}>
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border bg-surface shrink-0">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className={`text-center text-[10px] text-text-muted font-bold ${compact ? 'py-1' : 'py-1.5'} border-r border-border/30 last:border-r-0`}>{d}</div>
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
                  const isSelected = isLandscape && selectedDay === dateStr

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

  // Landscape: split view — month grid left + day agenda right
  if (isLandscape) {
    const selectedDateHolidays = holidays?.dates?.[selectedDay]
    return (
      <div className="flex-1 flex overflow-hidden bg-bg">
        {/* Left: compact month grid */}
        <div className="w-[280px] shrink-0 border-r border-border flex flex-col">
          {renderMonthGrid(true)}
        </div>

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
                    className="flex items-start gap-3 py-2 border-b border-border/30"
                  >
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{act.description || '(no title)'}</p>
                      {act.location && <p className="text-xs text-text-muted truncate">{act.location}</p>}
                      {act.customerName && <p className="text-xs text-text-muted truncate">{act.customerName}</p>}
                    </div>
                    <div className="text-xs text-text-muted shrink-0 text-right">
                      {act.isAllDay ? (
                        <span>all-day</span>
                      ) : (
                        <>
                          <div>{act.timeFrom}</div>
                          <div>{act.timeTo}</div>
                        </>
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
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">
      {renderMonthGrid(false)}
    </div>
  )
}
