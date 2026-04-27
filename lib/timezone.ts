const FALLBACK_TZ = 'Europe/Riga'

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: tz })
      .resolvedOptions().timeZone
    // Reject inputs that differ from the resolved name only by case
    // (e.g. "europe/riga" -> "Europe/Riga"). Allow IANA alias resolution
    // (e.g. "Asia/Kolkata" -> "Asia/Calcutta") to pass through unchanged.
    if (resolved !== tz && resolved.toLowerCase() === tz.toLowerCase()) return false
    return true
  } catch {
    return false
  }
}

export function formatInTz(date: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: safeTz }).format(date)
}

/**
 * Build an ISO 8601 string from wall-clock parts in a target TZ.
 * Returns YYYY-MM-DDTHH:mm:ss±HH:MM.
 */
export function toIsoInTz(dateYmd: string, timeHm: string, tz: string): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  const [y, m, d] = dateYmd.split('-').map(Number)
  const [hh, mm] = timeHm.split(':').map(Number)
  const utc = Date.UTC(y, m - 1, d, hh, mm, 0)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utc)).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  const offsetMinutes = Math.round((asUtc - utc) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMinutes)
  const oh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const om = String(absMin % 60).padStart(2, '0')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateYmd}T${pad(hh)}:${pad(mm)}:00${sign}${oh}:${om}`
}

export function bucketDateInTz(date: Date, tz: string): string {
  const safeTz = isValidTimezone(tz) ? tz : FALLBACK_TZ
  return new Intl.DateTimeFormat('sv-SE', { timeZone: safeTz }).format(date) // YYYY-MM-DD
}

/**
 * Resolve the timezone for a viewer/member. Member's explicit choice wins;
 * otherwise fall back to the account's default timezone, then to Europe/Riga.
 */
export function resolveMemberTimezone(input: { memberTz: string | null; accountTz: string | null }): string {
  if (isValidTimezone(input.memberTz)) return input.memberTz
  if (isValidTimezone(input.accountTz)) return input.accountTz
  return FALLBACK_TZ
}

/**
 * Resolve the timezone of an external source connection (Outlook mailbox,
 * Google calendar, ERP host, Calendly account). The connection's declared
 * timezone wins; otherwise fall back to the account's default timezone,
 * then to Europe/Riga.
 */
export function resolveSourceTimezone(input: { sourceTz: string | null; accountTz: string | null }): string {
  if (isValidTimezone(input.sourceTz)) return input.sourceTz
  if (isValidTimezone(input.accountTz)) return input.accountTz
  return FALLBACK_TZ
}
