import { mapOutlookEvent, type OutlookEvent } from '@/lib/outlookUtils'
import type { CachedEventRow } from '@/lib/cache/events'

const SOURCE = 'outlook'

/**
 * Convert one Graph event into a CachedEventRow for a specific person.
 * The sessionEmail is used for the isOrganizer flag baked into the Activity.
 */
export function buildOutlookCacheRows(
  ev: OutlookEvent,
  accountId: string,
  personCode: string,
  sessionEmail: string,
): CachedEventRow[] {
  const date = (ev.start?.dateTime ?? '').slice(0, 10)
  if (!date || !ev.id) return []
  const activity = mapOutlookEvent(ev, personCode, sessionEmail)
  return [{
    source: SOURCE,
    sourceId: ev.id,
    accountId,
    connectionId: '',
    personCode,
    date,
    data: activity as unknown as Record<string, unknown>,
  }]
}
