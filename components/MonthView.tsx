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

const MAX_VISIBLE_EVENTS = 3

export default function MonthView({
  activities, date, holidays, personCode, getActivityColor,
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-[2rem_repeat(7,1fr)] border-b border-border bg-surface shrink-0">
        <div className="text-center text-[9px] text-text-muted/50 font-medium py-1 border-r border-border/50">W</div>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] text-text-muted font-bold py-1">{d}</div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0])
          const monday = format(week[0], 'yyyy-MM-dd')
          return (
            <div key={wi} className="grid grid-cols-[2rem_repeat(7,1fr)] border-b border-border/30" style={{ minHeight: '5rem' }}>
              {/* Week number */}
              <button
                onClick={() => onSelectWeek(monday)}
                className="text-[9px] text-text-muted/40 hover:text-primary font-medium text-center pt-1 border-r border-border/50"
                title={`Week ${weekNum} → 7-day view`}
              >
                {weekNum}
              </button>

              {/* Day cells */}
              {week.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const inMonth = isSameMonth(day, monthStart)
                const dayActivities = activitiesByDate.get(dateStr) ?? []
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const dateHolidays = holidays?.dates?.[dateStr]
                const isHoliday = dateHolidays && dateHolidays.length > 0
                const allDay = dayActivities.filter(a => a.isAllDay)
                const timed = dayActivities.filter(a => !a.isAllDay).sort((a, b) => (a.timeFrom ?? '').localeCompare(b.timeFrom ?? ''))
                const sorted = [...allDay, ...timed]
                const visible = sorted.slice(0, MAX_VISIBLE_EVENTS)
                const moreCount = sorted.length - visible.length

                return (
                  <div
                    key={dateStr}
                    className={`border-r border-border/20 last:border-r-0 px-0.5 pt-0.5 pb-1 cursor-pointer hover:bg-border/20 transition-colors ${
                      !inMonth ? 'opacity-30' :
                      isHoliday ? 'bg-red-500/5' :
                      isWeekend ? 'bg-border/10' : ''
                    }`}
                    onClick={() => onSelectDate(dateStr)}
                  >
                    {/* Day number */}
                    <div className={`text-[10px] font-bold mb-0.5 px-0.5 ${
                      isToday(day) ? 'text-primary' :
                      !inMonth ? 'text-text-muted' : 'text-text'
                    }`}>
                      {format(day, 'd')}
                      {isToday(day) && <span className="ml-0.5 text-[8px] font-normal text-primary">today</span>}
                    </div>

                    {/* Holiday name */}
                    {isHoliday && (
                      <div className="text-[8px] text-red-400 font-bold truncate px-0.5 mb-0.5" title={dateHolidays.map(h => h.name).join(', ')}>
                        {dateHolidays[0].name}
                      </div>
                    )}

                    {/* Event snippets */}
                    {visible.map(act => (
                      <button
                        key={act.id}
                        onClick={(e) => { e.stopPropagation(); onActivityClick(act) }}
                        className="w-full text-left flex items-center gap-0.5 rounded px-0.5 py-px hover:bg-border/30 truncate"
                        title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: getActivityColor(act) }}
                        />
                        <span className="text-[9px] truncate text-text-muted">
                          {act.isAllDay ? act.description : `${act.timeFrom} ${act.description}`}
                        </span>
                      </button>
                    ))}
                    {moreCount > 0 && (
                      <div className="text-[8px] text-text-muted/60 px-0.5">+{moreCount} more</div>
                    )}
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
