'use client'
import type { Task } from '@/types/task'
import type { Urgency } from '@/lib/tasks/urgency'
import { format, parseISO } from 'date-fns'

const SOURCE_COLOR: Record<Task['source'], string> = {
  herbe: '#00AEE7',
  outlook: '#6264a7',
  google: '#4285f4',
}

function formatDueDate(iso: string): string {
  try {
    const d = parseISO(iso)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      ? format(d, 'd MMM')
      : format(d, 'd MMM yyyy')
  } catch {
    return iso
  }
}

function DuplicateIcon() {
  // Two offset rectangles — the universal "duplicate/copy" affordance.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CalendarPlusIcon() {
  // Calendar with a plus — "create calendar event from this".
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M12 14v5M9.5 16.5h5" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

export function TaskRow(props: {
  task: Task
  urgency: Urgency
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyAsTask: (task: Task) => void
  onCopyToEvent: (task: Task) => void
}) {
  const { task, urgency, onToggleDone, onEdit, onCopyAsTask, onCopyToEvent } = props
  const rowClass = ['task-row']
  if (task.done) rowClass.push('done')
  rowClass.push(`urgency-${urgency}`)

  return (
    <div
      data-testid="task-row"
      className={rowClass.join(' ')}
      style={{ borderLeftColor: SOURCE_COLOR[task.source] }}
    >
      <input
        type="checkbox"
        className="task-check"
        checked={task.done}
        onChange={e => onToggleDone(task, e.currentTarget.checked)}
        aria-label="Mark done"
      />
      <div className="task-body" onClick={() => onEdit(task)}>
        <div className="task-title">{task.title}</div>
        {(task.dueDate || task.listName) && (
          <div className="task-meta">
            {task.dueDate && (
              <span data-testid="due-badge" className="task-due">
                {formatDueDate(task.dueDate)}
              </span>
            )}
            {task.listName && <span className="task-list">{task.listName}</span>}
          </div>
        )}
      </div>
      <div className="task-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Duplicate as task"
          title="Duplicate as task"
          onClick={e => { e.stopPropagation(); onCopyAsTask(task) }}
        ><DuplicateIcon /></button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Create calendar event from this task"
          title="Create calendar event"
          onClick={e => { e.stopPropagation(); onCopyToEvent(task) }}
        ><CalendarPlusIcon /></button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Edit"
          title="Edit task"
          onClick={e => { e.stopPropagation(); onEdit(task) }}
        ><EditIcon /></button>
      </div>
    </div>
  )
}
