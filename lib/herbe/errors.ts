const HERBE_ERROR_CODES: Record<string, string> = {
  '1058': 'Mandatory field missing',
  '1547': 'Time conflict — an activity already exists at this time for this person',
}

export function extractHerbeError(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map(extractHerbeError).filter(Boolean).join('; ')
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    // Standard ERP uses @-prefixed keys; also check plain keys
    const code = String(o['@code'] ?? o.code ?? '')
    const mapped = code ? HERBE_ERROR_CODES[code] : undefined
    const rawMsg = o['@description'] ?? o.message ?? o.text ?? o.msg ?? o.description ?? o.Error ?? o.error
    const msg = mapped ?? (rawMsg ? String(rawMsg).trim() : undefined)
    const field = o['@field'] ?? o.field
    if (msg) return field ? `${field}: ${msg}` : msg
    // Include field/code context if available
    const parts: string[] = []
    if (field) parts.push(`field: ${field}`)
    if (code) parts.push(`code: ${code}`)
    if (o.vc) parts.push(`vc: ${o.vc}`)
    return parts.length ? parts.join(', ') : JSON.stringify(e)
  }
  return String(e)
}
