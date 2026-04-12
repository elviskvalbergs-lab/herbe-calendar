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

const MAX_VISIBLE_EVENTS = 2

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
                    <div className={`text-sm font-bold mb-0.5 px-1 ${
                      isToday(day) ? 'text-primary' :
                      !inMonth ? 'text-text-muted/50' : 'text-text'
                    }`}>
                      {format(day, 'd')}
                    </div>

                    {/* Holiday name */}
                    {isHoliday && (
                      <div
                        className="text-[8px] text-red-400 font-bold truncate px-1 mb-0.5 rounded py-px"
                        style={{ background: 'rgba(239,68,68,0.1)' }}
                        title={dateHolidays.map(h => h.name).join(', ')}
                      >
                        {dateHolidays[0].name}
                      </div>
                    )}

                    {/* Event pills — Apple Calendar style */}
                    {visible.map(act => {
                      const color = getActivityColor(act)
                      return (
                        <button
                          key={act.id}
                          onClick={(e) => { e.stopPropagation(); onActivityClick(act) }}
                          className="w-full text-left rounded px-1 py-px mb-px truncate text-[9px] font-medium hover:brightness-110"
                          style={{ background: color + '25', color }}
                          title={`${act.timeFrom ? act.timeFrom + ' ' : ''}${act.description}`}
                        >
                          {act.isAllDay ? act.description : `${act.description}`}
                        </button>
                      )
                    })}
                    {moreCount > 0 && (
                      <div className="text-[8px] text-text-muted/50 px-1 font-medium">+{moreCount}</div>
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
