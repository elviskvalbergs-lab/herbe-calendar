jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
  forbidden: jest.fn(() => new Response('Forbidden', { status: 403 })),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchAll: jest.fn(),
  herbeFetchById: jest.fn(),
  herbeWebExcellentDelete: jest.fn(),
}))
jest.mock('@/lib/auth', () => ({}))
jest.mock('@/lib/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }))
jest.mock('@/lib/accountConfig', () => ({
  getErpConnections: jest.fn().mockResolvedValue([]),
}))

import { GET, POST } from '@/app/api/activities/route'
import { PUT, DELETE } from '@/app/api/activities/[id]/route'
import { requireSession, unauthorized, forbidden } from '@/lib/herbe/auth-guard'
import { herbeFetchById } from '@/lib/herbe/client'
import { NextRequest } from 'next/server'

const mockRequireSession = requireSession as jest.Mock
const mockUnauthorized = unauthorized as jest.Mock
const mockForbidden = forbidden as jest.Mock
const mockHerbeFetchById = herbeFetchById as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockUnauthorized.mockReturnValue(new Response('Unauthorized', { status: 401 }))
  mockForbidden.mockReturnValue(new Response('Forbidden', { status: 403 }))
})

describe('GET /api/activities — auth', () => {
  it('returns 401 when session is missing', async () => {
    mockRequireSession.mockRejectedValue(new Error('No session'))
    const req = new Request('http://localhost/api/activities?persons=EKS&date=2026-03-12')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/activities — auth', () => {
  it('returns 401 when session is missing', async () => {
    mockRequireSession.mockRejectedValue(new Error('No session'))
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: JSON.stringify({ Comment: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/activities/[id] — permissions', () => {
  it('returns 401 when session is missing', async () => {
    mockRequireSession.mockRejectedValue(new Error('No session'))
    const req = new NextRequest('http://localhost/api/activities/123', {
      method: 'PUT',
      body: JSON.stringify({ Comment: 'updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: '123' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when activity not found', async () => {
    mockRequireSession.mockResolvedValue({ userCode: 'EKS', email: 'eks@example.com' })
    mockHerbeFetchById.mockResolvedValue({ ok: false, status: 404 })
    const req = new NextRequest('http://localhost/api/activities/999', {
      method: 'PUT',
      body: JSON.stringify({ Comment: 'updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: '999' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is unrelated to activity', async () => {
    mockRequireSession.mockResolvedValue({ userCode: 'OUTSIDER', email: 'outsider@example.com' })
    mockHerbeFetchById.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { ActVc: [{ MainPersons: 'EKS', CCPersons: '', AccessGroup: '' }] },
      }),
    })
    const req = new NextRequest('http://localhost/api/activities/123', {
      method: 'PUT',
      body: JSON.stringify({ Comment: 'updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: '123' }) })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/activities/[id] — permissions', () => {
  it('returns 401 when session is missing', async () => {
    mockRequireSession.mockRejectedValue(new Error('No session'))
    const req = new NextRequest('http://localhost/api/activities/123', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: '123' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is unrelated to activity', async () => {
    mockRequireSession.mockResolvedValue({ userCode: 'OUTSIDER', email: 'outsider@example.com' })
    mockHerbeFetchById.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { ActVc: [{ MainPersons: 'EKS', CCPersons: '', AccessGroup: '' }] },
      }),
    })
    const req = new NextRequest('http://localhost/api/activities/123', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: '123' }) })
    expect(res.status).toBe(403)
  })
})
