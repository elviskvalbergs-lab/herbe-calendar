'use client'
import type { Task } from '@/types/task'
import { format, parseISO } from 'date-fns'

const SOURCE_COLOR: Record<Task['source'], string> = {
  herbe: '#00AEE7',
  outlook: '#6264a7',
  google: '#4285f4',
}

function isOverdue(dueDate: string | undefined, done: boolean): boolean {
  if (!dueDate || done) return false
  const today = new Date().toISOString().slice(0, 10)
  return dueDate < today
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

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="14" height="17" rx="2" />
      <path d="M8 2h9a2 2 0 0 1 2 2v13" />
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
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
}) {
  const { task, onToggleDone, onEdit, onCopyToEvent } = props
  const overdue = isOverdue(task.dueDate, task.done)

  return (
    <div
      data-testid="task-row"
      className={`task-row ${task.done ? 'done' : ''}`}
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
              <span
                data-testid="due-badge"
                className={`task-due ${overdue ? 'overdue' : ''}`}
              >
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
          aria-label="Copy to calendar event"
          title="Copy to calendar"
          onClick={e => { e.stopPropagation(); onCopyToEvent(task) }}
        ><CopyIcon /></button>
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
