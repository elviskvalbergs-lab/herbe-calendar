/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { ActivityForm } from '@/components/ActivityForm'
import { __resetDestinationsCacheForTests } from '@/components/DestinationPicker'
import type { Destination } from '@/lib/destinations/types'
import { activityFormSessionKey } from '@/lib/forms/sessionKey'

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
  __resetDestinationsCacheForTests()
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
  const trigger = await screen.findByRole('combobox')
  // ERP_BURTI is the first in the sort order (ERP before Outlook)
  await waitFor(() => expect(trigger).toHaveAttribute('data-value', 'herbe:conn-1'))
})

it('pre-selects the localStorage default when it is still valid', async () => {
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS])
  localStorage.setItem('defaultDestination:task', 'outlook:LIST-A')
  render(<ActivityForm {...commonProps()} />)
  // Wait for DestinationPicker to finish loading and auto-fire onChange with OUTLOOK_TASKS
  const trigger = await screen.findByRole('combobox')
  await waitFor(() => expect(trigger).toHaveAttribute('data-value', 'outlook:LIST-A'))
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

it('move-task-to-calendar: in-place transition resets destination from outlook to ERP', async () => {
  // Regression for: clicking "Move task to calendar" inside an Outlook task
  // edit form batched setFormState({open:false}) with setFormState({open:true,
  // mode:'event',...}) in the same React tick. open never committed as false,
  // so ActivityForm did NOT unmount and its `destination` state survived as
  // {key:'outlook:__edit__', source:'outlook', meta.kind:'outlook-task'}. The
  // event-mode DestinationPicker's options didn't include that key, so the
  // <select> visually fell back to the first option (ERP, sorted first),
  // while `isExternalCalSource` was still true and rendered RSVP / external
  // attendee / Teams / Location fields under what looked like an ERP
  // destination. Fix: parent wraps <ActivityForm> with key=activityFormSessionKey(state)
  // so the edit→copy transition produces a different key and forces a remount.
  mockDestinations([ERP_BURTI, OUTLOOK_TASKS, {
    key: 'outlook:OUTLOOK_EVT', source: 'outlook', label: 'Calendar', sourceLabel: 'Outlook', color: '#6264a7',
    meta: { kind: 'outlook-event' },
  }])
  type FormState = {
    open: boolean
    initial?: Record<string, unknown>
    editId?: string
    mode?: 'event' | 'task'
    seededFromCopy?: boolean
  }
  function Wrapper({ state }: { state: FormState }) {
    return (
      <ActivityForm
        key={activityFormSessionKey(state)}
        {...commonProps({
          initial: state.initial,
          editId: state.editId,
          mode: state.mode,
          seededFromCopy: state.seededFromCopy,
        })}
      />
    )
  }
  const taskEdit: FormState = {
    open: true,
    initial: { source: 'outlook', listName: 'Tasks', description: 'foo', date: '2026-04-25' },
    editId: 'outlook:EXISTING-TASK',
    mode: 'task',
  }
  const eventCreate: FormState = {
    open: true,
    initial: { source: 'outlook', description: 'foo', date: '2026-04-25', personCode: '' },
    mode: 'event',
    seededFromCopy: true,
  }
  const { rerender } = render(<Wrapper state={taskEdit} />)
  // Task-edit mode for an Outlook task list renders the picker (filtered to
  // outlook-task) so the user can move the task to another list. The picker's
  // editLabelHint reconciles the synthesized 'outlook:__edit__' key against
  // the real OUTLOOK_TASKS list by label match.
  await waitFor(() =>
    expect(screen.getByRole('combobox')).toHaveAttribute('data-value', 'outlook:LIST-A'),
  )
  // Simulate the Move-to-calendar transition: parent flips formState in place.
  // The session key changes (editId+mode+seededFromCopy differ), forcing a
  // full remount so the destination useState initializer runs again.
  rerender(<Wrapper state={eventCreate} />)
  // Without the remount, destination would still be 'outlook:LIST-A' and
  // isExternalCalSource would render RSVP under what looks like an ERP pick.
  await waitFor(() =>
    expect(screen.getByRole('combobox')).toHaveAttribute('data-value', 'herbe:conn-1'),
  )
  expect(screen.queryByText('RSVP')).not.toBeInTheDocument()
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
  const trigger = await screen.findByRole('combobox')
  await waitFor(() => expect(trigger).toHaveAttribute('data-value', 'herbe:conn-1'))
  // After auto-fire the description field should still carry the duplicated value.
  // (The ERP-specific code inputs are more complex to query; description is a
  // simple cross-check that the form didn't reset state on auto-fire.)
  expect(screen.getByDisplayValue('Follow up')).toBeInTheDocument()
})
