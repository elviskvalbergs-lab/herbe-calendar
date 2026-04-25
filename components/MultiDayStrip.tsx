'use client'
import { useState, useEffect } from 'react'
import type { Activity } from '@/types'
import type { Task } from '@/types/task'

interface PersonRef {
  code: string
  name?: string
  email?: string
}

interface Props {
  date: string                              // yyyy-MM-dd for this date column
  persons: PersonRef[]                      // person sub-columns inside this date
  sessionUserCode?: string                  // tasks belong to the session user only
  allDayActivities: Activity[]              // all isAllDay=true on this date (across persons)
  tasks: Task[]                             // tasks whose dueDate matches this date
  holidays?: { dates: Record<string, { name: string; country: string }[]>; personCountries: Record<string, string> }
  collapsed: boolean
  minBodyHeight?: number                    // forced min-height in px so the band reads as one row
  getActivityColor: (a: Activity) => string
  onActivityClick?: (a: Activity) => void
  onTaskToggle?: (task: Task, next: boolean) => void
  onTaskClick?: (task: Task) => void
}

const ROW_H = 20
const ROW_GAP = 2

/**
 * The all-day band cell for a single date. Internally split into one
 * sub-cell per person, mirroring the body's per-person column layout, so
 * each person's all-day events / holidays / tasks land directly above
 * their own time grid.
 *
 * Tasks belong to the session user (we don't fetch tasks per other persons),
 * so they only render in the session user's sub-cell.
 *
 * `minBodyHeight` is supplied by CalendarGrid based on the maximum content
 * across all (date, person) cells — without it short cells would push their
 * bodies up and the band would no longer read as a single row.
 */
export default function MultiDayStrip({
  date,
  persons,
  sessionUserCode,
  allDayActivities,
  tasks,
  holidays,
  collapsed,
  minBodyHeight = 0,
  getActivityColor,
  onActivityClick,
  onTaskToggle,
  onTaskClick,
}: Props) {
  // Mirror task done-state locally so the checkbox toggle is snappy.
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const m: Record<string, boolean> = {}
    for (const t of tasks) m[t.id] = t.done
    setLocalDone(m)
  }, [tasks])

  if (collapsed) return null

  return (
    <div
      className="mds-cell"
      style={{
        background: 'var(--app-bg-alt)',
        borderRight: '1px solid var(--app-line)',
        borderBottom: '1px solid var(--app-line)',
        display: 'flex',
        minHeight: minBodyHeight ? `${minBodyHeight}px` : undefined,
      }}
    >
      {persons.map((p, idx) => {
        const personAllDay = allDayActivities.filter(a => a.personCode === p.code)
        const personTasks = sessionUserCode === p.code ? tasks : []
        const cc = holidays?.personCountries?.[p.code]
        const holidayName = cc ? holidays?.dates?.[date]?.find(h => h.country === cc)?.name : undefined
        return (
          <div
            key={p.code}
            className="mds-person-col"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '4px 4px',
              display: 'flex',
              flexDirection: 'column',
              gap: ROW_GAP,
              borderRight: idx < persons.length - 1 ? '1px dashed var(--app-line)' : 'none',
            }}
          >
            {holidayName && (
              <div
                style={{
                  height: ROW_H,
                  background: 'rgba(239,68,68,0.18)',
                  color: '#fecaca',
                  borderRadius: 2,
                  padding: '0 6px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={holidayName}
              >
                {holidayName}
              </div>
            )}
            {personAllDay.map(a => {
              const color = getActivityColor(a)
              return (
                <div
                  key={a.id}
                  onClick={() => onActivityClick?.(a)}
                  className="mds-chip"
                  style={{
                    height: ROW_H,
                    background: color,
                    color: '#fff',
                    borderRadius: 2,
                    padding: '0 6px',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: onActivityClick ? 'pointer' : 'default',
                  }}
                  title={a.description || ''}
                  suppressHydrationWarning
                >
                  {a.description || '(no title)'}
                </div>
              )
            })}
            {personTasks.map(t => {
              const done = localDone[t.id] ?? t.done
              return (
                <label
                  key={t.id}
                  className="mds-task"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '0 4px',
                    borderRadius: 2,
                    minHeight: ROW_H,
                    cursor: 'pointer',
                    textDecoration: done ? 'line-through' : 'none',
                    opacity: done ? 0.6 : 1,
                  }}
                >
                  <span
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      const next = !done
                      setLocalDone(m => ({ ...m, [t.id]: next }))
                      onTaskToggle?.(t, next)
                    }}
                    style={{
                      width: 13,
                      height: 13,
                      flexShrink: 0,
                      border: `1.5px solid ${done ? 'var(--app-accent)' : 'var(--app-fg-subtle)'}`,
                      background: done ? 'var(--app-accent)' : 'transparent',
                      borderRadius: 2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                  <span
                    onClick={e => {
                      if (onTaskClick) {
                        e.preventDefault()
                        e.stopPropagation()
                        onTaskClick(t)
                      }
                    }}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: done ? 'var(--app-fg-faint)' : 'var(--app-fg-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.2,
                      flex: 1,
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </span>
                </label>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
