/**
 * @jest-environment node
 */
import { GET } from '@/app/api/tasks/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn(),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/taskRecordUtils', () => ({
  fetchErpTasks: jest.fn(),
}))
jest.mock('@/lib/outlook/tasks', () => ({
  fetchOutlookTasks: jest.fn(),
}))
jest.mock('@/lib/google/tasks', () => ({
  fetchGoogleTasks: jest.fn(),
}))
jest.mock('@/lib/cache/tasks', () => ({
  getCachedTasks: jest.fn().mockResolvedValue([]),
  replaceCachedTasksForSource: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/personCodes', () => ({
  getCodeByEmail: jest.fn().mockResolvedValue('EKS'),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/google/client', () => ({
  getGoogleConfig: jest.fn().mockResolvedValue(null),
}))

import { requireSession } from '@/lib/herbe/auth-guard'
import { fetchErpTasks } from '@/lib/herbe/taskRecordUtils'
import { fetchOutlookTasks } from '@/lib/outlook/tasks'
import { fetchGoogleTasks } from '@/lib/google/tasks'
import { getAzureConfig } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'

const mockReq = (): Request => new Request('http://localhost/api/tasks')

beforeEach(() => {
  ;(requireSession as jest.Mock).mockResolvedValue({ accountId: 'a1', email: 'u@x.com' })
  ;(fetchErpTasks as jest.Mock).mockResolvedValue({ tasks: [], errors: [] })
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValue({ tasks: [], configured: false })
  ;(fetchGoogleTasks as jest.Mock).mockResolvedValue({ tasks: [], configured: false })
})

it('returns 401 when no session', async () => {
  ;(requireSession as jest.Mock).mockRejectedValueOnce(new Error('no session'))
  const res = await GET(mockReq())
  expect(res.status).toBe(401)
})

it('returns 200 with merged tasks and configured flags', async () => {
  ;(getAzureConfig as jest.Mock).mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 's@x.com' })
  ;(getUserGoogleAccounts as jest.Mock).mockResolvedValueOnce([{ id: 'tok-1', googleEmail: 'g@x.com', calendars: [] }])
  ;(fetchErpTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [{ id: 'herbe:1', source: 'herbe', sourceConnectionId: 'c1', title: 'E', done: false }],
    errors: [],
  })
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [{ id: 'outlook:1', source: 'outlook', sourceConnectionId: '', title: 'O', done: false }],
    configured: true,
  })
  ;(fetchGoogleTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [{ id: 'google:1', source: 'google', sourceConnectionId: '', title: 'G', done: false }],
    configured: true,
  })
  const res = await GET(mockReq())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.tasks).toHaveLength(3)
  expect(body.configured).toEqual({ herbe: true, outlook: true, google: true })
})

it('returns 200 even when a source errors; error is reported per-source', async () => {
  ;(getAzureConfig as jest.Mock).mockResolvedValueOnce({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 's@x.com' })
  ;(fetchOutlookTasks as jest.Mock).mockResolvedValueOnce({
    tasks: [], configured: true, error: 'network timeout',
  })
  const res = await GET(mockReq())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.errors.find((e: any) => e.source === 'outlook')?.msg).toContain('network timeout')
})
