'use client'
import type { Task, TaskSource } from '@/types/task'
import { TaskRow } from './TaskRow'
import { useState } from 'react'

const SOURCE_LABEL: Record<TaskSource, string> = {
  herbe: 'ERP',
  outlook: 'Outlook',
  google: 'Google',
}

interface CommonHandlers {
  onToggleDone: (task: Task, next: boolean) => void
  onEdit: (task: Task) => void
  onCopyToEvent: (task: Task) => void
  onCreate: (source: TaskSource) => void
}

function SourceSection(props: {
  source: TaskSource
  tasks: Task[]
  handlers: CommonHandlers
  showHeader: boolean
}) {
  const { source, tasks, handlers, showHeader } = props
  const [showCompleted, setShowCompleted] = useState(false)
  const open = tasks.filter(t => !t.done)
  const completed = tasks.filter(t => t.done)

  return (
    <section className="task-section">
      {showHeader && (
        <header className="task-section-hdr">
          <span className="task-section-title">{SOURCE_LABEL[source]}</span>
          <span className="task-section-count">{open.length}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost task-new-btn"
            onClick={() => handlers.onCreate(source)}
          >
            <span aria-hidden="true">+</span> New task
          </button>
        </header>
      )}
      <div>
        {open.length === 0 && (
          <p className="task-empty">No open tasks.</p>
        )}
        {open.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onToggleDone={handlers.onToggleDone}
            onEdit={handlers.onEdit}
            onCopyToEvent={handlers.onCopyToEvent}
          />
        ))}
      </div>
      {completed.length > 0 && (
        <>
          <button
            type="button"
            className="task-done-toggle"
            onClick={() => setShowCompleted(s => !s)}
          >
            {showCompleted ? '▾' : '▸'} {completed.length} completed
          </button>
          {showCompleted && completed.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onToggleDone={handlers.onToggleDone}
              onEdit={handlers.onEdit}
              onCopyToEvent={handlers.onCopyToEvent}
            />
          ))}
        </>
      )}
    </section>
  )
}

export function TasksList(props: {
  tab: 'all' | TaskSource
  tasks: Task[]
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  handlers: CommonHandlers
}) {
  const { tab, tasks, configured, handlers } = props
  if (tab === 'all') {
    const sources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
      .filter(s => configured[s])
    return (
      <div>
        {sources.map(s => (
          <SourceSection
            key={s}
            source={s}
            tasks={tasks.filter(t => t.source === s)}
            handlers={handlers}
            showHeader={true}
          />
        ))}
      </div>
    )
  }
  return (
    <SourceSection
      source={tab}
      tasks={tasks.filter(t => t.source === tab)}
      handlers={handlers}
      showHeader={true}
    />
  )
}
