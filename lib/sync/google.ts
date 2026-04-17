import { mapGoogleEvent, type GoogleCalendarEvent } from '@/lib/googleUtils'
import type { CachedEventRow } from '@/lib/cache/events'

export type GoogleSource = 'google' | 'google-user'

export interface BuildOpts {
  source: GoogleSource
  accountId: string
  personCode: string
  personEmail: string | null
  sessionEmail: string
  /** Required when source='google-user'. */
  tokenId?: string
  calendarId?: string
  calendarName?: string
  accountEmail?: string
  color?: string
}

/**
 * Build one CachedEventRow from a Google event. Pure, no I/O.
 * Accepts both the domain-wide 'google' source and the per-user
 * 'google-user' source; the latter stores the user_google_tokens.id
 * UUID as connection_id.
 */
export function buildGoogleCacheRows(
  ev: GoogleCalendarEvent,
  opts: BuildOpts,
): CachedEventRow[] {
  const start = ev.start?.dateTime ?? ev.start?.date ?? ''
  const date = start.slice(0, 10)
  if (!ev.id || !date) return []

  const activity = mapGoogleEvent(ev, opts.personCode, opts.sessionEmail, {
    googleCalendarId: opts.calendarId,
    googleCalendarName: opts.calendarName,
    googleAccountEmail: opts.accountEmail,
    googleTokenId: opts.tokenId,
    icsColor: opts.color,
  }, opts.personEmail ?? null)

  return [{
    source: opts.source,
    sourceId: ev.id,
    accountId: opts.accountId,
    connectionId: opts.tokenId ?? '',
    personCode: opts.personCode,
    date,
    data: activity as unknown as Record<string, unknown>,
  }]
}
