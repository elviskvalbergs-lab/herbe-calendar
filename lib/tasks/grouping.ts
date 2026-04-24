import type { Task, TaskSource } from '@/types/task'
import { compareForSidebar } from '@/lib/tasks/urgency'

const UNTITLED = '(untitled)'

export interface ListGroup {
  /** null means render without a sub-header (single-list source). */
  listName: string | null
  tasks: Task[]
}

export interface SourceGroup {
  source: TaskSource
  lists: ListGroup[]
}

export function groupBySourceAndList(
  tasks: Task[],
  sources: TaskSource[],
  now: Date,
): SourceGroup[] {
  return sources.map(source => {
    const sourceTasks = tasks.filter(t => t.source === source && !t.done)

    const byList = new Map<string, Task[]>()
    for (const task of sourceTasks) {
      const key = (task.listName && task.listName.trim()) || UNTITLED
      const bucket = byList.get(key) ?? []
      bucket.push(task)
      byList.set(key, bucket)
    }

    const distinctLists = [...byList.keys()]
    const singleList = distinctLists.length === 1

    const lists: ListGroup[] = distinctLists
      .sort((a, b) => {
        if (a === UNTITLED) return 1
        if (b === UNTITLED) return -1
        return a.localeCompare(b)
      })
      .map(name => ({
        listName: singleList ? null : name,
        tasks: (byList.get(name) ?? []).slice().sort((x, y) => compareForSidebar(x, y, now)),
      }))

    return { source, lists }
  })
}
