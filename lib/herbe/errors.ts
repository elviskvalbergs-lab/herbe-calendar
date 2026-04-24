const HERBE_ERROR_CODES: Record<string, string> = {
  '1058': 'Mandatory field missing',
  '1547': 'Time conflict — an activity already exists at this time for this person',
}

// Human-friendly labels for the HAL field names that surface in errors.
// Add entries as new fields appear in real failures.
const HERBE_FIELD_LABELS: Record<string, string> = {
  ActType: 'Activity type',
  MainPersons: 'Person(s)',
  CCPersons: 'CC person(s)',
  Comment: 'Title',
  TransDate: 'Date',
  PRCode: 'Project',
  CUCode: 'Customer',
  TimeFromHHMM: 'Start time',
  TimeToHHMM: 'End time',
  Text: 'Additional text',
}

function labelForField(field: unknown): string | undefined {
  if (!field) return undefined
  const raw = String(field)
  return HERBE_FIELD_LABELS[raw] ?? raw
}

export function extractHerbeError(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map(extractHerbeError).filter(Boolean).join('; ')
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    // Standard ERP uses @-prefixed keys; also check plain keys
    const code = String(o['@code'] ?? o.code ?? '')
    const rawMsg = o['@description'] ?? o.message ?? o.text ?? o.msg ?? o.description ?? o.Error ?? o.error
    const field = o['@field'] ?? o.field
    const label = labelForField(field)

    // Specific-code formats — read more naturally than "<Field>: <generic msg>"
    if (code === '1058' && label) return `${label} is required`

    const mapped = code ? HERBE_ERROR_CODES[code] : undefined
    const msg = mapped ?? (rawMsg ? String(rawMsg).trim() : undefined)
    if (msg) return label ? `${label}: ${msg}` : msg

    // Fall-through: surface whatever identifying bits we have
    const parts: string[] = []
    if (label) parts.push(`field: ${label}`)
    if (code) parts.push(`code: ${code}`)
    if (o.vc) parts.push(`vc: ${o.vc}`)
    return parts.length ? parts.join(', ') : JSON.stringify(e)
  }
  return String(e)
}

/**
 * Extract a structured list of {field, code, label} triples from a Herbe
 * errors array. Lets the UI highlight or focus specific fields rather than
 * just showing a text banner.
 */
export interface HerbeFieldError {
  field: string        // raw HAL field name, e.g. "ActType"
  label: string        // friendly label, e.g. "Activity type"
  code: string
}

export function extractHerbeFieldErrors(errs: unknown): HerbeFieldError[] {
  if (!Array.isArray(errs)) return []
  const out: HerbeFieldError[] = []
  for (const e of errs) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const field = o['@field'] ?? o.field
    if (!field) continue
    const raw = String(field)
    out.push({
      field: raw,
      label: HERBE_FIELD_LABELS[raw] ?? raw,
      code: String(o['@code'] ?? o.code ?? ''),
    })
  }
  return out
}
