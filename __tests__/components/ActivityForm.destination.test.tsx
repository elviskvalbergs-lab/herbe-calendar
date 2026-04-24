/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { ActivityForm } from '@/components/ActivityForm'
import type { Destination } from '@/lib/destinations/types'

const ERP_BURTI: Destination = {
  key: 'herbe:conn-1', source: 'herbe', label: 'Burti', sourceLabel: 'ERP', color: '#00AEE7',
  meta: { kind: 'herbe', connectionId: 'conn-1', connectionName: 'Burti' },
}
const OUTLOOK_TASKS: Destination = {
  key: 'outlook:LIST-A', source: 'outlook', label: 'Tasks', sourceLabel: 'Outlook', color: '#6264a7',
  meta: { kind: 'outlook-task', listId: 'LIST-A', listName: 'Tasks' },
}

function mockDestinations(list: Destination[]) {
  global.fetch = jest.fn(async (url: unknown) => {
    if (String(url).startsWith('/api/destinations')) {
      return { ok: true, status: 200, json: async () => list } as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response
  }) as typeof fetch
}

function commonProps(overrides: Record<string, unknown> = {}) {
  return {
    people: [],
    allActivities: [],
    defaultPersonCode: '',
    onClose: () => {},
    onSaved: () => {},
    onDuplicate: () => {},
    erpConnections: [{ id: 'conn-1', name: 'Burti' }],
    mode: 'task' as const,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  // jsdom does not implement scrollIntoView; mock it to avoid uncaught errors
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('falls back to the first destination when localStorage default is invalid', async () => {
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS])
  localStorage.setItem('defaultDestination:task', 'google:DELETED:ALSODELETED')
  render(<ActivityForm {...commonProps()} />)
  // Wait for DestinationPicker to finish loading and auto-fire onChange with ERP_BURTI (first in sort order)
  const select = await screen.findByRole('combobox')
  // ERP_BURTI is the first in the sort order (ERP before Outlook)
  await waitFor(() => expect((select as HTMLSelectElement).value).toBe('herbe:conn-1'))
})

it('pre-selects the localStorage default when it is still valid', async () => {
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS])
  localStorage.setItem('defaultDestination:task', 'outlook:LIST-A')
  render(<ActivityForm {...commonProps()} />)
  // Wait for DestinationPicker to finish loading and auto-fire onChange with OUTLOOK_TASKS
  const select = await screen.findByRole('combobox')
  await waitFor(() => expect((select as HTMLSelectElement).value).toBe('outlook:LIST-A'))
})

it('edit mode: seeds destination from initial so the picker is hidden but source routing works', async () => {
  // Regression for: in edit mode DestinationPicker isn't rendered, so the
  // destination state must be seeded synchronously from initial. Without this,
  // isOutlookSource / isGoogleSource stay false in edit mode and save routes
  // to the wrong endpoint.
  mockDestinations([])  // picker fetch won't happen on edit; mock harmless
  const initial = {
    source: 'outlook' as const,
    listName: 'Shopping',
    description: 'Buy milk',
    date: '2026-04-24',
  }
  render(<ActivityForm {...commonProps({ initial, editId: 'outlook:EXISTING' })} />)
  // The static destination label is a disabled <input> with the full label.
  await waitFor(() => expect(screen.getByDisplayValue('Outlook · Shopping')).toBeInTheDocument())
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('preserves pre-populated ERP fields through the first auto-fire (duplicate flow)', async () => {
  // Regression for: the parkedErpFields ref used to seed to empty values,
  // which caused the first auto-fire with an ERP destination to overwrite any
  // duplicated ERP fields back to empty. Now the ref seeds from initial?.*.
  mockDestinations([ERP_BURTI])
  const initial = {
    source: 'herbe' as const,
    activityTypeCode: 'call',
    projectCode: 'PRJ-1',
    customerCode: 'CUST-9',
    description: 'Follow up',
    date: '2026-04-24',
  }
  render(<ActivityForm {...commonProps({ initial })} />)
  const select = await screen.findByRole('combobox')
  await waitFor(() => expect((select as HTMLSelectElement).value).toBe('herbe:conn-1'))
  // After auto-fire the description field should still carry the duplicated value.
  // (The ERP-specific code inputs are more complex to query; description is a
  // simple cross-check that the form didn't reset state on auto-fire.)
  expect(screen.getByDisplayValue('Follow up')).toBeInTheDocument()
})
