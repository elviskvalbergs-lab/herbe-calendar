'use client'
import type { Task } from '@/types/task'

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
      style={{
        borderLeft: `3px solid ${SOURCE_COLOR[task.source]}`,
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px',
      }}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={e => onToggleDone(task, e.currentTarget.checked)}
        aria-label="Mark done"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={() => onEdit(task)}
          style={{ cursor: 'pointer', textDecoration: task.done ? 'line-through' : 'none' }}
        >
          {task.title}
        </div>
        {(task.dueDate || task.listName) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 3, fontSize: 11, opacity: 0.7 }}>
            {task.dueDate && (
              <span
                data-testid="due-badge"
                className={overdue ? 'overdue' : ''}
              >
                {task.dueDate}
              </span>
            )}
            {task.listName && <span>{task.listName}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <button
          aria-label="Copy to calendar event"
          onClick={() => onCopyToEvent(task)}
        >→📅</button>
        <button
          aria-label="Edit"
          onClick={() => onEdit(task)}
        >✎</button>
      </div>
    </div>
  )
}
