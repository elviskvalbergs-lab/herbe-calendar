import { herbeFetch, herbeFetchById } from './client'
import { REGISTERS } from './constants'
import { extractHerbeError, extractHerbeFieldErrors, type HerbeFieldError } from './errors'
import type { ErpConnection } from '@/lib/accountConfig'

/**
 * Encode an object as Herbe's URL-encoded form body.
 * - Text is row-based (split into 100-char chunks on row 0+); other fields
 *   use `set_field.KEY=value`.
 * - Empty strings are skipped unless the field is in `allowEmptyFields`
 *   (used for CCPersons, where "" is the valid way to clear the list).
 */
export function toHerbeForm(
  data: Record<string, unknown>,
  allowEmptyFields: Set<string> = new Set(),
): string {
  const parts: string[] = []

  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue
    if (v === '' && !allowEmptyFields.has(k)) continue

    if (k === 'Text') {
      const text = String(v)
      if (!text) {
        parts.push(`set_row_field.0.Text=`)
      } else {
        const lines = text.split('\n')
        const chunks: string[] = []
        for (const line of lines) {
          if (line.length === 0) {
            chunks.push('')
            continue
          }
          const words = line.split(' ')
          let currentChunk = ''
          for (const word of words) {
            if (!currentChunk) {
              currentChunk = word
            } else if (currentChunk.length + 1 + word.length <= 100) {
              currentChunk += ' ' + word
            } else {
              chunks.push(currentChunk)
              currentChunk = word
            }
            while (currentChunk.length > 100) {
              chunks.push(currentChunk.slice(0, 100))
              currentChunk = currentChunk.slice(100)
            }
          }
          if (currentChunk) chunks.push(currentChunk)
        }

        chunks.forEach((chunk, i) => {
          parts.push(`set_row_field.${i}.Text=${encodeURIComponent(chunk)}`)
        })
        // Clear up to 10 subsequent rows to avoid leftover text if the new text is shorter
        for (let i = chunks.length; i < chunks.length + 10; i++) {
          parts.push(`set_row_field.${i}.Text=`)
        }
      }
      continue
    }

    parts.push(`set_field.${k}=${encodeURIComponent(String(v))}`)
  }

  return parts.join('&')
}

export type SaveActVcResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; error: string; errors?: string[]; fieldErrors?: HerbeFieldError[]; status: number }

/**
 * Create (POST) or update (PATCH) an ActVc record — the single ERP register
 * that stores both calendar events and tasks (differing only by TodoFlag).
 *
 * Validates the response against three silent-failure modes:
 *   1. non-2xx HTTP status
 *   2. HTTP 200 with a populated `errors` array (validation failures)
 *   3. HTTP 200 with no record returned (RecordCheck hook rejected without
 *      an explicit error — without this check we'd return success to the
 *      client for a write that never landed)
 */
export async function saveActVcRecord(
  body: Record<string, unknown>,
  opts: { id?: string; allowEmptyFields?: Set<string>; conn?: ErpConnection } = {},
): Promise<SaveActVcResult> {
  const formBody = toHerbeForm(body, opts.allowEmptyFields ?? new Set())
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
  const res = opts.id
    ? await herbeFetchById(REGISTERS.activities, opts.id, { method: 'PATCH', body: formBody, headers }, opts.conn)
    : await herbeFetch(REGISTERS.activities, undefined, { method: 'POST', body: formBody, headers }, opts.conn)

  // ERP occasionally embeds raw control chars in string fields, which breaks JSON.parse.
  const rawText = await res.text()
  const sanitized = rawText.replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ')
  const data = ((): Record<string, unknown> | null => {
    // First try normal parse.
    try { return JSON.parse(sanitized) as Record<string, unknown> } catch { /* fall through */ }
    // Herbe sometimes returns JSON with unbalanced braces (observed on 422-
    // style rejections — the body stops before the root object closes). Try
    // closing up to a handful of missing braces/brackets before giving up.
    const opens = (sanitized.match(/[{[]/g) ?? []).length
    const closes = (sanitized.match(/[}\]]/g) ?? []).length
    const missing = opens - closes
    if (missing > 0 && missing <= 5) {
      // Append closers in "}" first, "]" second order — right for the
      // common case of a trailing object inside an object.
      const repaired = sanitized + '}'.repeat(missing)
      try { return JSON.parse(repaired) as Record<string, unknown> } catch { /* still bad */ }
    }
    return null
  })()

  const label = `${opts.id ? 'PATCH' : 'POST'} ActVc${opts.id ? '/' + opts.id : ''}`
  console.log(`${label} → ${res.status}`)

  if (!res.ok) {
    return { ok: false, error: data ? extractHerbeError(data) : `Herbe error ${res.status}: ${rawText.slice(0, 200)}`, status: res.status }
  }

  const errs = data?.errors
  if (Array.isArray(errs) && errs.length > 0) {
    const msgs = (errs as unknown[]).map(e => extractHerbeError(e))
    const fieldErrors = extractHerbeFieldErrors(errs)
    return { ok: false, error: msgs[0], errors: msgs, fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined, status: 422 }
  }

  const inner = (data?.data as Record<string, unknown> | undefined)?.[REGISTERS.activities]
  const record = Array.isArray(inner) ? (inner[0] as Record<string, unknown> | undefined) : undefined
  if (!record?.['SerNr']) {
    // Log the full response so we can see what ERP is actually returning — a
    // successful-looking 200 with no record or unparseable body is the exact
    // failure mode this check exists to surface.
    console.warn(`${label}: ERP returned 200 without a record. Body (${rawText.length} chars):`, rawText.slice(0, 1000))

    // Walk the response tree for @field/@code markers — HAL may nest the
    // offending field in several places, so try them all before giving up.
    const fieldErrors = extractHerbeFieldErrors(data)

    const rawErr = data?.error ?? data?.message ?? data?.errors
    if (rawErr) {
      return {
        ok: false,
        error: extractHerbeError(rawErr),
        fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined,
        status: 422,
      }
    }
    // No parseable error — surface whatever ERP did return so the user (and
    // logs) can see it. `null` here means JSON.parse failed, so include the
    // raw text instead.
    const body = data !== null ? JSON.stringify(data) : rawText
    const preview = body.trim().slice(0, 300) || '(empty)'
    return {
      ok: false,
      error: `Activity was not saved — a record-check rule likely rejected the ${opts.id ? 'update' : 'create'}. ERP response: ${preview}`,
      fieldErrors: fieldErrors.length > 0 ? fieldErrors : undefined,
      status: 422,
    }
  }

  return { ok: true, record }
}
