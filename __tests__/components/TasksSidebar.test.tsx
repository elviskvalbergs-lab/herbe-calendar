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
