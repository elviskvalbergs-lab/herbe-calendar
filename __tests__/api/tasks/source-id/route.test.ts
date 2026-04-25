/**
 * @jest-environment node
 */
import { PATCH, DELETE } from '@/app/api/tasks/[source]/[id]/route'

jest.mock('@/lib/herbe/auth-guard', () => ({
  requireSession: jest.fn().mockResolvedValue({ accountId: 'a1', email: 'u@x.com', userCode: 'EKS' }),
  unauthorized: () => new Response(null, { status: 401 }),
}))
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchById: jest.fn(),
  herbeWebExcellentDelete: jest.fn(),
}))
jest.mock('@/lib/outlook/tasks', () => ({
  updateOutlookTask: jest.fn(),
  moveOutlookTask: jest.fn(),
  deleteOutlookTask: jest.fn(),
}))
jest.mock('@/lib/google/tasks', () => ({
  updateGoogleTask: jest.fn(),
  deleteGoogleTask: jest.fn(),
}))
jest.mock('@/lib/accountConfig', () => ({
  getAzureConfig: jest.fn().mockResolvedValue({ tenantId: 't', clientId: 'c', clientSecret: 's', senderEmail: 's@x.com' }),
  getErpConnections: jest.fn().mockResolvedValue([{ id: 'c1', name: 'C' }]),
}))
jest.mock('@/lib/google/userOAuth', () => ({
  getUserGoogleAccounts: jest.fn().mockResolvedValue([{ id: 'tok-1', googleEmail: 'g@x.com', calendars: [] }]),
}))
jest.mock('@/lib/cache/tasks', () => ({
  upsertCachedTasks: jest.fn().mockResolvedValue(undefined),
  deleteCachedTask: jest.fn().mockResolvedValue(undefined),
}))

import { updateOutlookTask, moveOutlookTask, deleteOutlookTask } from '@/lib/outlook/tasks'
import { updateGoogleTask, deleteGoogleTask } from '@/lib/google/tasks'
import { herbeFetchById, herbeWebExcellentDelete } from '@/lib/herbe/client'

const req = (body: unknown, method = 'PATCH') => new Request('http://localhost/api/tasks/x/y', {
  method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
})

