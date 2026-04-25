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
  loading?: boolean
  configured: { herbe: boolean; outlook: boolean; google: boolean }
  errors: SourceError[]
  activeTab: 'all' | TaskSource
  onTabChange: (tab: 'all' | TaskSource) => void
  maximized?: boolean
  onToggleMaximize?: () => void
  handlers: {
    onToggleDone: (task: Task, next: boolean) => void
    onEdit: (task: Task) => void
    onCopyAsTask: (task: Task) => void
    onCopyToEvent: (task: Task) => void
    onCreate: (source: TaskSource) => void
  }
}) {
  const { tasks, loading, configured, errors, activeTab, onTabChange, maximized, onToggleMaximize, handlers } = props
  const visibleSources: TaskSource[] = (['herbe', 'outlook', 'google'] as TaskSource[])
    .filter(s => configured[s])
  const countBy = (s: TaskSource) => tasks.filter(t => t.source === s && !t.done).length
  const total = tasks.filter(t => !t.done).length
  const now = new Date()

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
        {onToggleMaximize && (
          <button
            type="button"
            className="tasks-maximize-btn"
            onClick={onToggleMaximize}
            aria-pressed={!!maximized}
            aria-label={maximized ? 'Exit fullscreen' : 'Maximize tasks'}
            title={maximized ? 'Exit fullscreen' : 'Maximize tasks'}
          >
            {maximized ? (
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M6 3v3H3M10 3v3h3M6 13v-3H3M10 13v-3h3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
      </div>

      {errors.map(e => (
        <div key={e.source} className="stale-banner" role="alert">
          {TAB_LABEL[e.source]}: {e.stale ? 'showing last known state' : "couldn't load"} — {e.msg}
        </div>
      ))}

      {loading && (
        <div className="tasks-loading" role="status" aria-live="polite">
          <span className="tasks-spinner" aria-hidden="true" />
          Loading tasks…
        </div>
      )}

      <div className="tasks-scroll">
        <TasksList
          tab={activeTab}
          tasks={tasks}
          now={now}
          configured={configured}
          handlers={handlers}
        />
      </div>
    </div>
  )
}
