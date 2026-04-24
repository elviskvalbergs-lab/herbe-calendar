'use client'
import { useState, useEffect } from 'react'
import type { Activity } from '@/types'
import type { Task } from '@/types/task'

interface Props {
  date: string                              // yyyy-MM-dd for this column
  allDayActivities: Activity[]              // activities with isAllDay=true on this date
  tasks: Task[]                             // tasks whose dueDate matches this date
  collapsed: boolean
  getActivityColor: (a: Activity) => string
  onActivityClick?: (a: Activity) => void
  onTaskToggle?: (task: Task, next: boolean) => void
  onTaskClick?: (task: Task) => void
}

/**
 * Per-day-column strip rendered between the day header and the time-grid body.
 * Shows:
 *  - All-day / multi-day activities as colored chips
 *  - Tasks (with dueDate == date) as checkbox rows
 *
 * Multi-day events arrive duplicated per-day (see lib/icsParser.ts), so rendering
 * one chip per day naturally forms a continuous horizontal band across adjacent
 * day columns — matches the "Gantt-bar" intent in the design without requiring
 * a cross-column spanning layout.
 */
export default function MultiDayStrip({
  date,
  allDayActivities,
  tasks,
  collapsed,
  getActivityColor,
  onActivityClick,
  onTaskToggle,
  onTaskClick,
}: Props) {
  // Use internal state mirror so checkbox click is snappy; parent toggles via API.
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({})
  useEffect(() => {
    // Resync whenever the incoming tasks change (e.g. server refetch).
    const m: Record<string, boolean> = {}
    for (const t of tasks) m[t.id] = t.done
    setLocalDone(m)
  }, [tasks])

  if (allDayActivities.length === 0 && tasks.length === 0) return null
  if (collapsed) return null

  return (
    <div
      className="mds-col"
      style={{
        padding: '2px 4px 4px',
        background: 'var(--app-bg-alt)',
        borderBottom: '1px solid var(--app-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 0,
      }}
    >
      {allDayActivities.map(a => {
        const color = getActivityColor(a)
        return (
          <div
            key={a.id}
            onClick={() => onActivityClick?.(a)}
            className="mds-chip"
            style={{
              height: 18,
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
      {tasks.map(t => {
        const done = localDone[t.id] ?? t.done
        return (
          <label
            key={t.id}
            className="mds-task"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '1px 4px',
              borderRadius: 2,
              minHeight: 18,
              cursor: 'pointer',
              textDecoration: done ? 'line-through' : 'none',
              opacity: done ? 0.6 : 1,
            }}
          >
            <span
              className="mds-task-check"
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
}

/**
 * Compact collapsed-state badge shown in the time-gutter to indicate hidden
 * strip content. Exported so CalendarGrid can render it in the left rail.
 */
export function MultiDayStripBadge({
  totalAllDay,
  totalTasks,
  onExpand,
}: {
  totalAllDay: number
  totalTasks: number
  onExpand: () => void
}) {
  if (totalAllDay === 0 && totalTasks === 0) return null
  return (
    <button
      type="button"
      onClick={onExpand}
      className="mds-badge"
      title="Show all-day events and tasks"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        fontWeight: 600,
        color: 'var(--app-fg-subtle)',
        background: 'transparent',
        border: 'none',
        padding: '2px 4px',
        cursor: 'pointer',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      {totalAllDay > 0 && <span>{totalAllDay}</span>}
      {totalTasks > 0 && <span style={{ opacity: 0.7 }}>·{totalTasks}t</span>}
    </button>
  )
}
