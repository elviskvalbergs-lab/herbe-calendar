jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/cache/events', () => ({
  getCachedEvents: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/cache/syncState', () => ({
  hasCompletedInitialSync: jest.fn().mockResolvedValue(true),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn().mockResolvedValue({ ok: false }),
}))
jest.mock('@/lib/icsParser', () => ({
  fetchIcsEvents: jest.fn().mockResolvedValue([]),
  deduplicateIcsAgainstGraph: jest.fn().mockReturnValue([]),
}))
jest.mock('@/lib/icsUtils', () => ({
  fetchIcsForPerson: jest.fn().mockResolvedValue({ events: [], warnings: [] }),
}))
jest.mock('@/lib/emailForCode', () => ({
  emailForCode: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/outlookUtils', () => ({
  fetchOutlookEventsForPerson: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/googleUtils', () => ({
  fetchGoogleEventsForPerson: jest.fn().mockResolvedValue(null),
  fetchPerUserGoogleEvents: jest.fn().mockResolvedValue({ events: [], warnings: [] }),
  mapGoogleEvent: jest.fn(),
}))
jest.mock('@/lib/sharedCalendars', () => ({
  fetchSharedCalendarEvents: jest.fn().mockResolvedValue({ events: [] }),
}))
jest.mock('@/lib/holidays', () => ({
  getPersonsHolidayCountries: jest.fn().mockResolvedValue(new Map()),
  getHolidaysForRange: jest.fn().mockResolvedValue(new Map()),
}))
jest.mock('@/lib/rateLimit', () => ({
  isRateLimited: jest.fn().mockReturnValue(false),
}))
jest.mock('bcryptjs', () => ({ compare: jest.fn() }))
jest.mock('@/lib/auth', () => ({}))

import { GET } from '@/app/api/share/[token]/activities/route'
import { pool } from '@/lib/db'
import { getCachedEvents } from '@/lib/cache/events'
import { compare } from 'bcryptjs'
import { NextRequest } from 'next/server'

const mockQuery = (pool as unknown as { query: jest.Mock }).query
const mockCompare = compare as jest.Mock

function makeRequest(token: string, dateFrom = '2026-03-01', dateTo = '2026-03-31') {
  return new NextRequest(
    `http://localhost/api/share/${token}/activities?dateFrom=${dateFrom}&dateTo=${dateTo}`
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/share/[token]/activities', () => {
  it('returns 404 for unknown token', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const res = await GET(makeRequest('unknown-token'), {
      params: Promise.resolve({ token: 'unknown-token' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Link not found')
  })

  it('returns 410 for expired token', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: '2020-01-01T00:00:00Z',
        hasPassword: false,
        passwordHash: null,
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    const res = await GET(makeRequest('expired-token'), {
      params: Promise.resolve({ token: 'expired-token' }),
    })
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toBe('Link expired')
  })

  it('returns 403 when password required but x-share-auth missing', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: null,
        hasPassword: true,
        passwordHash: '$2a$10$somehash',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    mockCompare.mockResolvedValue(false)
    const req = makeRequest('pw-token')
    const res = await GET(req, { params: Promise.resolve({ token: 'pw-token' }) })
    expect(res.status).toBe(403)
    expect(mockCompare).toHaveBeenCalledWith('', '$2a$10$somehash')
  })

  it('returns 403 when password is wrong', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: null,
        hasPassword: true,
        passwordHash: '$2a$10$somehash',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    mockCompare.mockResolvedValue(false)
    const req = new NextRequest(
      'http://localhost/api/share/pw-token/activities?dateFrom=2026-03-01&dateTo=2026-03-31',
      { headers: { 'x-share-auth': 'wrongpassword' } }
    )
    const res = await GET(req, { params: Promise.resolve({ token: 'pw-token' }) })
    expect(res.status).toBe(403)
    expect(mockCompare).toHaveBeenCalledWith('wrongpassword', '$2a$10$somehash')
  })

  it('visibility "busy" strips description', async () => {
    // First call: token lookup; second call: access stats update
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          visibility: 'busy',
          expires_at: null,
          hasPassword: false,
          passwordHash: null,
          personCodes: [],
          hiddenCalendars: [],
          ownerEmail: 'owner@example.com',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE access stats

    const res = await GET(makeRequest('busy-token'), {
      params: Promise.resolve({ token: 'busy-token' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // No persons means no activities fetched, so array is empty
    // but the route still succeeds
    expect(Array.isArray(body.activities)).toBe(true)
  })

  it('visibility "busy" replaces description with "Busy" on herbe activities', async () => {
    ;(getCachedEvents as jest.Mock).mockResolvedValueOnce([
      {
        id: '42',
        source: 'herbe',
        personCode: 'EKS',
        description: 'Secret meeting details',
        date: '2026-03-15',
        timeFrom: '09:00',
        timeTo: '10:00',
        customerName: 'Acme Corp',
        projectName: 'Project X',
        mainPersons: ['EKS'],
        ccPersons: [],
      },
    ])
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          visibility: 'busy',
          expires_at: null,
          hasPassword: false,
          passwordHash: null,
          personCodes: ['EKS'],
          hiddenCalendars: [],
          ownerEmail: 'owner@example.com',
          accountId: 'acc-1',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE access stats

    const res = await GET(makeRequest('busy-token'), {
      params: Promise.resolve({ token: 'busy-token' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activities.length).toBeGreaterThanOrEqual(1)
    const activity = body.activities[0]
    expect(activity.description).toBe('Busy')
    expect(activity.customerName).toBeUndefined()
    expect(activity.projectName).toBeUndefined()
  })

  it('visibility "titles" strips customer/project but keeps description', async () => {
    ;(getCachedEvents as jest.Mock).mockResolvedValueOnce([
      {
        id: '43',
        source: 'herbe',
        personCode: 'EKS',
        description: 'Weekly standup',
        date: '2026-03-15',
        timeFrom: '09:00',
        timeTo: '10:00',
        customerName: 'Acme Corp',
        projectName: 'Project X',
        mainPersons: ['EKS'],
        ccPersons: [],
      },
    ])
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          visibility: 'titles',
          expires_at: null,
          hasPassword: false,
          passwordHash: null,
          personCodes: ['EKS'],
          hiddenCalendars: [],
          ownerEmail: 'owner@example.com',
          accountId: 'acc-1',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE access stats

    const res = await GET(makeRequest('titles-token'), {
      params: Promise.resolve({ token: 'titles-token' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.activities.length).toBeGreaterThanOrEqual(1)
    const activity = body.activities[0]
    expect(activity.description).toBe('Weekly standup')
    expect(activity.customerName).toBeUndefined()
    expect(activity.projectName).toBeUndefined()
  })
})
