import { GET, DELETE } from '@/app/api/bookings/[cancelToken]/route'
import { NextRequest } from 'next/server'
import { pool } from '@/lib/db'
import { herbeWebExcellentDelete } from '@/lib/herbe/client'
import { graphFetch } from '@/lib/graph/client'
import { getAzureConfig, getErpConnections } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { emailForCode } from '@/lib/emailForCode'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { buildBookingEmail } from '@/lib/bookingEmail'

jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/herbe/client', () => ({ herbeWebExcellentDelete: jest.fn().mockResolvedValue({}) }))
jest.mock('@/lib/graph/client', () => ({ graphFetch: jest.fn().mockResolvedValue({ ok: true }) }))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue(null),
  getErpConnections: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn().mockResolvedValue(null),
  getCalendarClient: jest.fn(),
}))
jest.mock('@/lib/emailForCode', () => ({ emailForCode: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/smtp', () => ({
  getSmtpConfig: jest.fn().mockResolvedValue(null),
  sendMailSmtp: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/bookingEmail', () => ({
  buildBookingEmail: jest.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
}))

const mockQuery = pool.query as jest.Mock

function makeParams(cancelToken: string) {
  return { params: Promise.resolve({ cancelToken }) }
}

describe('GET /api/bookings/[cancelToken]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns booking details for valid cancel token', async () => {
    const booking = {
      id: 1,
      cancel_token: 'valid-token',
      template_name: 'Meeting',
      duration_minutes: 30,
      custom_fields: [],
    }
    mockQuery.mockResolvedValueOnce({ rows: [booking] })

    const req = new NextRequest('http://localhost/api/bookings/valid-token')
    const res = await GET(req, makeParams('valid-token'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(booking)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('cancel_token'),
      ['valid-token']
    )
  })

  it('returns 404 for invalid token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/bad-token')
    const res = await GET(req, makeParams('bad-token'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Booking not found')
  })
})

describe('DELETE /api/bookings/[cancelToken]', () => {
  const baseBooking = {
    id: 42,
    cancel_token: 'cancel-abc',
    template_name: 'Consultation',
    duration_minutes: 60,
    start_time: '2026-05-01T10:00:00Z',
    booker_email: 'booker@example.com',
    personCodes: [],
    ownerEmail: 'owner@example.com',
    accountId: 'acc-1',
    created_erp_ids: null,
    created_outlook_id: null,
    created_google_id: null,
    field_values: {},
    status: 'confirmed',
  }

  beforeEach(() => jest.clearAllMocks())

  it('cancels booking and returns success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseBooking] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }) // UPDATE

    const req = new NextRequest('http://localhost/api/bookings/cancel-abc', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('cancel-abc'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, status: 'cancelled' })
  })

  it('returns 404 for invalid or already cancelled token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/gone', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('gone'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Booking not found or already cancelled')
  })

  it('updates booking status to cancelled', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [baseBooking] })
      .mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/cancel-abc', { method: 'DELETE' })
    await DELETE(req, makeParams('cancel-abc'))

    // Second call should be the UPDATE
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'cancelled'"),
      [baseBooking.id]
    )
  })

  it('attempts to delete ERP activities', async () => {
    const erpBooking = {
      ...baseBooking,
      created_erp_ids: [
        { connectionId: 'conn-1', activityId: 'act-100' },
        { connectionId: 'conn-2', activityId: 'act-200' },
      ],
    }
    const connections = [
      { id: 'conn-1', name: 'ERP 1' },
      { id: 'conn-2', name: 'ERP 2' },
    ]
    ;(getErpConnections as jest.Mock).mockResolvedValueOnce(connections)

    mockQuery
      .mockResolvedValueOnce({ rows: [erpBooking] })
      .mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/cancel-abc', { method: 'DELETE' })
    await DELETE(req, makeParams('cancel-abc'))

    expect(getErpConnections).toHaveBeenCalledWith('acc-1')
    expect(herbeWebExcellentDelete).toHaveBeenCalledTimes(2)
    expect(herbeWebExcellentDelete).toHaveBeenCalledWith('ActVc', 'act-100', '', connections[0])
    expect(herbeWebExcellentDelete).toHaveBeenCalledWith('ActVc', 'act-200', '', connections[1])
  })

  it('attempts to delete Outlook event', async () => {
    const outlookBooking = {
      ...baseBooking,
      created_outlook_id: 'outlook-evt-1',
    }
    const azureConfig = { tenantId: 't', clientId: 'c', clientSecret: 's' }
    ;(getAzureConfig as jest.Mock).mockResolvedValueOnce(azureConfig)

    mockQuery
      .mockResolvedValueOnce({ rows: [outlookBooking] })
      .mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/cancel-abc', { method: 'DELETE' })
    await DELETE(req, makeParams('cancel-abc'))

    expect(getAzureConfig).toHaveBeenCalledWith('acc-1')
    expect(graphFetch).toHaveBeenCalledWith(
      `/users/owner@example.com/events/outlook-evt-1`,
      { method: 'DELETE' },
      azureConfig
    )
  })

  it('attempts to delete Google event', async () => {
    const googleBooking = {
      ...baseBooking,
      created_google_id: 'google-evt-1',
    }
    const googleConfig = { serviceAccountKey: '{}' }
    const mockDelete = jest.fn().mockResolvedValue({})
    const mockCalendar = { events: { delete: mockDelete } }
    ;(getGoogleConfig as jest.Mock).mockResolvedValueOnce(googleConfig)
    ;(getCalendarClient as jest.Mock).mockReturnValueOnce(mockCalendar)

    mockQuery
      .mockResolvedValueOnce({ rows: [googleBooking] })
      .mockResolvedValueOnce({ rows: [] })

    const req = new NextRequest('http://localhost/api/bookings/cancel-abc', { method: 'DELETE' })
    await DELETE(req, makeParams('cancel-abc'))

    expect(getGoogleConfig).toHaveBeenCalledWith('acc-1')
    expect(getCalendarClient).toHaveBeenCalledWith(googleConfig, 'owner@example.com')
    expect(mockDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'google-evt-1',
    })
  })
})
