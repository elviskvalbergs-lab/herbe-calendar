/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import FavoritesDropdown from '@/components/FavoritesDropdown'
import type { CalendarState, Favorite } from '@/types'

function mockFavorites(list: Favorite[]) {
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes('/api/settings/favorites') && (!init || init.method === 'GET' || !init.method)) {
      return { ok: true, status: 200, json: async () => list } as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  }) as typeof fetch
}

const baseState: CalendarState = {
  view: 'day',
  date: '2026-04-25',
  selectedPersons: [],
}

afterEach(() => {
  jest.restoreAllMocks()
})

it('labels favorites by view: 7day → "7D", month → "Month", tasks → "Tasks"', async () => {
  mockFavorites([
    { id: 'a', name: 'Week ahead',  view: '7day', personCodes: ['EK'] },
    { id: 'b', name: 'Month plan',  view: 'month', personCodes: ['EK'] },
    { id: 'c', name: 'My tasks',    view: 'tasks', personCodes: ['EK'] },
    { id: 'd', name: 'Three days',  view: '3day', personCodes: ['EK'] },
  ])
  render(<FavoritesDropdown state={baseState} onApply={() => {}} inline />)
  await waitFor(() => expect(screen.getByText('Week ahead')).toBeInTheDocument())
  // Each favorite renders its view label in the trailing meta span.
  // The previous ternary cascade collapsed `month` and `tasks` to "7D".
  expect(screen.getByText(/^7D · /)).toBeInTheDocument()
  expect(screen.getByText(/^Month · /)).toBeInTheDocument()
  expect(screen.getByText(/^Tasks · /)).toBeInTheDocument()
  expect(screen.getByText(/^3D · /)).toBeInTheDocument()
})
