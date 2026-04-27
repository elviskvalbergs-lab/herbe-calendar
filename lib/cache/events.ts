import { pool } from '@/lib/db'
import type { Activity } from '@/types'
import { bucketDateInTz, toIsoInTz, isValidTimezone } from '@/lib/timezone'

export interface CachedEventRow {
  source: string
  sourceId: string
  accountId: string
  connectionId: string
  personCode: string
  date: string
  data: Record<string, unknown>
}

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + days * 86400000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Re-bucket cached rows to the viewer's TZ. Events were stored with `date` in
 * the source's wall-clock TZ; when the viewer is in a different TZ, an event
 * near midnight may belong on a different date for them. We widen the SQL
 * range by ±1 day, then keep only rows whose viewer-TZ date falls in the
 * caller's [dateFrom, dateTo] range.
 *
 * Source TZ is unknown per event (not stored), so we assume the account's
 * default TZ — accurate for single-TZ accounts, best-effort for mixed setups.
 */
function rebucketRows(
  rows: { data: Activity }[],
  dateFrom: string,
  dateTo: string,
  sourceTz: string,
  viewerTz: string,
): Activity[] {
  if (sourceTz === viewerTz) return rows.map(r => r.data)
  const out: Activity[] = []
  for (const r of rows) {
    const a = r.data
    const date = (a as { date?: string }).date
    const timeFrom = (a as { timeFrom?: string }).timeFrom
    if (!date || !timeFrom) {
      out.push(a)
      continue
    }
    try {
      const iso = toIsoInTz(date, timeFrom, sourceTz)
      const viewerDate = bucketDateInTz(new Date(iso), viewerTz)
      if (viewerDate >= dateFrom && viewerDate <= dateTo) {
        out.push({ ...a, date: viewerDate })
      }
    } catch {
      out.push(a)
    }
  }
  return out
}

/**
 * Read cached events for given person codes and date range.
 * Optional connectionId filter scopes results to a single connection — used by
 * per-connection read paths where each connection decides cache-vs-live
 * independently.
 *
 * When viewerTimezone differs from sourceTimezone, the read range is widened
 * by ±1 day and rows are re-bucketed in the viewer's TZ before returning.
 */
export async function getCachedEvents(
  accountId: string,
  personCodes: string[],
  dateFrom: string,
  dateTo: string,
  source = 'herbe',
  connectionId?: string,
  opts: { viewerTimezone?: string; sourceTimezone?: string } = {},
): Promise<Activity[]> {
  const viewerTz = isValidTimezone(opts.viewerTimezone) ? opts.viewerTimezone : null
  const sourceTz = isValidTimezone(opts.sourceTimezone) ? opts.sourceTimezone : null
  const widen = viewerTz !== null && sourceTz !== null && viewerTz !== sourceTz
  const queryFrom = widen ? shiftDate(dateFrom, -1) : dateFrom
  const queryTo = widen ? shiftDate(dateTo, 1) : dateTo

  if (connectionId === undefined) {
    const { rows } = await pool.query<{ data: Activity }>(
      `SELECT data FROM cached_events
       WHERE account_id = $1
         AND person_code = ANY($2)
         AND date BETWEEN $3 AND $4
         AND source = $5`,
      [accountId, personCodes, queryFrom, queryTo, source],
    )
    return widen ? rebucketRows(rows, dateFrom, dateTo, sourceTz!, viewerTz!) : rows.map(r => r.data)
  }
  const { rows } = await pool.query<{ data: Activity }>(
    `SELECT data FROM cached_events
     WHERE account_id = $1
       AND person_code = ANY($2)
       AND date BETWEEN $3 AND $4
       AND source = $5
       AND connection_id = $6`,
    [accountId, personCodes, queryFrom, queryTo, source, connectionId],
  )
  return widen ? rebucketRows(rows, dateFrom, dateTo, sourceTz!, viewerTz!) : rows.map(r => r.data)
}

/**
 * Upsert one or more cached events. Uses a multi-row INSERT ... ON CONFLICT.
 * Accepts an optional queryable (pool or transaction client) for use inside transactions.
 */
export async function upsertCachedEvents(
  events: CachedEventRow[],
  queryable: { query: (...args: any[]) => Promise<any> } = pool,
): Promise<void> {
  if (events.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let idx = 1

  for (const e of events) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, now())`)
    values.push(e.source, e.sourceId, e.accountId, e.connectionId, e.personCode, e.date, JSON.stringify(e.data))
    idx += 7
  }

  await queryable.query(
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
