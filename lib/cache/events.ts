import { pool } from '@/lib/db'
import type { Activity } from '@/types'

export interface CachedEventRow {
  source: string
  sourceId: string
  accountId: string
  connectionId: string
  personCode: string
  date: string
  data: Record<string, unknown>
}

/**
 * Read cached events for given person codes and date range.
 * Optional connectionId filter scopes results to a single connection — used by
 * per-connection read paths where each connection decides cache-vs-live
 * independently.
 */
export async function getCachedEvents(
  accountId: string,
  personCodes: string[],
  dateFrom: string,
  dateTo: string,
  source = 'herbe',
  connectionId?: string,
): Promise<Activity[]> {
  if (connectionId === undefined) {
    const { rows } = await pool.query<{ data: Activity }>(
      `SELECT data FROM cached_events
       WHERE account_id = $1
         AND person_code = ANY($2)
         AND date BETWEEN $3 AND $4
         AND source = $5`,
      [accountId, personCodes, dateFrom, dateTo, source],
    )
    return rows.map(r => r.data)
  }
  const { rows } = await pool.query<{ data: Activity }>(
    `SELECT data FROM cached_events
     WHERE account_id = $1
       AND person_code = ANY($2)
       AND date BETWEEN $3 AND $4
       AND source = $5
       AND connection_id = $6`,
    [accountId, personCodes, dateFrom, dateTo, source, connectionId],
  )
  return rows.map(r => r.data)
}

/**
 * Upsert one or more cached events. Uses a multi-row INSERT ... ON CONFLICT.
 */
export async function upsertCachedEvents(events: CachedEventRow[]): Promise<void> {
  if (events.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let idx = 1

  for (const e of events) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, now())`)
    values.push(e.source, e.sourceId, e.accountId, e.connectionId, e.personCode, e.date, JSON.stringify(e.data))
    idx += 7
  }

  await pool.query(
    `INSERT INTO cached_events (source, source_id, account_id, connection_id, person_code, date, data, cached_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (account_id, source, source_id, person_code)
     DO UPDATE SET data = EXCLUDED.data, date = EXCLUDED.date, connection_id = EXCLUDED.connection_id, cached_at = now()`,
    values,
  )
}

/**
 * Delete cached events for a source within a date range.
 */
export async function deleteCachedEvents(
  accountId: string,
  source: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_events
     WHERE account_id = $1 AND source = $2 AND date BETWEEN $3 AND $4`,
    [accountId, source, dateFrom, dateTo],
  )
  return rowCount ?? 0
}

/**
 * Delete all cached events for a source (full nuke).
 */
export async function deleteCachedEventsBySource(
  accountId: string,
  source: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = $2`,
    [accountId, source],
  )
  return rowCount ?? 0
}

/**
 * Delete a single cached event by source ID (for write-through on delete).
 */
export async function deleteCachedEvent(
  accountId: string,
  source: string,
  sourceId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND source_id = $3`,
    [accountId, source, sourceId],
  )
}
