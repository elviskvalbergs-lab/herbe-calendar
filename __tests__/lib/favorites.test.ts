import { loadFavorites, addFavorite, removeFavorite } from '@/lib/favorites'

/* ------------------------------------------------------------------ */
/*  fetch mock                                                         */
/* ------------------------------------------------------------------ */
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

/* ------------------------------------------------------------------ */
/*  loadFavorites                                                      */
/* ------------------------------------------------------------------ */
describe('loadFavorites', () => {
  it('fetches favorites from the API', async () => {
    const favs = [{ id: '1', name: 'My View', view: 'day', personCodes: ['EKS'] }]
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(favs) })

    const result = await loadFavorites()
    expect(mockFetch).toHaveBeenCalledWith('/api/settings/favorites')
    expect(result).toEqual(favs)
  })

  it('returns empty array when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    const result = await loadFavorites()
    expect(result).toEqual([])
  })

  it('returns empty array when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await loadFavorites()
    expect(result).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  addFavorite                                                        */
/* ------------------------------------------------------------------ */
describe('addFavorite', () => {
  it('sends POST with favorite data and returns created favorite', async () => {
    const created = { id: '1', name: 'New Fav', view: 'day', personCodes: ['EKS'] }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(created) })

    const data = { name: 'New Fav', view: 'day' as const, personCodes: ['EKS'] }
    const result = await addFavorite(data)

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    expect(result).toEqual(created)
  })

  it('includes optional hiddenCalendars in the body', async () => {
    const created = { id: '2', name: 'Fav2', view: '3day', personCodes: ['ARA'], hiddenCalendars: ['outlook'] }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(created) })

    const data = { name: 'Fav2', view: '3day' as const, personCodes: ['ARA'], hiddenCalendars: ['outlook'] }
    const result = await addFavorite(data)

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    expect(result).toEqual(created)
  })
})

/* ------------------------------------------------------------------ */
/*  removeFavorite                                                     */
/* ------------------------------------------------------------------ */
describe('removeFavorite', () => {
  it('sends DELETE with id in body', async () => {
    mockFetch.mockResolvedValue({})

    await removeFavorite('fav-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/favorites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'fav-1' }),
    })
  })

  it('does not return a value', async () => {
    mockFetch.mockResolvedValue({})

    const result = await removeFavorite('fav-1')
    expect(result).toBeUndefined()
  })
})
