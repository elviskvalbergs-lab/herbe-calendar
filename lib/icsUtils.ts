import { pool } from '@/lib/db'
import { fetchIcsEvents } from '@/lib/icsParser'

export interface IcsCalendarEvent extends Record<string, unknown> {
  icsColor?: string
  icsCalendarName?: string
}

export interface IcsResult {
  events: IcsCalendarEvent[]
  warnings: string[]
}

/**
 * Fetch ICS calendar events for a person code, scoped to an account.
 * Queries user_calendars for ICS feeds and fetches/parses events from each.
 *
 * @param userEmail    The owning user's email (used to look up their calendars)
 * @param personCode   The person whose calendar feeds are fetched
 * @param accountId    Account scope — always required to prevent cross-tenant leaks
 * @param dateFrom     ISO date string (inclusive)
 * @param dateTo       ISO date string (inclusive)
 * @param bustCache    Pass true to bypass the in-memory ICS cache (manual refresh)
 */
export async function fetchIcsForPerson(
  userEmail: string,
  personCode: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  bustCache = false,
  timezone?: string,
): Promise<IcsResult> {
  const { rows: icsRows } = await pool.query(
    'SELECT ics_url, color, name FROM user_calendars WHERE user_email = $1 AND target_person_code = $2 AND account_id = $3',
    [userEmail, personCode, accountId],
  )

  if (icsRows.length === 0) return { events: [], warnings: [] }

  const allEvents: IcsCalendarEvent[] = []
  const warnings: string[] = []

  await Promise.all(
    icsRows.map(async (row) => {
      try {
        const result = await fetchIcsEvents(row.ics_url as string, personCode, dateFrom, dateTo, bustCache, timezone)
        const events = result.events.map((ev: Record<string, unknown>) => ({
          ...ev,
          ...(row.color ? { icsColor: row.color as string } : {}),
          icsCalendarName: row.name as string,
        }))
        allEvents.push(...events)
        if (result.error) warnings.push(`ICS "${row.name}": ${result.error}`)
      } catch {
        // ICS parse failures are non-fatal
      }
    }),
  )

  return { events: allEvents, warnings }
}
