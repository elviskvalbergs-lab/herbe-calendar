/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskRow } from '@/components/TaskRow'
import type { Task } from '@/types/task'

const taskFixture: Task = {
  id: 'herbe:1',
  source: 'herbe',
  sourceConnectionId: 'c1',
  title: 'Review prototype',
  done: false,
  listName: 'Burti · Product',
  dueDate: '2026-04-20',
}

it('renders the title', () => {
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByText('Review prototype')).toBeInTheDocument()
})

it('fires onToggleDone when the checkbox is clicked', () => {
  const onToggleDone = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={onToggleDone} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onToggleDone).toHaveBeenCalledWith(taskFixture, true)
})

it('fires onEdit when the title is clicked', () => {
  const onEdit = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={onEdit} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByText('Review prototype'))
  expect(onEdit).toHaveBeenCalledWith(taskFixture)
})

it('fires onCopyAsTask when the duplicate icon is clicked', () => {
  const onCopyAsTask = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={onCopyAsTask} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByLabelText('Duplicate as task'))
  expect(onCopyAsTask).toHaveBeenCalledWith(taskFixture)
})

it('fires onCopyToEvent when the create-event icon is clicked', () => {
  const onCopyToEvent = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={onCopyToEvent} />)
  fireEvent.click(screen.getByLabelText('Create calendar event from this task'))
  expect(onCopyToEvent).toHaveBeenCalledWith(taskFixture)
})

it('applies urgency-overdue class on the row for a past due date', () => {
  const past: Task = { ...taskFixture, dueDate: '2020-01-01' }
  render(<TaskRow task={past} urgency="overdue" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('task-row')).toHaveClass('urgency-overdue')
})

it('strikes through title when done', () => {
  const done: Task = { ...taskFixture, done: true }
  render(<TaskRow task={done} urgency="none" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('task-row')).toHaveClass('done')
})

it('shows customer name (not connection name) for ERP rows', () => {
  // listName = connection name (used by the sidebar for grouping). The row
  // shows erp.customerName so the connection isn't shown twice.
  const erpTask: Task = {
    id: 'herbe:99', source: 'herbe', sourceConnectionId: 'c1',
    title: 'Call Acme', done: false,
    listName: 'Burti ERP',
    erp: { customerName: 'Acme', projectName: 'Acme onboarding' },
  }
  render(<TaskRow task={erpTask} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByText('Acme')).toBeInTheDocument()
  expect(screen.queryByText('Burti ERP')).not.toBeInTheDocument()
})

it('shows listName for Outlook tasks (the To Do list name)', () => {
  const outlookTask: Task = {
    id: 'outlook:1', source: 'outlook', sourceConnectionId: 'u1',
    title: 'Buy milk', done: false,
    listName: 'Shopping',
  }
  render(<TaskRow task={outlookTask} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyAsTask={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByText('Shopping')).toBeInTheDocument()
})
