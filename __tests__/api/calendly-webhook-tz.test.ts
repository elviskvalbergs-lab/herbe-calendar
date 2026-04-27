import { createHmac } from 'crypto'

jest.mock('@/lib/db', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/calendly/client', () => ({
  findConnectionByUserUri: jest.fn(),
  getTemplateForEventType: jest.fn(),
  claimWebhookEvent: jest.fn(),
  updateWebhookStatus: jest.fn(),
}))
jest.mock('@/lib/bookingExecutor', () => ({
  executeBooking: jest.fn(),
}))
jest.mock('@/lib/accountTimezone', () => ({
  getMemberTimezone: jest.fn(),
}))

import { POST } from '@/app/api/calendly/webhook/route'
import { findConnectionByUserUri, getTemplateForEventType, claimWebhookEvent } from '@/lib/calendly/client'
import { executeBooking } from '@/lib/bookingExecutor'
import { getMemberTimezone } from '@/lib/accountTimezone'
import { pool } from '@/lib/db'

const mockFindConn = findConnectionByUserUri as jest.MockedFunction<typeof findConnectionByUserUri>
const mockGetTpl = getTemplateForEventType as jest.MockedFunction<typeof getTemplateForEventType>
const mockClaim = claimWebhookEvent as jest.MockedFunction<typeof claimWebhookEvent>
const mockExec = executeBooking as jest.MockedFunction<typeof executeBooking>
const mockMemberTz = getMemberTimezone as jest.MockedFunction<typeof getMemberTimezone>
const mockQuery = (pool as unknown as { query: jest.Mock }).query

const SIGNING_KEY = 'test-signing-key'

function signCalendly(body: string, key: string): string {
  const t = '0'
  const sig = createHmac('sha256', key).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${sig}`
}

function buildPayload(startTime: string) {
  return {
    event: 'invitee.created',
    payload: {
      scheduled_event: {
        start_time: startTime,
        event_memberships: [{ user: 'https://api.calendly.com/users/U' }],
        uri: 'https://api.calendly.com/scheduled_events/E',
        event_type: 'https://api.calendly.com/event_types/T',
        name: 'Demo',
      },
      invitee: { email: 'b@x.com', name: 'Booker', questions_and_answers: [] },
    },
  }
}

function buildRequest(payload: ReturnType<typeof buildPayload>): import('next/server').NextRequest {
  const body = JSON.stringify(payload)
  return new Request('http://x/calendly/webhook', {
    method: 'POST',
    headers: { 'Calendly-Webhook-Signature': signCalendly(body, SIGNING_KEY) },
    body,
  }) as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFindConn.mockResolvedValue({
    id: 'conn-1',
    accountId: 'acc-1',
    userEmail: 'host@x.com',
    signingKey: SIGNING_KEY,
    defaultTemplateId: 'tpl-1',
    personCode: 'P1',
  } as never)
  mockGetTpl.mockResolvedValue('tpl-1')
  mockClaim.mockResolvedValue(true)
  mockQuery.mockResolvedValue({ rows: [{ id: 'tpl-1', name: 'T', duration_minutes: 30, targets: {}, allow_holidays: true }] })
  mockExec.mockResolvedValue(undefined as never)
})

describe('Calendly webhook — host TZ conversion', () => {
  it('converts Tokyo wall-clock to Riga wall-clock for the host', async () => {
    mockMemberTz.mockResolvedValue('Europe/Riga')
    // 2026-04-27T15:00:00+09:00 = 06:00 UTC = 09:00 Riga (DST, UTC+3)
    const req = buildRequest(buildPayload('2026-04-27T15:00:00+09:00'))

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockExec).toHaveBeenCalledTimes(1)
    const args = mockExec.mock.calls[0][0]
    expect(args.date).toBe('2026-04-27')
    expect(args.time).toBe('09:00')
  })

  it('keeps booker time as-is when host is in same TZ', async () => {
    mockMemberTz.mockResolvedValue('Asia/Tokyo')
    const req = buildRequest(buildPayload('2026-04-27T15:00:00+09:00'))
    await POST(req)
    const args = mockExec.mock.calls[0][0]
    expect(args.date).toBe('2026-04-27')
    expect(args.time).toBe('15:00')
  })

  it('rolls the date back when conversion crosses midnight', async () => {
    mockMemberTz.mockResolvedValue('America/Los_Angeles')
    // 2026-04-28T03:00:00+09:00 = 18:00 UTC on 27th = 11:00 LA on 27th (PDT, UTC-7)
    const req = buildRequest(buildPayload('2026-04-28T03:00:00+09:00'))
    await POST(req)
    const args = mockExec.mock.calls[0][0]
    expect(args.date).toBe('2026-04-27')
    expect(args.time).toBe('11:00')
  })
})
