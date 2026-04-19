import { herbeFetchWithSequence } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { parsePersons, mapHerbeRecord } from '@/lib/herbe/recordUtils'
import { getErpConnections } from '@/lib/accountConfig'
import type { ErpConnection } from '@/lib/accountConfig'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { getSyncState, updateSyncState } from '@/lib/cache/syncState'
import { pool } from '@/lib/db'
import { startOfMonth, endOfMonth, subDays, addDays, format } from 'date-fns'

const SOURCE = 'herbe'
const BATCH_SIZE = 500
const FULL_SYNC_DAYS_BACK = 90
const FULL_SYNC_DAYS_FORWARD = 30

// ─── helpers ───────────────────────────────────────────────────────────

/**
 * Compute the sync window, rounded out to whole months so a month view never
 * straddles the boundary. From = start of the month containing (today - 90d),
 * To = end of the month containing (today + 30d).
 */
export function fullSyncRange(now: Date = new Date()): { dateFrom: string; dateTo: string } {
  const from = startOfMonth(subDays(now, FULL_SYNC_DAYS_BACK))
  const to = endOfMonth(addDays(now, FULL_SYNC_DAYS_FORWARD))
  return { dateFrom: format(from, 'yyyy-MM-dd'), dateTo: format(to, 'yyyy-MM-dd') }
}

/**
 * Whether a requested date range is fully inside the current sync window.
 * Reads must fall back to a live ERP fetch when this returns false, otherwise
 * the portion of the range outside the window silently returns no events.
 */
export function isRangeCovered(dateFrom: string, dateTo: string, now: Date = new Date()): boolean {
  const { dateFrom: winFrom, dateTo: winTo } = fullSyncRange(now)
  return dateFrom >= winFrom && dateTo <= winTo
}

// ─── buildCacheRows (exported, unit-testable) ──────────────────────────

/**
 * Build CachedEventRow[] from a raw ERP record.
 * One row per MainPerson + one per CCPerson (excluding duplicates).
 * Skips non-calendar records: TodoFlag != '0' and TodoFlag != ''.
 */
export function buildCacheRows(
  record: Record<string, unknown>,
  accountId: string,
  connectionId: string,
  connectionName: string,
): CachedEventRow[] {
  const todoFlag = String(record['TodoFlag'] ?? '0')
  if (todoFlag !== '0' && todoFlag !== '') return []

  const { main, cc } = parsePersons(record)
  const mainSet = new Set(main)
  const allPersons = [...main, ...cc.filter(p => !mainSet.has(p))]

  return allPersons.map(personCode => {
    const activity = mapHerbeRecord(record, personCode, {
      includePrivateFields: true,
      erpConnectionId: connectionId,
      erpConnectionName: connectionName || undefined,
    })
    return {
      source: SOURCE,
      sourceId: String(record['SerNr'] ?? ''),
      accountId,
      connectionId,
      personCode,
      date: String(record['TransDate'] ?? ''),
      data: activity as unknown as Record<string, unknown>,
    }
  })
}

// ─── batch upsert helper ───────────────────────────────────────────────

async function batchUpsert(rows: CachedEventRow[]): Promise<number> {
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    await upsertCachedEvents(chunk)
    total += chunk.length
  }
  return total
}

// ─── syncConnection (internal) ─────────────────────────────────────────

/**
 * Incremental sync for one connection.
 * If sync_state has a cursor, uses `updates_after={cursor}`.
 * Otherwise does full fetch (90 days back + 30 days forward).
 */
