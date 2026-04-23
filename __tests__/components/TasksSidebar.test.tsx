/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { TasksSidebar } from '@/components/TasksSidebar'
import type { Task } from '@/types/task'

const tasks: Task[] = [
  { id: 'herbe:1', source: 'herbe', sourceConnectionId: 'c1', title: 'E', done: false },
  { id: 'outlook:1', source: 'outlook', sourceConnectionId: '', title: 'O', done: false },
]

const noopHandlers = { onToggleDone: jest.fn(), onEdit: jest.fn(), onCopyToEvent: jest.fn(), onCreate: jest.fn() }

it('only renders tabs for configured sources', () => {
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: false }}
      errors={[]}
      activeTab="all"
      onTabChange={() => {}}
      handlers={noopHandlers}
    />,
  )
  expect(screen.getByRole('button', { name: /ERP/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Outlook/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
})

it('switching tab calls onTabChange', () => {
  const onTabChange = jest.fn()
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: true }}
      errors={[]}
      activeTab="all"
      onTabChange={onTabChange}
      handlers={noopHandlers}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Outlook/ }))
  expect(onTabChange).toHaveBeenCalledWith('outlook')
})

it('shows stale banner when a source is stale', () => {
  render(
    <TasksSidebar
      tasks={tasks}
      configured={{ herbe: true, outlook: true, google: false }}
      errors={[{ source: 'outlook', msg: 'timeout', stale: true }]}
      activeTab="all"
      onTabChange={() => {}}
      handlers={noopHandlers}
    />,
  )
  expect(screen.getByText(/last known state/i)).toBeInTheDocument()
})

it('actually renders task rows for each source when populated', () => {
  const populated: Task[] = [
    { id: 'herbe:10', source: 'herbe', sourceConnectionId: 'c1', title: 'ERP one', done: false },
    { id: 'herbe:11', source: 'herbe', sourceConnectionId: 'c1', title: 'ERP two done', done: true },
    { id: 'outlook:20', source: 'outlook', sourceConnectionId: '', title: 'Outlook one', done: false },
  ]
  render(
    <TasksSidebar
      tasks={populated}
      configured={{ herbe: true, outlook: true, google: false }}
      errors={[]}
      activeTab="all"
      onTabChange={() => {}}
      handlers={noopHandlers}
    />,
  )
  const rows = screen.getAllByTestId('task-row')
  // Completed task is hidden by default — should see 2 open rows
  expect(rows).toHaveLength(2)
  expect(screen.getByText('ERP one')).toBeInTheDocument()
  expect(screen.getByText('Outlook one')).toBeInTheDocument()
})
