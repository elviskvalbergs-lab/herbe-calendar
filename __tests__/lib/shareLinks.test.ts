import {
  loadShareLinks,
  createShareLink,
  removeShareLink,
  removeAllShareLinks,
  updateShareLink,
} from '@/lib/shareLinks'

/* ------------------------------------------------------------------ */
/*  fetch mock                                                         */
/* ------------------------------------------------------------------ */
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

/* ------------------------------------------------------------------ */
/*  loadShareLinks                                                     */
/* ------------------------------------------------------------------ */
describe('loadShareLinks', () => {
  it('fetches share links for a given favoriteId', async () => {
    const links = [{ id: '1', token: 'abc' }]
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(links) })

    const result = await loadShareLinks('fav-1')
    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links?favoriteId=fav-1')
    expect(result).toEqual(links)
  })

  it('returns empty array when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false })

    const result = await loadShareLinks('fav-1')
    expect(result).toEqual([])
  })

  it('returns empty array when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await loadShareLinks('fav-1')
    expect(result).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  createShareLink                                                    */
/* ------------------------------------------------------------------ */
describe('createShareLink', () => {
  it('sends POST with correct body and returns created link', async () => {
    const created = { id: '1', favoriteId: 'fav-1', token: 'tok', name: 'My Link' }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(created) })

    const data = {
      favoriteId: 'fav-1',
      name: 'My Link',
      visibility: 'full' as const,
      expiresAt: '2026-12-31',
      password: 'secret',
    }
    const result = await createShareLink(data)

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    expect(result).toEqual(created)
  })

  it('sends POST without optional fields', async () => {
    const created = { id: '2', favoriteId: 'fav-2', token: 'tok2', name: 'Link 2' }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(created) })

    const data = { favoriteId: 'fav-2', name: 'Link 2', visibility: 'busy' as const }
    const result = await createShareLink(data)

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    expect(result).toEqual(created)
  })
})

/* ------------------------------------------------------------------ */
/*  removeShareLink                                                    */
/* ------------------------------------------------------------------ */
describe('removeShareLink', () => {
  it('sends DELETE with id in body', async () => {
    mockFetch.mockResolvedValue({})

    await removeShareLink('link-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'link-1' }),
    })
  })
})

/* ------------------------------------------------------------------ */
/*  removeAllShareLinks                                                */
/* ------------------------------------------------------------------ */
describe('removeAllShareLinks', () => {
  it('sends DELETE with favoriteId in body', async () => {
    mockFetch.mockResolvedValue({})

    await removeAllShareLinks('fav-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteId: 'fav-1' }),
    })
  })
})

/* ------------------------------------------------------------------ */
/*  updateShareLink                                                    */
/* ------------------------------------------------------------------ */
describe('updateShareLink', () => {
  it('sends PUT with id and update data', async () => {
    const updated = { id: 'link-1', name: 'Updated' }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(updated) })

    const result = await updateShareLink('link-1', { name: 'Updated' })

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'link-1', name: 'Updated' }),
    })
    expect(result).toEqual(updated)
  })

  it('sends PUT with multiple fields', async () => {
    const updated = { id: 'link-1', visibility: 'titles', expiresAt: null }
    mockFetch.mockResolvedValue({ json: () => Promise.resolve(updated) })

    const result = await updateShareLink('link-1', {
      visibility: 'titles',
      expiresAt: null,
      password: 'new-pass',
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/settings/share-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'link-1', visibility: 'titles', expiresAt: null, password: 'new-pass' }),
    })
    expect(result).toEqual(updated)
  })
})
