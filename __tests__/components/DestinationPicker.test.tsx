/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { DestinationPicker, __resetDestinationsCacheForTests } from '@/components/DestinationPicker'
import type { Destination } from '@/lib/destinations/types'

function mockFetchOnce(data: Destination[], status = 200) {
  global.fetch = jest.fn(async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => data }) as unknown as Response,
  ) as typeof fetch
}

const ERP_BURTI: Destination = {
  key: 'herbe:conn-1', source: 'herbe', label: 'Burti', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
}
const ERP_FLEX: Destination = {
  key: 'herbe:conn-2', source: 'herbe', label: 'Flex BI', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-2', connectionName: 'Flex BI' },
}
const OUTLOOK_TASKS: Destination = {
  key: 'outlook:LIST-A', source: 'outlook', label: 'Tasks', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' },
}
const OUTLOOK_SHOPPING: Destination = {
  key: 'outlook:LIST-B', source: 'outlook', label: 'Shopping', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-B', listName: 'Shopping' },
}

beforeEach(() => { __resetDestinationsCacheForTests() })
afterEach(() => { jest.restoreAllMocks() })

it('renders grouped options for each source after fetch resolves', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const trigger = await screen.findByRole('combobox')
  // Wait for the picker to finish its auto-fire so we know the list is loaded.
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  fireEvent.click(trigger)
  // Group headers and options are rendered after opening the menu.
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  expect(screen.getByText('ERP')).toBeInTheDocument()
  expect(screen.getByText('Outlook')).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /ERP · Burti/ })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: /Outlook · Tasks/ })).toBeInTheDocument()
})

it('calls onChange with the full Destination when the user picks an option', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const trigger = await screen.findByRole('combobox')
  // Wait for the auto-fire from onChange (first destination on load).
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  onChange.mockClear()
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole('option', { name: /Outlook · Tasks/ }))
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_TASKS)
})

it('renders an empty-state when no destinations come back', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  // The trigger combobox is no longer rendered — only the disabled empty marker.
  expect(await screen.findByText(/no destinations/i)).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('uses the correct endpoint for event mode', async () => {
  mockFetchOnce([])
  render(<DestinationPicker mode="event" value={null} onChange={() => {}} />)
  await screen.findByText(/no destinations/i)
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

it('reconciles editLabelHint when value is the synthetic empty key', async () => {
  // Edit-mode: outlook task whose listId is unknown until the fetch resolves.
  // Picker matches by label === editLabelHint and fires onChange with the real
  // destination so the parent learns the proper key.
  mockFetchOnce([OUTLOOK_TASKS, OUTLOOK_SHOPPING])
  const onChange = jest.fn()
  render(
    <DestinationPicker
      mode="task"
      value=""
      editLabelHint="Shopping"
      onChange={onChange}
    />,
  )
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(OUTLOOK_SHOPPING))
})

// --- Account-key cache isolation -----------------------------------------------------

it('keys the destinations cache by accountId so a tenant switch refetches', async () => {
  // Two renders with different accountIds must trigger two fetches even within
  // the cache TTL window, otherwise data from tenant A leaks to tenant B after
  // the user runs Ctrl+Cmd+A.
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [ERP_BURTI] })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [ERP_FLEX] })
  global.fetch = fetchMock as unknown as typeof fetch

  const { unmount } = render(
    <DestinationPicker mode="task" value={null} accountId="acct-A" onChange={() => {}} />,
  )
  await screen.findByRole('combobox')
  unmount()

  render(
    <DestinationPicker mode="task" value={null} accountId="acct-B" onChange={() => {}} />,
  )
  await screen.findByRole('combobox')
  // Two distinct fetches — the cache did not collapse them.
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('reuses the cache for the same accountId+mode within the TTL', async () => {
  // Sanity check: the cache key still cooperates within a single tenant.
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => [ERP_BURTI],
  })
  global.fetch = fetchMock as unknown as typeof fetch
  const { unmount } = render(
    <DestinationPicker mode="task" value={null} accountId="acct-A" onChange={() => {}} />,
  )
  await screen.findByRole('combobox')
  unmount()
  render(
    <DestinationPicker mode="task" value={null} accountId="acct-A" onChange={() => {}} />,
  )
  await screen.findByRole('combobox')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

// --- Error states --------------------------------------------------------------------

it('renders a sign-in prompt on 401 instead of an empty list', async () => {
  // Regression for: r.ok ? r.json() : [] used to make 401 indistinguishable
  // from "no destinations configured", which left users staring at a disabled
  // dropdown after their session expired.
  mockFetchOnce([] as Destination[], 401)
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(/sign in again/i)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('renders a Retry button on ≥500 and refetches on click', async () => {
  // Regression for: the same failed-call collapse for transient server errors.
  // Now we expose a Retry that re-runs the fetch.
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [ERP_BURTI] })
  global.fetch = fetchMock as unknown as typeof fetch
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  const retry = await screen.findByRole('button', { name: /retry/i })
  fireEvent.click(retry)
  await screen.findByRole('combobox')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('does not cache a failed fetch', async () => {
  // Regression for: the original code wrote `[]` to the cache on a 401/500,
  // which then served the empty list to every subsequent open until TTL.
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [ERP_BURTI] })
  global.fetch = fetchMock as unknown as typeof fetch
  const { unmount } = render(
    <DestinationPicker mode="task" value={null} accountId="acct-A" onChange={() => {}} />,
  )
  await screen.findByRole('alert')
  unmount()
  // A fresh render with the same accountId+mode must hit the network again.
  render(
    <DestinationPicker mode="task" value={null} accountId="acct-A" onChange={() => {}} />,
  )
  await screen.findByRole('combobox')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

// --- Keyboard navigation -------------------------------------------------------------

it('opens with ArrowDown, moves with arrows, selects with Enter', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS, OUTLOOK_SHOPPING])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const trigger = await screen.findByRole('combobox')
  // Wait for auto-fire so we know the list is loaded.
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  onChange.mockClear()
  act(() => trigger.focus())
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  // Sort order: ERP (Burti), Outlook (Shopping, Tasks). activeIdx starts at the
  // selected ERP_BURTI (index 0). One ArrowDown after open moves to Shopping (1).
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_SHOPPING)
})

it('Escape closes the menu and returns focus to the trigger', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  const trigger = await screen.findByRole('combobox')
  fireEvent.click(trigger)
  expect(await screen.findByRole('listbox')).toBeInTheDocument()
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it('Home/End jump to first/last option', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_SHOPPING, OUTLOOK_TASKS])
  const onChange = jest.fn()
  render(<DestinationPicker mode="task" value={null} onChange={onChange} />)
  const trigger = await screen.findByRole('combobox')
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  onChange.mockClear()
  fireEvent.click(trigger)
  fireEvent.keyDown(trigger, { key: 'End' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  // Last option in sort order: Outlook · Tasks (Shopping < Tasks alphabetically).
  expect(onChange).toHaveBeenCalledWith(OUTLOOK_TASKS)
})

it('exposes aria-controls and aria-activedescendant for AT', async () => {
  mockFetchOnce([ERP_BURTI, OUTLOOK_TASKS])
  render(<DestinationPicker mode="task" value={null} onChange={() => {}} />)
  const trigger = await screen.findByRole('combobox')
  fireEvent.click(trigger)
  const listbox = await screen.findByRole('listbox')
  expect(trigger).toHaveAttribute('aria-controls', listbox.id)
  expect(trigger).toHaveAttribute('aria-activedescendant')
  const activeId = trigger.getAttribute('aria-activedescendant')!
  expect(document.getElementById(activeId)).not.toBeNull()
})
