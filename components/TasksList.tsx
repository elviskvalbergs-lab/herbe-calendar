'use client'
import type { Task, TaskSource } from '@/types/task'
import { TaskRow } from './TaskRow'
import { useState } from 'react'

const SOURCE_LABEL: Record<TaskSource, string> = {
  herbe: 'Standard ERP',
  outlook: 'Microsoft To Do',
  google: 'Google Tasks',
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
    <section>
      {showHeader && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 4px' }}>
          <strong>{SOURCE_LABEL[source]}</strong>
          <span style={{ opacity: 0.5, fontSize: 11 }}>{open.length}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => handlers.onCreate(source)}>+ New task</button>
        </header>
      )}
      <div>
        {open.length === 0 && (
          <p style={{ opacity: 0.5, padding: '6px 14px', fontSize: 12 }}>No open tasks.</p>
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
            onClick={() => setShowCompleted(s => !s)}
            style={{ padding: '4px 14px', fontSize: 11, opacity: 0.6, width: '100%', textAlign: 'left' }}
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
