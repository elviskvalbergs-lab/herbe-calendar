/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DestinationPicker, __resetDestinationsCacheForTests } from '@/components/DestinationPicker'
import type { Destination } from '@/lib/destinations/types'

function mockFetchOnce(data: Destination[]) {
  global.fetch = jest.fn(async () =>
    ({ ok: true, status: 200, json: async () => data }) as unknown as Response,
  ) as typeof fetch
}

const ERP_BURTI: Destination = {
  key: 'herbe:conn-1', source: 'herbe', label: 'Burti', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
}
const OUTLOOK_TASKS: Destination = {
  key: 'outlook:LIST-A', source: 'outlook', label: 'Tasks', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' },
}

beforeEach(() => { __resetDestinationsCacheForTests() })
afterEach(() => { jest.restoreAllMocks() })

it('renders optgroups per source with prefixed option labels', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
  expect(screen.getByRole('group', { name: 'ERP' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Outlook' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /ERP · Burti/ })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Outlook · Tasks/ })).toBeInTheDocument()
})

it('calls onChange with the full Destination when the user picks one', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const select = await screen.findByRole('combobox')
  // Wait for the auto-fire from onChange (first destination on load).
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  onChange.mockClear()
  fireEvent.change(select, { target: { value: 'outlook:LIST-A' } })
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_TASKS)
})

it('renders a disabled empty-state when no destinations come back', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  const select = await screen.findByRole('combobox')
  expect(select).toBeDisabled()
  expect(screen.getByText(/no destinations/i)).toBeInTheDocument()
})

it('uses the correct endpoint for event mode', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="event" value={null} onChange={() => {}} />)
  await screen.findByRole('combobox')
  const fetchMock = global.fetch as jest.Mock
  expect(fetchMock).toHaveBeenCalledWith('/api/destinations?mode=event')
})

it('auto-fires onChange with initialKey destination on first load', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} initialKey="outlook:LIST-A" onChange={onChange} />)
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_TASKS)
})

it('auto-fires onChange with first destination when initialKey is stale', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} initialKey="google:deleted:deleted" onChange={onChange} />)
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(onChange).toHaveBeenCalledWith(ERP_BURTI)
})