async function syncConnection(
  accountId: string,
  conn: ErpConnection,
): Promise<{ events: number; error?: string }> {
  try {
    const state = await getSyncState(accountId, SOURCE, conn.id)
    const cursor = state?.syncCursor ?? null

    let params: Record<string, string>
    if (cursor) {
      // Incremental: fetch all changed records since last sequence
      params = { updates_after: cursor }
    } else {
      // No cursor — full fetch with date range
      const { dateFrom, dateTo } = fullSyncRange()
      params = { sort: 'TransDate', range: `${dateFrom}:${dateTo}` }
    }

    const { records, sequence } = await herbeFetchWithSequence(
      REGISTERS.activities,
      params,
      1000,
      conn,
    )

    const rows: CachedEventRow[] = []
    for (const raw of records) {
      const r = raw as Record<string, unknown>
      rows.push(...buildCacheRows(r, accountId, conn.id, conn.name))
    }

    await batchUpsert(rows)

    await updateSyncState(accountId, SOURCE, conn.id, {
      syncCursor: sequence ?? cursor,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: !cursor,
    })

    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, SOURCE, conn.id, {
      syncStatus: 'error',
      errorMessage: msg,
    }).catch(() => {})
    return { events: 0, error: msg }
  }
}

// ─── fullReconciliation (internal) ─────────────────────────────────────

/**
 * Fetches fresh data for this connection, then atomically deletes the old
 * cache and inserts the new data inside a transaction to prevent data loss.
 */
async function fullReconciliation(
  accountId: string,
  conn: ErpConnection,
): Promise<{ events: number; error?: string }> {
  try {
    // Fetch FIRST, before deleting anything
    const { dateFrom, dateTo } = fullSyncRange()
    const { records, sequence } = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn,
    )

    const rows: CachedEventRow[] = []
    for (const raw of records) {
      const r = raw as Record<string, unknown>
      rows.push(...buildCacheRows(r, accountId, conn.id, conn.name))
    }

    // Atomic delete + insert inside a transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
        [accountId, SOURCE, conn.id],
      )
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await upsertCachedEvents(rows.slice(i, i + BATCH_SIZE), client)
      }
      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {})
      throw txErr
    } finally {
      client.release()
    }

    await updateSyncState(accountId, SOURCE, conn.id, {
      syncCursor: sequence,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })

    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, SOURCE, conn.id, {
      syncStatus: 'error',
      errorMessage: msg,
    }).catch(() => {})
    return { events: 0, error: msg }
  }
}

// ─── syncAllErp (exported) ─────────────────────────────────────────────

export type SyncMode = 'incremental' | 'full'

export interface SyncResult {
  accounts: number
  connections: number
  events: number
  errors: string[]
}

/**
 * Main entry point. Queries all active tenant_accounts, gets ERP connections
 * for each, then either does incremental sync or full reconciliation per
 * connection.
 */
export async function syncAllErp(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, connections: 0, events: 0, errors: [] }

  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )
  result.accounts = accounts.length

  for (const account of accounts) {
    let connections: ErpConnection[]
    try {
      connections = await getErpConnections(account.id)
    } catch (e) {
      result.errors.push(`Account ${account.id}: ${String(e)}`)
      continue
    }

    for (const conn of connections) {
      result.connections++
      const syncFn = mode === 'full' ? fullReconciliation : syncConnection
      const { events, error } = await syncFn(account.id, conn)
      result.events += events
      if (error) {
        result.errors.push(`${account.id}/${conn.name}: ${error}`)
      }
    }
  }

  return result
}

// ─── forceSyncRange (exported) ─────────────────────────────────────────

/**
 * Fetches fresh data from all ERP connections for the given date range,
 * then atomically deletes the old cache and inserts new data in a transaction.
 */
export async function forceSyncRange(
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ eventsUpserted: number }> {
  const connections = await getErpConnections(accountId)
  const allRows: CachedEventRow[] = []

  for (const conn of connections) {
    const { records } = await herbeFetchWithSequence(
      REGISTERS.activities,
      { sort: 'TransDate', range: `${dateFrom}:${dateTo}` },
      1000,
      conn,
    )
    for (const raw of records) {
      const r = raw as Record<string, unknown>
      allRows.push(...buildCacheRows(r, accountId, conn.id, conn.name))
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND date BETWEEN $3 AND $4`,
      [accountId, SOURCE, dateFrom, dateTo],
    )
    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      await upsertCachedEvents(allRows.slice(i, i + BATCH_SIZE), client)
    }
    await client.query('COMMIT')
  } catch (txErr) {
    await client.query('ROLLBACK').catch(() => {})
    throw txErr
  } finally {
    client.release()
  }

  return { eventsUpserted: allRows.length }
}
