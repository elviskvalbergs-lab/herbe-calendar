import { GET } from '@/app/api/destinations/route'
import type { Destination } from '@/lib/destinations/types'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized:   jest.fn(() => new Response(JSON.stringify({ error: 'unauth' }), { status: 401 })),
}))
jest.mock('@/lib/accountConfig', () => ({
  getErpConnections: jest.fn(),
  getAzureConfig:    jest.fn(),
}))
jest.mock('@/lib/graph/client', () => ({
  graphFetch: jest.fn(),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts:   jest.fn(),
  getValidAccessTokenForUser: jest.fn(),
}))

import { requireSession } from '@/lib/herbe/auth-guard'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
import { getUserGoogleAccounts, getValidAccessTokenForUser } from '@/lib/google/userOAuth'

const mockSession = requireSession as jest.Mock
const mockErp = getErpConnections as jest.Mock
const mockAzure = getAzureConfig as jest.Mock
const mockGraph = graphFetch as jest.Mock
const mockAccounts = getUserGoogleAccounts as jest.Mock
const mockToken = getValidAccessTokenForUser as jest.Mock

beforeEach(() => {
  jest.resetAllMocks()
  mockSession.mockResolvedValue({ email: 'x@y.z', accountId: 'acc-1' })
  mockErp.mockResolvedValue([{ id: 'conn-1', name: 'Burti' }])
  mockAzure.mockResolvedValue(null)
  mockAccounts.mockResolvedValue([])
})

function makeReq(mode: 'task' | 'event'): Request {
  return new Request(`http://localhost/api/destinations?mode=${mode}`)
}

describe('GET /api/destinations', () => {
  it('returns 400 if mode is missing or invalid', async () => {
    const res = await GET(new Request('http://localhost/api/destinations'))
    expect(res.status).toBe(400)
  })

  it('task mode: includes ERP destinations', async () => {
    const res = await GET(makeReq('task'))
    const body = await res.json() as Destination[]
    expect(body.some(d => d.source === 'herbe' && d.meta.kind === 'herbe')).toBe(true)
  })

  it('event mode: returns an Outlook event destination when azureConfig exists', async () => {
    mockAzure.mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's' })
    const res = await GET(makeReq('event'))
    const body = await res.json() as Destination[]
    expect(body.some(d => d.meta.kind === 'outlook-event')).toBe(true)
  })

  it('task mode: fetches Outlook To Do lists via Graph', async () => {
    mockAzure.mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's' })
    mockGraph.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [{ id: 'LIST-A', displayName: 'Tasks' }] }),
    } as unknown as Response)
    const res = await GET(makeReq('task'))
    const body = await res.json() as Destination[]
    const outlook = body.find(d => d.meta.kind === 'outlook-task')
    expect(outlook).toBeDefined()
    expect(outlook?.key).toBe('outlook:LIST-A')
  })

  it('task mode: enumerates Google Tasks lists across per-user accounts', async () => {
    mockAccounts.mockResolvedValueOnce([{ id: 'TOK-1', googleEmail: 'x@y.z', calendars: [] }])
    mockToken.mockResolvedValue('ya29.abc')
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () =>
      ({ ok: true, status: 200, text: async () => '',
         json: async () => ({ items: [{ id: 'GL-1', title: 'My Tasks' }] }) }) as unknown as Response
    ) as typeof fetch
    try {
      const res = await GET(makeReq('task'))
      const body = await res.json() as Destination[]
      const g = body.find(d => d.meta.kind === 'google-task')
      expect(g).toBeDefined()
      expect(g?.key).toBe('google:TOK-1:GL-1')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('omits a source that errors instead of failing the whole request', async () => {
    mockErp.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(makeReq('task'))
    expect(res.status).toBe(200)
    const body = await res.json() as Destination[]
    expect(body.every(d => d.source !== 'herbe')).toBe(true)
  })
})
