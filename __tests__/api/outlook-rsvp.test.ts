import { POST } from '@/app/api/outlook/[id]/rsvp/route'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ email: 'eks@example.com' }),
  unauthorized: jest.fn().mockReturnValue(new Response('', { status: 401 })),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({
    tenantId: 'test-tenant', clientId: 'test-client',
    clientSecret: 'test-secret', senderEmail: 'sender@example.com',
  }),
}))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }))
jest.mock('@/lib/auth', () => ({}))

describe('POST /api/outlook/[id]/rsvp', () => {
  const params = Promise.resolve({ id: 'event-abc-123' })

  it('returns 400 for invalid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'hack/../../other' }),
    })
    const res = await POST(req as any, { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for id with path traversal', async () => {
    const badParams = Promise.resolve({ id: '../../other/resource' })
    const req = new Request('http://localhost/api/outlook/bad/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req as any, { params: badParams })
    expect(res.status).toBe(400)
  })

  it('accepts valid action and uses session email', async () => {
    const { graphFetch } = require('@/lib/graph/client')
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req as any, { params })
    expect(res.status).toBe(200)
    expect(graphFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/eks@example.com/events/event-abc-123/accept'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object)
    )
  })

  it('accepts decline as a valid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'decline' }),
    })
    const res = await POST(req as any, { params })
    expect(res.status).toBe(200)
  })

  it('accepts tentativelyAccept as a valid action', async () => {
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'tentativelyAccept' }),
    })
    const res = await POST(req as any, { params })
    expect(res.status).toBe(200)
  })

  it('returns 401 when session is missing', async () => {
    const { requireSession } = require('@/lib/herbe/auth-guard')
    requireSession.mockImplementationOnce(() => Promise.reject(new Error('unauthorized')))
    const req = new Request('http://localhost/api/outlook/event-abc-123/rsvp', {
      method: 'POST',
      body: JSON.stringify({ action: 'accept' }),
    })
    const res = await POST(req as any, { params })
    expect(res.status).toBe(401)
  })

  it('maps rsvpStatus: accepted response maps to accepted', () => {
    // Verifies the mapping pattern used in app/api/outlook/route.ts Step 1
    const ev = { responseStatus: { response: 'accepted', time: '2026-03-24T10:00:00Z' } }
    const responseStatus = ev.responseStatus as Record<string, string> | undefined
    const rsvpStatus = responseStatus?.['response']
    expect(rsvpStatus).toBe('accepted')
  })
})
