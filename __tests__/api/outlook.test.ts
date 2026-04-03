import { PUT, DELETE } from '@/app/api/outlook/[id]/route'
import { GET } from '@/app/api/outlook/route'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
  forbidden: jest.fn(() => new Response('Forbidden', { status: 403 })),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetchAll: jest.fn().mockResolvedValue([]),
}))

const { graphFetch } = require('@/lib/graph/client')

describe('PUT /api/outlook/[id] — organizer guard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 when session user is not the organizer', async () => {
    graphFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ organizer: { emailAddress: { address: 'other@example.com' } } }),
    })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'updated' }),
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(res.status).toBe(403)
  })

  it('calls PATCH when session user is the organizer', async () => {
    graphFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizer: { emailAddress: { address: 'eks@example.com' } } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'updated' }),
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(graphFetch).toHaveBeenCalledWith(
      expect.stringContaining('evt1'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('GET /api/outlook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if persons param is missing', async () => {
    const req = new Request('http://localhost/api/outlook')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty array when persons provided but no events', async () => {
    // herbeFetchAll is mocked to return [] (empty user list)
    // so emailForCode returns null for all codes, returning empty arrays
    const req = new Request('http://localhost/api/outlook?persons=EKS&date=2026-03-12')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})
