import { GET, POST, PUT, DELETE } from '@/app/api/settings/templates/route'
import { NextRequest } from 'next/server'
import { pool } from '@/lib/db'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({
    userCode: 'EKS', email: 'test@test.com', accountId: '00000000-0000-0000-0000-000000000001'
  }),
  unauthorized: jest.fn(() => new Response('Unauthorized', { status: 401 })),
}))
jest.mock('@/lib/db', () => ({
  pool: { query: jest.fn() }
}))
jest.mock('@/lib/auth', () => ({}))

const mockQuery = pool.query as jest.Mock

function jsonRequest(method: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/settings/templates', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
describe('GET /api/settings/templates', () => {
  it('returns templates for current user', async () => {
    const template = {
      id: '1', name: 'Standup', duration_minutes: 15,
      linked_share_links: [{ id: 'sl1', name: 'Public Link' }],
    }
    mockQuery.mockResolvedValueOnce({ rows: [template] })

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual([template])
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM booking_templates bt'),
      ['00000000-0000-0000-0000-000000000001']
    )
  })

  it('returns empty array when no templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await GET()
    const data = await res.json()

    expect(data).toEqual([])
  })

  it('returns linked_share_links in response', async () => {
    const template = {
      id: '2', name: 'Demo',
      linked_share_links: [
        { id: 'sl1', name: 'Link A' },
        { id: 'sl2', name: 'Link B' },
      ],
    }
    mockQuery.mockResolvedValueOnce({ rows: [template] })

    const res = await GET()
    const data = await res.json()

    expect(data[0].linked_share_links).toHaveLength(2)
    expect(data[0].linked_share_links[0]).toHaveProperty('id')
    expect(data[0].linked_share_links[0]).toHaveProperty('name')
  })
})

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
describe('POST /api/settings/templates', () => {
  it('creates template with valid data (201)', async () => {
    const created = { id: '1', name: 'Standup', duration_minutes: 15 }
    mockQuery.mockResolvedValueOnce({ rows: [created] })

    const res = await POST(jsonRequest('POST', {
      name: 'Standup',
      duration_minutes: 15,
      availability_windows: [{ day: 'MON', start: '09:00', end: '17:00' }],
      buffer_minutes: 5,
      targets: { calendar: 'work' },
      custom_fields: [{ label: 'Notes', type: 'text' }],
    }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toEqual(created)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO booking_templates'),
      [
        '00000000-0000-0000-0000-000000000001',
        'test@test.com',
        'Standup',
        15,
        JSON.stringify([{ day: 'MON', start: '09:00', end: '17:00' }]),
        5,
        JSON.stringify({ calendar: 'work' }),
        JSON.stringify([{ label: 'Notes', type: 'text' }]),
        false,
      ]
    )
  })

  it('rejects missing name (400)', async () => {
    const res = await POST(jsonRequest('POST', { duration_minutes: 15 }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/name/)
  })

  it('rejects missing duration_minutes (400)', async () => {
    const res = await POST(jsonRequest('POST', { name: 'Standup' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/duration_minutes/)
  })

  it('stringifies JSONB fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] })

    await POST(jsonRequest('POST', {
      name: 'Test',
      duration_minutes: 30,
      availability_windows: [{ day: 'TUE' }],
      targets: { room: 'A' },
      custom_fields: [{ label: 'X' }],
    }))

    const args = mockQuery.mock.calls[0][1]
    // availability_windows (index 4), targets (index 6), custom_fields (index 7)
    expect(typeof args[4]).toBe('string')
    expect(typeof args[6]).toBe('string')
    expect(typeof args[7]).toBe('string')
    expect(JSON.parse(args[4])).toEqual([{ day: 'TUE' }])
  })
})

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------
describe('PUT /api/settings/templates', () => {
  it('updates template fields', async () => {
    const updated = { id: '1', name: 'Updated', duration_minutes: 30 }
    mockQuery.mockResolvedValueOnce({ rows: [updated] })

    const res = await PUT(jsonRequest('PUT', {
      id: '1',
      name: 'Updated',
      duration_minutes: 30,
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual(updated)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE booking_templates'),
      expect.arrayContaining(['Updated', 30, '1'])
    )
  })

  it('returns 404 for non-existent template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await PUT(jsonRequest('PUT', { id: 'missing', name: 'X' }))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe('Not found')
  })

  it('rejects empty update (400)', async () => {
    const res = await PUT(jsonRequest('PUT', { id: '1' }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Nothing to update')
  })

  it('maps camelCase to snake_case', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] })

    await PUT(jsonRequest('PUT', {
      id: '1',
      durationMinutes: 45,
      bufferMinutes: 10,
      availabilityWindows: [{ day: 'WED' }],
      customFields: [{ label: 'Y' }],
    }))

    const sql = mockQuery.mock.calls[0][0]
    expect(sql).toContain('duration_minutes')
    expect(sql).toContain('buffer_minutes')
    expect(sql).toContain('availability_windows')
    expect(sql).toContain('custom_fields')
  })
})

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
describe('DELETE /api/settings/templates', () => {
  it('deletes template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await DELETE(jsonRequest('DELETE', { id: '1' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ ok: true })
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM booking_templates'),
      ['1', '00000000-0000-0000-0000-000000000001']
    )
  })

  it('duplicates template when duplicate=true (201)', async () => {
    const duplicated = { id: '2', name: 'Standup (copy)', duration_minutes: 15 }
    mockQuery.mockResolvedValueOnce({ rows: [duplicated] })

    const res = await DELETE(jsonRequest('DELETE', { id: '1', duplicate: true }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toEqual(duplicated)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO booking_templates'),
      ['1', '00000000-0000-0000-0000-000000000001']
    )
  })

  it('returns 404 when duplicating non-existent template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await DELETE(jsonRequest('DELETE', { id: 'missing', duplicate: true }))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe('Not found')
  })

  it('rejects missing id (400)', async () => {
    const res = await DELETE(jsonRequest('DELETE', {}))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Missing id')
  })
})
