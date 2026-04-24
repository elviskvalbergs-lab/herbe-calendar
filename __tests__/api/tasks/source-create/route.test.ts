/**
 * @jest-environment node
 */
import { POST } from '@/app/api/tasks/[source]/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ accountId: 'a1', email: 'u@x.com' }),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/client', () => ({ herbeFetch: jest.fn(), herbeFetchById: jest.fn() }))
jest.mock('@/lib/outlook/tasks', () => ({ createOutlookTask: jest.fn() }))
jest.mock('@/lib/google/tasks', () => ({ createGoogleTask: jest.fn() }))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 's@x.com' }),
  getErpConnections: jest.fn().mockResolvedValue([{ id: 'c1', name: 'C' }]),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts: jest.fn().mockResolvedValue([{ id: 'tok-1', googleEmail: 'g@x.com', calendars: [] }]),
}))
jest.mock('@/lib/personCodes', () => ({ getCodeByEmail: jest.fn().mockResolvedValue('EKS') }))
jest.mock('@/lib/cache/tasks', () => ({ upsertCachedTasks: jest.fn().mockResolvedValue(undefined) }))

import { createOutlookTask } from '@/lib/outlook/tasks'
import { createGoogleTask } from '@/lib/google/tasks'
import { herbeFetch } from '@/lib/herbe/client'

const req = (body: unknown) => new Request('http://localhost/api/tasks/x', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

it('POST outlook creates via Graph', async () => {
  ;(createOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:N' })
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'outlook' }) })
  expect(res.status).toBe(200)
  expect(createOutlookTask).toHaveBeenCalledWith('u@x.com', { title: 'Hi' }, expect.anything())
})

it('POST google creates via Tasks API', async () => {
  ;(createGoogleTask as jest.Mock).mockResolvedValue({ id: 'google:N' })
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'google' }) })
  expect(res.status).toBe(200)
  expect(createGoogleTask).toHaveBeenCalledWith('tok-1', 'u@x.com', 'a1', { title: 'Hi' })
})

it('POST herbe posts TodoFlag=1 to ActVc with MainPersons=person_code', async () => {
  ;(herbeFetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify({ data: { ActVc: [{ SerNr: '99' }] } }), { status: 200 }),
  )
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'herbe' }) })
  expect(res.status).toBe(200)
  const [register, , init] = (herbeFetch as jest.Mock).mock.calls[0]
  expect(register).toBe('ActVc')
  expect(init.method).toBe('POST')
  expect(String(init.body)).toContain('TodoFlag=1')
  expect(String(init.body)).toContain('MainPersons=EKS')
})

it('POST herbe returns 422 when ERP silently rejects (no record in response)', async () => {
  ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'herbe' }) })
  expect(res.status).toBe(422)
})

it('returns 400 for unknown source', async () => {
  const res = await POST(req({ title: 'Hi' }), { params: Promise.resolve({ source: 'zzz' }) })
  expect(res.status).toBe(400)
})