it('toggling Outlook done calls updateOutlookTask', async () => {
  ;(updateOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:T', done: true })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'outlook', id: 'T' }) })
  expect(res.status).toBe(200)
  // 5th arg is the optional currentListId — undefined when not supplied.
  expect(updateOutlookTask).toHaveBeenCalledWith(
    'u@x.com', 'T',
    expect.objectContaining({ done: true }),
    expect.anything(),
    undefined,
  )
})

it('passes currentListId through to updateOutlookTask when supplied', async () => {
  ;(updateOutlookTask as jest.Mock).mockResolvedValue({ id: 'outlook:T' })
  await PATCH(
    req({ done: true, currentListId: 'LIST-A' }),
    { params: Promise.resolve({ source: 'outlook', id: 'T' }) },
  )
  expect(updateOutlookTask).toHaveBeenLastCalledWith(
    'u@x.com', 'T', expect.anything(), expect.anything(), 'LIST-A',
  )
})

it('passes currentListId through to updateGoogleTask when supplied', async () => {
  ;(updateGoogleTask as jest.Mock).mockResolvedValue({ task: { id: 'google:T' } })
  await PATCH(
    req({ done: true, currentListId: 'LIST-G' }),
    { params: Promise.resolve({ source: 'google', id: 'T' }) },
  )
  expect(updateGoogleTask).toHaveBeenLastCalledWith(
    'tok-1', 'u@x.com', 'a1', 'T',
    expect.objectContaining({ currentListId: 'LIST-G' }),
  )
})

it('toggling Google done calls updateGoogleTask', async () => {
  ;(updateGoogleTask as jest.Mock).mockResolvedValue({ task: { id: 'google:T', done: true } })
  const res = await PATCH(req({ done: true }), { params: Promise.resolve({ source: 'google', id: 'T' }) })
  expect(res.status).toBe(200)
  expect(updateGoogleTask).toHaveBeenCalledWith(
    'tok-1', 'u@x.com', 'a1', 'T',
    expect.objectContaining({ done: true }),
  )
})

it('forwards Google move warning to the response', async () => {
  ;(updateGoogleTask as jest.Mock).mockResolvedValue({
    task: { id: 'google:NEW' },
    warning: 'ORIGINAL_NOT_DELETED',
  })
  const res = await PATCH(
    req({ targetGoogleListId: 'L2' }),
    { params: Promise.resolve({ source: 'google', id: 'T' }) },
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.warning).toBe('ORIGINAL_NOT_DELETED')
})

it('forwards Outlook move warning to the response', async () => {
  ;(moveOutlookTask as jest.Mock).mockResolvedValue({
    task: { id: 'outlook:NEW' },
    warning: 'ORIGINAL_NOT_DELETED',
  })
  const res = await PATCH(
    req({ targetListId: 'L2' }),
    { params: Promise.resolve({ source: 'outlook', id: 'T' }) },
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.warning).toBe('ORIGINAL_NOT_DELETED')
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

// Regression: bug #6 — refuse to silently fall back to conns[0] when caller
// supplied an unknown connectionId. The old code would write to a different
// ERP tenant; we now reject with 400.
it('PATCH herbe returns 400 when connectionId is unknown (no silent fallback)', async () => {
  const res = await PATCH(
    req({ done: true, connectionId: 'BOGUS' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(400)
  const body = await res.json() as { error: string }
  expect(body.error).toMatch(/connectionId/i)
})

// Regression: bug #5 — schema validation rejects bad shapes early.
it('PATCH rejects non-string title with 400', async () => {
  const res = await PATCH(req({ title: 123 }), { params: Promise.resolve({ source: 'outlook', id: 'T' }) })
  expect(res.status).toBe(400)
})

it('PATCH rejects non-array mainPersons with 400', async () => {
  const res = await PATCH(
    req({ mainPersons: 'EKS' }),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(400)
})

// Regression: bug #2 — URL-segment id must reject query smuggling. The path
// `id` reaches downstream URL builders; rejecting `?` here ensures the lib
// helpers can't be tricked into appending query params.
it('PATCH rejects ids containing query characters with 400', async () => {
  const res = await PATCH(
    req({ done: true }),
    { params: Promise.resolve({ source: 'outlook', id: 'abc?$expand=x' }) },
  )
  expect(res.status).toBe(400)
})

it('PATCH rejects body.targetListId containing forbidden characters', async () => {
  const res = await PATCH(
    req({ targetListId: 'L?evil=1' }),
    { params: Promise.resolve({ source: 'outlook', id: 'T' }) },
  )
  expect(res.status).toBe(400)
})

// ---------------- DELETE handler ----------------

it('DELETE outlook calls deleteOutlookTask and returns ok', async () => {
  ;(deleteOutlookTask as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'outlook', id: 'T' }) },
  )
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(deleteOutlookTask).toHaveBeenCalledWith('u@x.com', 'T', expect.anything(), undefined)
})

it('DELETE outlook returns 404 when source-side task is missing', async () => {
  ;(deleteOutlookTask as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'outlook', id: 'GONE' }) },
  )
  expect(res.status).toBe(404)
})

it('DELETE google calls deleteGoogleTask and returns ok', async () => {
  ;(deleteGoogleTask as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'google', id: 'T' }) },
  )
  expect(res.status).toBe(200)
  expect(deleteGoogleTask).toHaveBeenCalledWith('tok-1', 'u@x.com', 'a1', 'T', undefined)
})

it('DELETE google returns 404 when source-side task is missing', async () => {
  ;(deleteGoogleTask as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'google', id: 'GONE' }) },
  )
  expect(res.status).toBe(404)
})

it('DELETE herbe calls herbeWebExcellentDelete with the session userCode', async () => {
  ;(herbeWebExcellentDelete as jest.Mock).mockResolvedValue({ ok: true, status: 200, text: async () => '' })
  const res = await DELETE(
    req({ connectionId: 'c1' }, 'DELETE'),
    { params: Promise.resolve({ source: 'herbe', id: '12345' }) },
  )
  expect(res.status).toBe(200)
  expect(herbeWebExcellentDelete).toHaveBeenCalledWith('ActVc', '12345', 'EKS', expect.anything())
})

it('DELETE herbe returns 404 when source-side task is missing', async () => {
  ;(herbeWebExcellentDelete as jest.Mock).mockResolvedValue({ ok: false, status: 404, text: async () => '' })
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'herbe', id: 'GONE' }) },
  )
  expect(res.status).toBe(404)
})

it('DELETE rejects ids containing query characters with 400', async () => {
  const res = await DELETE(
    req({}, 'DELETE'),
    { params: Promise.resolve({ source: 'outlook', id: 'a?b=1' }) },
  )
  expect(res.status).toBe(400)
})
