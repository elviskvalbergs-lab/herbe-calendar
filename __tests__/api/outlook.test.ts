import { PUT, DELETE } from '@/app/api/outlook/[id]/route'
import { GET } from '@/app/api/outlook/route'

jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com', accountId: 'acc-1' }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
  forbidden: jest.fn(() => new Response('Forbidden', { status: 403 })),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetchAll: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({
    tenantId: 'test-tenant', clientId: 'test-client',
    clientSecret: 'test-secret', senderEmail: 'sender@example.com',
  }),
}))
jest.mock('@/lib/outlookUtils', () => {
  const actual = jest.requireActual('@/lib/outlookUtils')
  return { ...actual, fetchOutlookEventsForPerson: jest.fn().mockResolvedValue(null) }
})
jest.mock('@/lib/icsUtils', () => ({
  fetchIcsForPerson: jest.fn().mockResolvedValue({ events: [], warnings: [] }),
}))
jest.mock('@/lib/icsParser', () => ({
  deduplicateIcsAgainstGraph: jest.fn().mockReturnValue([]),
}))
jest.mock('@/lib/emailForCode', () => ({
  emailForCode: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}))

const { graphFetch } = require('@/lib/graph/client')
const { fetchOutlookEventsForPerson } = require('@/lib/outlookUtils')
const { emailForCode } = require('@/lib/emailForCode')

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
      expect.objectContaining({ method: 'PATCH' }),
      expect.any(Object)
    )
  })
})

describe('DELETE /api/outlook/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 403 when session user is not the organizer', async () => {
    graphFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ organizer: { emailAddress: { address: 'other@example.com' } } }),
    })
    const req = new Request('http://localhost/api/outlook/evt1', { method: 'DELETE' })
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when event not found', async () => {
    graphFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const req = new Request('http://localhost/api/outlook/evt1', { method: 'DELETE' })
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    graphFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizer: { emailAddress: { address: 'eks@example.com' } } }),
      })
      .mockResolvedValueOnce({ ok: true })
    const req = new Request('http://localhost/api/outlook/evt1', { method: 'DELETE' })
    const res = await DELETE(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(res.status).toBe(204)
  })
})

describe('PUT /api/outlook/[id] — field filtering', () => {
  beforeEach(() => jest.clearAllMocks())

  it('only passes allowed fields to Graph API', async () => {
    graphFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizer: { emailAddress: { address: 'eks@example.com' } } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'test', hackerField: 'nope', location: { displayName: 'Room 1' } }),
    })
    await PUT(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    const patchCall = graphFetch.mock.calls[1]
    const body = JSON.parse(patchCall[1].body)
    expect(body.subject).toBe('test')
    expect(body.location).toEqual({ displayName: 'Room 1' })
    expect(body.hackerField).toBeUndefined()
  })

  it('returns 404 when event not found for update', async () => {
    graphFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const req = new Request('http://localhost/api/outlook/evt1', {
      method: 'PUT',
      body: JSON.stringify({ subject: 'test' }),
    })
    const res = await PUT(req as any, { params: Promise.resolve({ id: 'evt1' }) })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/outlook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 if persons param is missing', async () => {
    const req = new Request('http://localhost/api/outlook')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 if date param is missing', async () => {
    const req = new Request('http://localhost/api/outlook?persons=EKS')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('returns 200 with empty array when persons provided but no events', async () => {
    const req = new Request('http://localhost/api/outlook?persons=EKS&date=2026-03-12')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.activities)).toBe(true)
    expect(body.activities).toHaveLength(0)
  })

  it('sets isOrganizer based on session email, not queried person email', async () => {
    // Session user is eks@example.com (from mock)
    // Query JD's calendar — event organized by JD, not EKS
    emailForCode.mockResolvedValueOnce('jd@example.com')
    fetchOutlookEventsForPerson.mockResolvedValueOnce([{
      id: 'evt-1',
      subject: 'JD Meeting',
      start: { dateTime: '2026-03-12T10:00:00' },
      end: { dateTime: '2026-03-12T11:00:00' },
      organizer: { emailAddress: { address: 'jd@example.com' } },
      responseStatus: { response: 'accepted' },
      bodyPreview: '',
      webLink: '',
    }])
    const req = new Request('http://localhost/api/outlook?persons=JD&date=2026-03-12')
    const res = await GET(req as any)
    const body = await res.json()
    // EKS is viewing JD's calendar — JD organized, so EKS is NOT the organizer
    const event = body.activities.find((e: any) => e.id === 'evt-1')
    expect(event).toBeDefined()
    expect(event.isOrganizer).toBe(false)
  })

  it('sets isOrganizer true when session user is the organizer', async () => {
    emailForCode.mockResolvedValueOnce('eks@example.com')
    fetchOutlookEventsForPerson.mockResolvedValueOnce([{
      id: 'evt-2',
      subject: 'My Meeting',
      start: { dateTime: '2026-03-12T14:00:00' },
      end: { dateTime: '2026-03-12T15:00:00' },
      organizer: { emailAddress: { address: 'eks@example.com' } },
      responseStatus: { response: 'organizer' },
      bodyPreview: '',
      webLink: '',
    }])
    const req = new Request('http://localhost/api/outlook?persons=EKS&date=2026-03-12')
    const res = await GET(req as any)
    const body = await res.json()
    const event = body.activities.find((e: any) => e.id === 'evt-2')
    expect(event).toBeDefined()
    expect(event.isOrganizer).toBe(true)
  })
})
