/**
 * @jest-environment node
 */
import { PATCH } from '@/app/api/tasks/[source]/[id]/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ accountId: 'a1', email: 'u@x.com' }),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchById: jest.fn(),
}))
jest.mock('@/lib/outlook/tasks', () => ({
  updateOutlookTask: jest.fn(),
}))
jest.mock('@/lib/google/tasks', () => ({
  updateGoogleTask: jest.fn(),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 's@x.com' }),
  getErpConnections: jest.fn().mockResolvedValue([{ id: 'c1', name: 'C' }]),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts: jest.fn().mockResolvedValue([{ id: 'tok-1', googleEmail: 'g@x.com', calendars: [] }]),
}))
jest.mock('@/lib/cache/tasks', () => ({ upsertCachedTasks: jest.fn().mockResolvedValue(undefined) }))

import { updateOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask } from '@/lib/google/tasks'
import { herbeFetchById } from '@/lib/herbe/client'

const req = (body: unknown) => new Request('http://localhost/api/tasks/x/y', {
  method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

it('toggling Outlook done calls updateOutlookTask', async () => {
  ;(updateOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:T', done: true })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'outlook', id: 'T' }) })
  expect(res.status).toBe(200)
  expect(updateOutlookTask).toHaveBeenCalledWith('u@x.com', 'T', { done: true }, expect.anything())
})

it('toggling Google done calls updateGoogleTask', async () => {
  ;(updateGoogleTask as jest.Mock).mockResolvedValue({ id: 'google:T', done: true })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'google', id: 'T' }) })
  expect(res.status).toBe(200)
  expect(updateGoogleTask).toHaveBeenCalledWith('tok-1', 'u@x.com', 'a1', 'T', { done: true })
})

it('toggling ERP done PATCHes ActVc via herbeFetchById with OKFlag=1', async () => {
  ;(herbeFetchById as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify({ data: { ActVc: [{ SerNr: '12345', OKFlag: '1' }] } }), { status: 200 }),
  )
  const res = await PATCH(
    req({ done: true, connectionId: 'c1' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(200)
  const [register, id, init] = (herbeFetchById as jest.Mock).mock.calls[0]
  expect(register).toBe('ActVc')
  expect(id).toBe('12345')
  expect(init.method).toBe('PATCH')
  expect(String(init.body)).toContain('OKFlag=1')
})

it('ERP PATCH returns 422 when ERP silently rejects (no record in response)', async () => {
  ;(herbeFetchById as jest.Mock).mockResolvedValue(new Response('{}', { status: 200 }))
  const res = await PATCH(
    req({ title: 'New title', connectionId: 'c1' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(422)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/record-check|not be saved|not saved/i)
})

it('ERP PATCH forwards activityTypeCode/projectCode/customerCode as ActType/PRCode/CUCode', async () => {
  ;(herbeFetchById as jest.Mock).mockReset().mockResolvedValue(
    new Response(JSON.stringify({ data: { ActVc: [{ SerNr: '12345' }] } }), { status: 200 }),
  )
  await PATCH(
    req({ activityTypeCode: 'A', projectCode: '16092', customerCode: '10885', connectionId: 'c1' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  const [, , init] = (herbeFetchById as jest.Mock).mock.calls[0]
  const body = String(init.body)
  expect(body).toContain('ActType=A')
  expect(body).toContain('PRCode=16092')
  expect(body).toContain('CUCode=10885')
})

it('returns 400 for unknown source', async () => {
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'zzz', id: 'T' }) })
  expect(res.status).toBe(400)
})
