/**
 * @jest-environment node
 */
jest.mock('@/lib/herbe/client', () => ({
  herbeFetch: jest.fn(),
  herbeFetchById: jest.fn(),
}))

import { saveActVcRecord, toHerbeForm } from '@/lib/herbe/actVcSave'
import { herbeFetch, herbeFetchById } from '@/lib/herbe/client'

const patchResOk = () =>
  new Response(JSON.stringify({ data: { ActVc: [{ SerNr: '42', Comment: 'ok' }] } }), { status: 200 })

const postResOk = () =>
  new Response(JSON.stringify({ data: { ActVc: [{ SerNr: '99' }] } }), { status: 200 })

describe('toHerbeForm', () => {
  it('omits empty strings by default, allows via allowEmptyFields', () => {
    expect(toHerbeForm({ Comment: '' })).toBe('')
    expect(toHerbeForm({ CCPersons: '' }, new Set(['CCPersons']))).toContain('CCPersons=')
  })
})

describe('saveActVcRecord — create', () => {
  beforeEach(() => jest.resetAllMocks())

  it('returns the persisted record on success', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(postResOk())
    const r = await saveActVcRecord({ Comment: 'Hi', TodoFlag: '1' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.record.SerNr).toBe('99')
  })

  it('returns 422 when ERP returns 200 but no record — silent record-check rejection', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      expect(r.error).toMatch(/record-check/i)
    }
  })

  it('returns 422 with messages when ERP responds with errors array', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(
      JSON.stringify({ errors: [{ '@description': 'Mandatory field missing', '@field': 'Comment' }] }),
      { status: 200 },
    ))
    const r = await saveActVcRecord({ TodoFlag: '1' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      expect(r.errors).toEqual(['Comment: Mandatory field missing'])
    }
  })

  it('passes through HTTP error status when ERP returns non-2xx', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response('nope', { status: 503 }))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(503)
  })
})

describe('saveActVcRecord — update', () => {
  beforeEach(() => jest.resetAllMocks())

  it('uses PATCH with the provided id', async () => {
    ;(herbeFetchById as jest.Mock).mockResolvedValue(patchResOk())
    const r = await saveActVcRecord({ Comment: 'Updated' }, { id: '42' })
    expect(r.ok).toBe(true)
    const [register, id, init] = (herbeFetchById as jest.Mock).mock.calls[0]
    expect(register).toBe('ActVc')
    expect(id).toBe('42')
    expect(init.method).toBe('PATCH')
  })

  it('returns 422 when PATCH response has no record — the bug users experienced as "edits do not save"', async () => {
    ;(herbeFetchById as jest.Mock).mockResolvedValue(new Response('{}', { status: 200 }))
    const r = await saveActVcRecord({ Comment: 'Updated' }, { id: '42' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(422)
  })
})
