'use client'
import type { Task, TaskSource } from '@/types/task'
import { TasksList } from './TasksList'

interface SourceError { source: TaskSource; msg: string; stale?: boolean }

const TAB_LABEL: Record<TaskSource, string> = {
  herbe: 'ERP',
  outlook: 'Outlook',
  google: 'Google',
}

export function TasksSidebar(props: {
  tasks: Task[]
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  errors: SourceError[]
  activeTab: 'all' | TaskSource
  onTabChange: (tab: 'all' | TaskSource) => void
  handlers: {
    onToggleDone: (task: Task, next: boolean) => void
    onEdit: (task: Task) => void
    onCopyToEvent: (task: Task) => void
    onCreate: (source: TaskSource) => void
  }
}) {
  const { tasks, configured, errors, activeTab, onTabChange, handlers } = props
  const visibleSources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
    .filter(s => configured[s])
  const countBy = (s: TaskSource) => tasks.filter(t => t.source === s && !t.done).length
  const total = tasks.filter(t => !t.done).length

  return (
    <div className="tasks-sidebar">
      <div className="tasks-tabs" role="tablist">
        <button
          onClick={() => onTabChange('all')}
          aria-pressed={activeTab === 'all'}
        >All <span>{total}</span></button>
        {visibleSources.map(s => (
          <button
            key={s}
            onClick={() => onTabChange(s)}
            aria-pressed={activeTab === s}
          >{TAB_LABEL[s]} <span>{countBy(s)}</span></button>
        ))}
      </div>

      {errors.filter(e => e.stale).map(e => (
        <div key={e.source} className="stale-banner" role="alert">
          {TAB_LABEL[e.source]}: showing last known state ({e.msg}).
        </div>
      ))}

      <div className="tasks-scroll">
        <TasksList
          tab={activeTab}
          tasks={tasks}
          configured={configured}
          handlers={handlers}
        />
      </div>
    </div>
  )
}
