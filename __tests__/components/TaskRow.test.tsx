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
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByText('Review prototype')).toBeInTheDocument()
})

it('fires onToggleDone when the checkbox is clicked', () => {
  const onToggleDone = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={onToggleDone} onEdit={() => {}} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onToggleDone).toHaveBeenCalledWith(taskFixture, true)
})

it('fires onEdit when the title is clicked', () => {
  const onEdit = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={onEdit} onCopyToEvent={() => {}} />)
  fireEvent.click(screen.getByText('Review prototype'))
  expect(onEdit).toHaveBeenCalledWith(taskFixture)
})

it('fires onCopyToEvent when the copy-to-event icon is clicked', () => {
  const onCopyToEvent = jest.fn()
  render(<TaskRow task={taskFixture} urgency="future" onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={onCopyToEvent} />)
  fireEvent.click(screen.getByLabelText('Copy to calendar event'))
  expect(onCopyToEvent).toHaveBeenCalledWith(taskFixture)
})

it('applies urgency-overdue class on the row for a past due date', () => {
  const past: Task = { ...taskFixture, dueDate: '2020-01-01' }
  render(<TaskRow task={past} urgency="overdue" onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('task-row')).toHaveClass('urgency-overdue')
})

it('strikes through title when done', () => {
  const done: Task = { ...taskFixture, done: true }
  render(<TaskRow task={done} urgency="none" onToggleDone={() => {}} onEdit={() => {}} onCopyToEvent={() => {}} />)
  expect(screen.getByTestId('task-row')).toHaveClass('done')
})
