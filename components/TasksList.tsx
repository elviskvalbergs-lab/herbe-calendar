'use client'
import type { Task, TaskSource } from '@/types/task'
import { TaskRow } from './TaskRow'
import { groupBySourceAndList } from '@/lib/tasks/grouping'
import { classifyUrgency } from '@/lib/tasks/urgency'
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
  now: Date
  handlers: CommonHandlers
  showHeader: boolean
}) {
  const { source, tasks, now, handlers, showHeader } = props
  const [showCompleted, setShowCompleted] = useState(false)
  const [sourceGroup] = groupBySourceAndList(tasks, [source], now)
  const openCount = sourceGroup.lists.reduce((n, l) => n + l.tasks.length, 0)
  const completed = tasks.filter(t => t.done)

  return (
    <section className="task-section">
      {showHeader && (
        <header className="task-section-hdr">
          <span className="task-section-title">{SOURCE_LABEL[source]}</span>
          <span className="task-section-count">{openCount}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost task-new-btn"
            onClick={() => handlers.onCreate(source)}
          >
            <span aria-hidden="true">+</span> New task
          </button>
        </header>
      )}
      {sourceGroup.lists.length === 0 && (
        <p className="task-empty">No open tasks.</p>
      )}
      {sourceGroup.lists.map((list, idx) => (
        <div key={list.listName ?? `__single__${idx}`}>
          {list.listName !== null && (
            <h4 className="task-list-hdr">
              <span>{list.listName}</span>
              <span className="task-list-count">{list.tasks.length}</span>
            </h4>
          )}
          {list.tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              urgency={classifyUrgency(task.dueDate, task.done, now)}
              onToggleDone={handlers.onToggleDone}
              onEdit={handlers.onEdit}
              onCopyToEvent={handlers.onCopyToEvent}
            />
          ))}
        </div>
      ))}
      {completed.length > 0 && (
        <>
          <button
            type="button"
            className="task-done-toggle"
            onClick={() => setShowCompleted(s => !s)}
          >
            {showCompleted ? '▾' : '▸'} {completed.length} completed
          </button>
          {showCompleted && completed.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              urgency="none"
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
  now: Date
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  handlers: CommonHandlers
}) {
  const { tab, tasks, now, configured, handlers } = props
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
            now={now}
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
      now={now}
      handlers={handlers}
      showHeader={true}
    />
  )
}
