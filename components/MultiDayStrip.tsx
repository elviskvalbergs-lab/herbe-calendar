'use client'
import { useState, useEffect } from 'react'
import type { Activity } from '@/types'
import type { Task } from '@/types/task'

interface Props {
  date: string                              // yyyy-MM-dd for this column
  allDayActivities: Activity[]              // activities with isAllDay=true on this date
  tasks: Task[]                             // tasks whose dueDate matches this date
  holidayName?: string                      // National/regional holiday name for this column
  collapsed: boolean
  /** Forced min-height in px so all columns of the band align uniformly. */
  minBodyHeight?: number
  getActivityColor: (a: Activity) => string
  onActivityClick?: (a: Activity) => void
  onTaskToggle?: (task: Task, next: boolean) => void
  onTaskClick?: (task: Task) => void
}

const ROW_H = 20    // px height per chip / task row
const ROW_GAP = 2

/**
 * Per-column cell of the all-day band. Renders, in order:
 *  - Holiday chip (red-tinted) if holidayName is set
 *  - All-day / multi-day activities as colored chips
 *  - Tasks with dueDate == date as checkbox rows
 *
 * Multi-day events arrive duplicated per-day from ICS / Outlook, so chips
 * naturally form a continuous horizontal band across adjacent columns.
 *
 * `minBodyHeight` is supplied by CalendarGrid based on the maximum cell
 * content across all visible columns, so the band reads as one uniform-height
 * row even when individual days have nothing in them.
 */
export default function MultiDayStrip({
  date,
  allDayActivities,
  tasks,
  holidayName,
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

  // When collapsed, the band still renders an empty cell of fixed height
  // (the parent CalendarGrid renders a thin collapsed-band row separately).
  if (collapsed) return null

  return (
    <div
      className="mds-col"
      style={{
        padding: '4px 4px',
        background: 'var(--app-bg-alt)',
        borderRight: '1px solid var(--app-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: ROW_GAP,
        minHeight: minBodyHeight ? `${minBodyHeight}px` : undefined,
      }}
    >
      {holidayName && (
        <div
          className="mds-holiday"
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
      {allDayActivities.map(a => {
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
              padding: '0 4px',
              borderRadius: 2,
              minHeight: ROW_H,
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
 * The toggle row rendered by CalendarGrid above the per-column strip cells.
 * Spans the full width and shows total counts when collapsed.
 */
export function MultiDayBandToggle({
  collapsed,
  onToggle,
  totalAllDay,
  totalTasks,
}: {
  collapsed: boolean
  onToggle: () => void
  totalAllDay: number
  totalTasks: number
}) {
  if (totalAllDay === 0 && totalTasks === 0) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? 'Expand all-day band' : 'Collapse all-day band'}
      className="mds-band-toggle"
      style={{
        position: 'sticky',
        left: 0,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px 3px 6px',
        background: 'var(--app-bg-alt)',
        borderBottom: '1px solid var(--app-line)',
        borderRight: '1px solid var(--app-line)',
        width: 'var(--time-col-w, 56px)',
        minWidth: 'var(--time-col-w, 56px)',
        color: 'var(--app-fg-subtle)',
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'inherit',
      }}
    >
      <svg
        width="10" height="10" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }}
      >
        <path d="m6 9 6 6 6-6"/>
      </svg>
      {collapsed && totalAllDay > 0 && <span>{totalAllDay}</span>}
      {collapsed && totalTasks > 0 && <span style={{ opacity: 0.7 }}>·{totalTasks}t</span>}
    </button>
  )
}
