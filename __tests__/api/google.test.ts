jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn().mockResolvedValue(null),
  getCalendarClient: jest.fn(),
}))
jest.mock('@/lib/emailForCode', () => ({
  emailForCode: jest.fn(),
}))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }))
jest.mock('@/lib/auth', () => ({}))

import { GET, POST } from '@/app/api/google/route'
const { getGoogleConfig, getCalendarClient } = require('@/lib/google/client')
const { emailForCode } = require('@/lib/emailForCode')

describe('GET /api/google', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when persons param is missing', async () => {
    const req = new Request('http://localhost/api/google?dateFrom=2026-04-01&dateTo=2026-04-01')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/persons/)
  })

  it('returns 400 when date params are missing', async () => {
    const req = new Request('http://localhost/api/google?persons=EKS')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('returns empty array when Google is not configured', async () => {
    getGoogleConfig.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/google?persons=EKS&dateFrom=2026-04-01&dateTo=2026-04-01')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns events when Google is configured', async () => {
    getGoogleConfig.mockResolvedValueOnce({
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    })
    emailForCode.mockResolvedValueOnce('eks@example.com')

    const mockEventsList = jest.fn().mockResolvedValue({
      data: {
        items: [{
          id: 'evt-1',
          summary: 'Team standup',
          start: { dateTime: '2026-04-01T09:00:00+03:00' },
          end: { dateTime: '2026-04-01T09:30:00+03:00' },
          organizer: { email: 'eks@example.com' },
          htmlLink: 'https://calendar.google.com/event/evt-1',
        }],
      },
    })
    getCalendarClient.mockReturnValueOnce({ events: { list: mockEventsList } })

    const req = new Request('http://localhost/api/google?persons=EKS&dateFrom=2026-04-01&dateTo=2026-04-01')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: 'evt-1',
      source: 'google',
      personCode: 'EKS',
      description: 'Team standup',
    })
  })

  it('returns empty when emailForCode returns null', async () => {
    getGoogleConfig.mockResolvedValueOnce({
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    })
    emailForCode.mockResolvedValueOnce(null)

    const req = new Request('http://localhost/api/google?persons=UNKNOWN&dateFrom=2026-04-01&dateTo=2026-04-01')
    const res = await GET(req as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})

describe('POST /api/google', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when Google is not configured', async () => {
    getGoogleConfig.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/google', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Meeting' }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not configured/)
  })

  it('creates an event and returns 201', async () => {
    getGoogleConfig.mockResolvedValueOnce({
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    })

    const mockInsert = jest.fn().mockResolvedValue({ data: { id: 'new-evt-1' } })
    getCalendarClient.mockReturnValueOnce({ events: { insert: mockInsert } })

    const req = new Request('http://localhost/api/google', {
      method: 'POST',
      body: JSON.stringify({
        subject: 'New Meeting',
        start: { dateTime: '2026-04-01T10:00:00Z' },
        end: { dateTime: '2026-04-01T11:00:00Z' },
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('new-evt-1')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        conferenceDataVersion: 0,
      })
    )
  })

  it('adds conference data when isOnlineMeeting is true', async () => {
    getGoogleConfig.mockResolvedValueOnce({
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
      privateKey: 'key',
      adminEmail: 'admin@example.com',
      domain: 'example.com',
    })

    const mockInsert = jest.fn().mockResolvedValue({ data: { id: 'new-evt-2' } })
    getCalendarClient.mockReturnValueOnce({ events: { insert: mockInsert } })

    const req = new Request('http://localhost/api/google', {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Online Meeting',
        start: { dateTime: '2026-04-01T10:00:00Z' },
        end: { dateTime: '2026-04-01T11:00:00Z' },
        isOnlineMeeting: true,
      }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conferenceDataVersion: 1,
        requestBody: expect.objectContaining({
          conferenceData: expect.objectContaining({
            createRequest: expect.objectContaining({
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            }),
          }),
        }),
      })
    )
  })
})
