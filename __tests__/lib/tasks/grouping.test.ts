import { groupBySourceAndList } from '@/lib/tasks/grouping'
import type { Task, TaskSource } from '@/types/task'

const NOW = new Date(2026, 3, 24, 12, 0, 0)

function t(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? 'x',
    source: partial.source ?? 'outlook',
    title: partial.title ?? 'Task',
    done: partial.done ?? false,
    dueDate: partial.dueDate,
    listName: partial.listName,
  }
}

describe('groupBySourceAndList', () => {
  const ALL: TaskSource[] = ['herbe', 'outlook', 'google']

  it('preserves the source order supplied', () => {
    const tasks = [
      t({ id: 'o', source: 'outlook', listName: 'Tasks' }),
      t({ id: 'h', source: 'herbe',   listName: 'Burti' }),
      t({ id: 'g', source: 'google',  listName: 'My Tasks' }),
    ]
    const result = groupBySourceAndList(tasks, ALL, NOW)
    expect(result.map(g => g.source)).toEqual(['herbe', 'outlook', 'google'])
  })

  it('drops done tasks from grouping', () => {
    const tasks = [
      t({ id: 'open', source: 'outlook', listName: 'Tasks', done: false }),
      t({ id: 'done', source: 'outlook', listName: 'Tasks', done: true }),
    ]
    const result = groupBySourceAndList(tasks, ['outlook'], NOW)
    const outlook = result.find(r => r.source === 'outlook')!
    const ids = outlook.lists.flatMap(l => l.tasks.map(t => t.id))
    expect(ids).toEqual(['open'])
  })

  it('returns listName=null when a source has exactly one distinct list', () => {
    const tasks = [
      t({ id: '1', source: 'outlook', listName: 'Tasks' }),
      t({ id: '2', source: 'outlook', listName: 'Tasks' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists).toHaveLength(1)
    expect(outlook.lists[0].listName).toBeNull()
    expect(outlook.lists[0].tasks.map(x => x.id).sort()).toEqual(['1', '2'])
  })

  it('returns multiple list groups, sorted by name, (untitled) last', () => {
    const tasks = [
      t({ id: 'u', source: 'outlook', listName: undefined }),
      t({ id: 't', source: 'outlook', listName: 'Tasks' }),
      t({ id: 'b', source: 'outlook', listName: 'Books' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists.map(l => l.listName)).toEqual(['Books', 'Tasks', '(untitled)'])
  })

  it('within a list, orders tasks by urgency then date', () => {
    const tasks = [
      t({ id: 'future',  source: 'outlook', listName: 'Tasks', dueDate: '2026-05-01' }),
      t({ id: 'overdue', source: 'outlook', listName: 'Tasks', dueDate: '2026-04-10' }),
      t({ id: 'today',   source: 'outlook', listName: 'Tasks', dueDate: '2026-04-24' }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.lists[0].tasks.map(t => t.id)).toEqual(['overdue', 'today', 'future'])
  })

  it('drops sources with no open tasks from the list array', () => {
    const tasks = [
      t({ id: 'done', source: 'outlook', listName: 'Tasks', done: true }),
    ]
    const [outlook] = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(outlook.source).toBe('outlook')
    expect(outlook.lists).toEqual([])
  })

  it('excludes sources not in the supplied sources argument', () => {
    const tasks = [
      t({ id: 'h', source: 'herbe', listName: 'Burti' }),
      t({ id: 'o', source: 'outlook', listName: 'Tasks' }),
    ]
    const result = groupBySourceAndList(tasks, ['outlook'], NOW)
    expect(result.map(r => r.source)).toEqual(['outlook'])
  })
})
