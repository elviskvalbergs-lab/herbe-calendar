jest.mock('@/lib/db', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'b1' }] }),
  },
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn(),
  getErpConnections: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn(),
  getCalendarClient: jest.fn(),
  buildGoogleMeetConferenceData: jest.fn(),
}))
jest.mock('@/lib/zoom/client', () => ({
  getZoomConfig: jest.fn().mockResolvedValue(null),
  createZoomMeeting: jest.fn(),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
  sendMail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchAll: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/smtp', () => ({
  getSmtpConfig: jest.fn().mockResolvedValue(null),
  sendMailSmtp: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/emailForCode', () => ({
  emailForCode: jest.fn().mockResolvedValue('host@x.com'),
}))
jest.mock('@/lib/accountTimezone', () => ({
  getAccountTimezone: jest.fn(),
  getMemberTimezone: jest.fn(),
}))

import { executeBooking } from '@/lib/bookingExecutor'
import { getAzureConfig } from '@/lib/accountConfig'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { graphFetch } from '@/lib/graph/client'
import { getAccountTimezone, getMemberTimezone } from '@/lib/accountTimezone'

const mockAzure = getAzureConfig as jest.MockedFunction<typeof getAzureConfig>
const mockGoogle = getGoogleConfig as jest.MockedFunction<typeof getGoogleConfig>
const mockGetCalClient = getCalendarClient as jest.MockedFunction<typeof getCalendarClient>
const mockGraph = graphFetch as jest.MockedFunction<typeof graphFetch>
const mockAccountTz = getAccountTimezone as jest.MockedFunction<typeof getAccountTimezone>
const mockMemberTz = getMemberTimezone as jest.MockedFunction<typeof getMemberTimezone>

const baseInput = {
  template: { id: 't', name: 'Demo', duration_minutes: 30, targets: {}, allow_holidays: true },
  date: '2026-04-27',
  time: '09:00',
  bookerEmail: 'b@x.com',
  bookerName: 'Booker',
  fieldValues: {} as Record<string, string>,
  personCodes: ['P1'],
  ownerEmail: 'host@x.com',
  accountId: 'acc-1',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAccountTz.mockResolvedValue('Europe/Riga')
  mockMemberTz.mockResolvedValue('Europe/Riga')
})

describe('executeBooking — Outlook event TZ', () => {
  it('uses azureConfig.sourceTimezone when set', async () => {
    mockAzure.mockResolvedValue({
      tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 'a@b',
      sourceTimezone: 'Asia/Tokyo',
    } as never)
    mockGraph.mockResolvedValue({ ok: true, json: async () => ({ id: 'E1' }) } as Response)

    await executeBooking({
      ...baseInput,
      template: { ...baseInput.template, targets: { outlook: { enabled: true } } as never },
    } as never)

    const body = JSON.parse((mockGraph.mock.calls[0][1] as RequestInit).body as string)
    expect(body.start.timeZone).toBe('Asia/Tokyo')
    expect(body.end.timeZone).toBe('Asia/Tokyo')
  })

  it('falls back to account TZ when sourceTimezone is null', async () => {
    mockAzure.mockResolvedValue({
      tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 'a@b',
      sourceTimezone: null,
    } as never)
    mockAccountTz.mockResolvedValue('Europe/London')
    mockGraph.mockResolvedValue({ ok: true, json: async () => ({ id: 'E1' }) } as Response)

    await executeBooking({
      ...baseInput,
      template: { ...baseInput.template, targets: { outlook: { enabled: true } } as never },
    } as never)

    const body = JSON.parse((mockGraph.mock.calls[0][1] as RequestInit).body as string)
    expect(body.start.timeZone).toBe('Europe/London')
  })
})

describe('executeBooking — Google event TZ', () => {
  it('uses member TZ for Google primary calendar event', async () => {
    mockGoogle.mockResolvedValue({} as never)
    mockMemberTz.mockResolvedValue('Asia/Tokyo')
    const eventsInsert = jest.fn().mockResolvedValue({ data: { id: 'G1' } })
    mockGetCalClient.mockReturnValue({ events: { insert: eventsInsert } } as never)

    await executeBooking({
      ...baseInput,
      template: { ...baseInput.template, targets: { google: { enabled: true } } as never },
    } as never)

    expect(eventsInsert).toHaveBeenCalledTimes(1)
    const call = eventsInsert.mock.calls[0][0]
    expect(call.requestBody.start.timeZone).toBe('Asia/Tokyo')
    expect(call.requestBody.end.timeZone).toBe('Asia/Tokyo')
  })
})
