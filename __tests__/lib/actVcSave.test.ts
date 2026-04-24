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

  it('includes raw response text in the error when ERP returns unparseable JSON', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response('<html>Oops</html>', { status: 200 }))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      // Must not show "null" — that's what the user saw before the fix
      expect(r.error).not.toMatch(/response: null/)
      expect(r.error).toContain('<html>Oops</html>')
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
      // Friendly label ("Title" > "Comment") + mapped code message
      expect(r.errors).toEqual(['Title: Mandatory field missing'])
    }
  })

  it('formats 1058 errors as "<Field> is required" and returns fieldErrors', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(
      JSON.stringify({ errors: [{ '@code': '1058', '@field': 'ActType' }] }),
      { status: 200 },
    ))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('Activity type is required')
      expect(r.fieldErrors).toEqual([{ field: 'ActType', label: 'Activity type', code: '1058' }])
    }
  })

  // Actual production shape captured from Herbe: error nested under data.error
  // with @field alongside Latvian text in data.messages. The field tree-walk
  // must find @field despite it not being on the top-level errors array.
  it('finds fieldErrors when @field is nested under data.error (Herbe 1058 shape)', async () => {
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(
      JSON.stringify({
        data: {
          messages: ['Obligāti jāaizpilda Aktivitātes tips'],
          error: { '@code': '1058', '@description': ' Aktivitātes tips', '@field': 'ActType' },
        },
      }),
      { status: 200 },
    ))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.fieldErrors).toEqual([{ field: 'ActType', label: 'Activity type', code: '1058' }])
      // Message should be a short sentence, not a raw JSON dump — the pills
      // carry the per-field info, so the banner text just needs to read
      // naturally.
      expect(r.error).toBe('Activity type is required')
    }
  })

  // Observed in production logs: the ERP body arrives unbalanced — missing
  // the root closing brace. JSON.parse rejects it, which used to drop
  // fieldErrors entirely. The helper must repair mild brace mismatches so
  // the structured field info still reaches the client.
  it('repairs unbalanced braces before parsing so fieldErrors survive', async () => {
    const truncated =
      '{"data":{"messages":["Obligāti jāaizpilda Aktivitātes tips"],"error":{"@code":"1058","@description":" Aktivitātes tips","@field":"ActType"}}'
    ;(herbeFetch as jest.Mock).mockResolvedValue(new Response(truncated, { status: 200 }))
    const r = await saveActVcRecord({ Comment: 'Hi' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.fieldErrors).toEqual([{ field: 'ActType', label: 'Activity type', code: '1058' }])
    }
  })

  // Second production shape: the PATCH *succeeded* but the body is
  // structurally invalid — an unnamed `{"@register":"ActVc",...record...}`
  // sits as a bare object inside `data`, tacked on after the metadata
  // fields. The helper rewrites `,{"@register"` → `,"record":{"@register"`
  // so JSON.parse accepts it, then the SerNr tree-walk finds the record
  // regardless of the key it ended up under.
  it('extracts the record when Herbe emits an unnamed sibling object in data', async () => {
    const malformed =
      '{"data":{"@register":"ActVc","@sequence":"31088897","@url":"/api/3/ActVc/879333",' +
      '{"@register":"ActVc","SerNr":"879333","Comment":"Kas?","ActType":"A","TodoFlag":"1"}}}'
    ;(herbeFetchById as jest.Mock).mockResolvedValue(new Response(malformed, { status: 200 }))
    const r = await saveActVcRecord({ Comment: 'Kas?', ActType: 'A' }, { id: '879333' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.record.SerNr).toBe('879333')
      expect(r.record.Comment).toBe('Kas?')
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
