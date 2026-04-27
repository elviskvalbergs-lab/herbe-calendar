jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn(),
}))
jest.mock('@/lib/accountTimezone', () => ({
  getAccountTimezone: jest.fn(),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))

import { fetchOutlookEventsForPerson, fetchOutlookEventsMinimal } from '@/lib/outlookUtils'
import { getAzureConfig } from '@/lib/accountConfig'
import { getAccountTimezone } from '@/lib/accountTimezone'
import { graphFetch } from '@/lib/graph/client'

const mockGetAzureConfig = getAzureConfig as jest.MockedFunction<typeof getAzureConfig>
const mockGetAccountTimezone = getAccountTimezone as jest.MockedFunction<typeof getAccountTimezone>
const mockGraphFetch = graphFetch as jest.MockedFunction<typeof graphFetch>

const baseAzure = {
  tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 'a@b',
  sourceTimezone: null as string | null,
}

function okResponse(value: unknown[] = []): Response {
  return { ok: true, status: 200, json: async () => ({ value }) } as unknown as Response
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGraphFetch.mockResolvedValue(okResponse())
})

describe('fetchOutlookEventsForPerson — Prefer header TZ', () => {
  it('uses azureConfig.sourceTimezone when set', async () => {
    mockGetAzureConfig.mockResolvedValue({ ...baseAzure, sourceTimezone: 'Asia/Tokyo' })
    mockGetAccountTimezone.mockResolvedValue('Europe/Riga')
    await fetchOutlookEventsForPerson('u@x.com', 'acc-1', '2026-04-01', '2026-04-30')
    const headers = (mockGraphFetch.mock.calls[0][1] as RequestInit | undefined)?.headers as Record<string, string> | undefined
    expect(headers?.Prefer).toBe('outlook.timezone="Asia/Tokyo"')
  })

  it('falls back to account default when sourceTimezone is null', async () => {
    mockGetAzureConfig.mockResolvedValue({ ...baseAzure, sourceTimezone: null })
    mockGetAccountTimezone.mockResolvedValue('Europe/London')
    await fetchOutlookEventsForPerson('u@x.com', 'acc-1', '2026-04-01', '2026-04-30')
    const headers = (mockGraphFetch.mock.calls[0][1] as RequestInit | undefined)?.headers as Record<string, string> | undefined
    expect(headers?.Prefer).toBe('outlook.timezone="Europe/London"')
  })
})

describe('fetchOutlookEventsMinimal — Prefer header TZ', () => {
  it('uses resolved TZ', async () => {
    mockGetAzureConfig.mockResolvedValue({ ...baseAzure, sourceTimezone: 'Asia/Tokyo' })
    mockGetAccountTimezone.mockResolvedValue('Europe/Riga')
    await fetchOutlookEventsMinimal('u@x.com', 'acc-1', '2026-04-01', '2026-04-30')
    const headers = (mockGraphFetch.mock.calls[0][1] as RequestInit | undefined)?.headers as Record<string, string> | undefined
    expect(headers?.Prefer).toBe('outlook.timezone="Asia/Tokyo"')
  })
})
