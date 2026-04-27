jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn(),
  getCalendarClient: jest.fn(),
  getOAuthCalendarClient: jest.fn(),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts: jest.fn(),
  getValidAccessTokenForUser: jest.fn(),
}))
jest.mock('@/lib/accountTimezone', () => ({
  getAccountTimezone: jest.fn(),
}))

import { fetchGoogleEventsForPerson } from '@/lib/googleUtils'
import { getGoogleConfig, getCalendarClient } from '@/lib/google/client'
import { getAccountTimezone } from '@/lib/accountTimezone'

const mockGetGoogleConfig = getGoogleConfig as jest.MockedFunction<typeof getGoogleConfig>
const mockGetCalendarClient = getCalendarClient as jest.MockedFunction<typeof getCalendarClient>
const mockGetAccountTimezone = getAccountTimezone as jest.MockedFunction<typeof getAccountTimezone>

describe('fetchGoogleEventsForPerson — TZ params', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('uses resolved account TZ and UTC boundaries (no +03:00 hardcoded)', async () => {
    mockGetGoogleConfig.mockResolvedValue({ /* any non-null shape */ } as never)
    mockGetAccountTimezone.mockResolvedValue('Asia/Tokyo')
    const eventsList = jest.fn().mockResolvedValue({ data: { items: [] } })
    mockGetCalendarClient.mockReturnValue({ events: { list: eventsList } } as never)

    await fetchGoogleEventsForPerson('u@x.com', 'acc-1', '2026-04-01', '2026-04-30')

    expect(eventsList).toHaveBeenCalledTimes(1)
    const params = eventsList.mock.calls[0][0]
    expect(params.timeZone).toBe('Asia/Tokyo')
    expect(params.timeMin).toBe('2026-04-01T00:00:00Z')
    expect(params.timeMax).toBe('2026-04-30T23:59:59Z')
  })

  it('falls back to Europe/Riga when account TZ resolver returns it', async () => {
    mockGetGoogleConfig.mockResolvedValue({} as never)
    mockGetAccountTimezone.mockResolvedValue('Europe/Riga')
    const eventsList = jest.fn().mockResolvedValue({ data: { items: [] } })
    mockGetCalendarClient.mockReturnValue({ events: { list: eventsList } } as never)

    await fetchGoogleEventsForPerson('u@x.com', 'acc-1', '2026-04-01', '2026-04-30')

    expect(eventsList.mock.calls[0][0].timeZone).toBe('Europe/Riga')
  })
})
