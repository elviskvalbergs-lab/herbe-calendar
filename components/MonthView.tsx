'use client'
import { useMemo } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, getISOWeek,
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
  onActivityClick: (activity: Activity) => void
}

export default function MonthView({
  activities, date, holidays, getActivityColor,
  onSelectDate, onSelectWeek, onActivityClick,
}: Props) {
  const monthStart = startOfMonth(parseISO(date))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

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

  // Build weeks (rows of 7 days)
  const weeks: Date[][] = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }

  const weekCount = weeks.length

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">
      {/* Day-of-week header row */}
      <div className="grid grid-cols-7 border-b border-border bg-surface shrink-0">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] text-text-muted font-bold py-1.5 border-r border-border/30 last:border-r-0">{d}</div>
        ))}
      </div>

      {/* Calendar grid — equal height rows filling available space */}
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${weekCount}, 1fr)` }}>
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

                // Sort: all-day first, then by time
                const allDay = dayActivities.filter(a => a.isAllDay)
                const timed = dayActivities.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
                const sorted = [...allDay, ...timed]

                // Dynamically decide how many to show based on week count
                // 4-5 week months can show more, 6-week months show fewer
                const maxVisible = weekCount <= 5 ? 3 : 2
                const visible = sorted.slice(0, maxVisible)
                const moreCount = sorted.length - visible.length

                return (
                  <div
                    key={dateStr}
                    className={`border-r border-border/20 last:border-r-0 flex flex-col min-h-0 overflow-hidden cursor-pointer hover:bg-border/10 transition-colors ${
                      !inMonth ? 'opacity-30' :
                      isHoliday ? 'bg-red-500/5' :
                      isWeekend ? 'bg-border/10' : ''
                    }`}
                    onClick={() => onSelectDate(dateStr)}
                  >
                    {/* Day number row */}
                    <div className="flex items-center justify-between px-1 pt-0.5 shrink-0">
                      <span className={`text-xs font-bold leading-tight ${
                        isToday(day)
                          ? 'bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                          : !inMonth ? 'text-text-muted/40' : 'text-text'
                      }`}>
                        {format(day, 'd')}
                      </span>
                      {/* Week number on Monday */}
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
                      {/* Holiday */}
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
                          <button
                            key={act.id}
                            onClick={(e) => { e.stopPropagation(); onActivityClick(act) }}
                            className="w-full text-left rounded px-1 py-px mb-px truncate text-[9px] font-medium block"
                            style={{ background: color + '20', color }}
                            title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                          >
                            {act.isAllDay ? act.description : act.description}
                          </button>
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
