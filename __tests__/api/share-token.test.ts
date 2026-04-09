jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('bcryptjs', () => ({ compare: jest.fn() }))
jest.mock('@/lib/auth', () => ({}))

import { GET, POST } from '@/app/api/share/[token]/route'
import { pool } from '@/lib/db'
import { compare } from 'bcryptjs'
import { NextRequest } from 'next/server'

const mockQuery = (pool as unknown as { query: jest.Mock }).query
const mockCompare = compare as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/share/[token]', () => {
  it('returns 404 for unknown token', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const req = new NextRequest('http://localhost/api/share/unknown')
    const res = await GET(req, { params: Promise.resolve({ token: 'unknown' }) })
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
        linkName: 'Test',
        favoriteName: 'My Fav',
        view: 'week',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    const req = new NextRequest('http://localhost/api/share/expired')
    const res = await GET(req, { params: Promise.resolve({ token: 'expired' }) })
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toBe('Link expired')
  })

  it('returns hasPassword: true when password is set', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: null,
        hasPassword: true,
        linkName: 'Test',
        favoriteName: 'My Fav',
        view: 'week',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    const req = new NextRequest('http://localhost/api/share/pw-token')
    const res = await GET(req, { params: Promise.resolve({ token: 'pw-token' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasPassword).toBe(true)
  })

  it('returns hasPassword: false when no password', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: null,
        hasPassword: false,
        linkName: 'Test',
        favoriteName: 'My Fav',
        view: 'week',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    const req = new NextRequest('http://localhost/api/share/no-pw')
    const res = await GET(req, { params: Promise.resolve({ token: 'no-pw' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasPassword).toBe(false)
  })
})

describe('POST /api/share/[token]', () => {
  it('returns 404 for unknown token', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const req = new NextRequest('http://localhost/api/share/unknown', {
      method: 'POST',
      body: JSON.stringify({ password: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'unknown' }) })
    expect(res.status).toBe(404)
  })

  it('returns 410 for expired token', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: '2020-01-01T00:00:00Z',
        hasPassword: true,
        passwordHash: '$2a$10$somehash',
        linkName: 'Test',
        favoriteName: 'My Fav',
        view: 'week',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    const req = new NextRequest('http://localhost/api/share/expired', {
      method: 'POST',
      body: JSON.stringify({ password: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'expired' }) })
    expect(res.status).toBe(410)
  })

  it('returns 403 when password is incorrect', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        visibility: 'full',
        expires_at: null,
        hasPassword: true,
        passwordHash: '$2a$10$somehash',
        linkName: 'Test',
        favoriteName: 'My Fav',
        view: 'week',
        personCodes: ['EKS'],
        hiddenCalendars: [],
        ownerEmail: 'owner@example.com',
      }],
    })
    mockCompare.mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/share/pw-token', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'pw-token' }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Invalid password')
    expect(mockCompare).toHaveBeenCalledWith('wrong', '$2a$10$somehash')
  })

  it('returns 200 when password is correct', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          visibility: 'full',
          expires_at: null,
          hasPassword: true,
          passwordHash: '$2a$10$somehash',
          linkName: 'Test',
          favoriteName: 'My Fav',
          view: 'week',
          personCodes: ['EKS'],
          hiddenCalendars: [],
          ownerEmail: 'owner@example.com',
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE access stats
    mockCompare.mockResolvedValue(true)
    const req = new NextRequest('http://localhost/api/share/pw-token', {
      method: 'POST',
      body: JSON.stringify({ password: 'correct' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'pw-token' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasPassword).toBe(false) // after unlock, hasPassword is false
    expect(body.personCodes).toEqual(['EKS'])
  })
})
