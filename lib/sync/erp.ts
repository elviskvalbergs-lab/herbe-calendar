import { herbeFetchWithSequence } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { parsePersons, mapHerbeRecord } from '@/lib/herbe/recordUtils'
import { getErpConnections } from '@/lib/accountConfig'
import type { ErpConnection } from '@/lib/accountConfig'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { getSyncState, updateSyncState } from '@/lib/cache/syncState'
import { pool } from '@/lib/db'

const SOURCE = 'herbe'
const BATCH_SIZE = 500
const FULL_SYNC_DAYS_BACK = 90
const FULL_SYNC_DAYS_FORWARD = 30

// ─── helpers ───────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fullSyncRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - FULL_SYNC_DAYS_BACK)
  const to = new Date(now)
  to.setDate(to.getDate() + FULL_SYNC_DAYS_FORWARD)
  return { dateFrom: formatDate(from), dateTo: formatDate(to) }
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
 * Deletes all cached_events for this connection, then does full fetch
 * and inserts fresh data.
 */
async function fullReconciliation(
  accountId: string,
  conn: ErpConnection,
): Promise<{ events: number; error?: string }> {
  try {
    // Delete all cached events for this connection
    await pool.query(
      `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
      [accountId, SOURCE, conn.id],
    )

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

    await batchUpsert(rows)

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
 * Deletes cache for a date range, fetches fresh from all ERP connections
 * for that account, upserts results.
 */
export async function forceSyncRange(
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ eventsUpserted: number }> {
  // Delete existing cache for this range
  await pool.query(
    `DELETE FROM cached_events WHERE account_id = $1 AND source = $2 AND date BETWEEN $3 AND $4`,
    [accountId, SOURCE, dateFrom, dateTo],
  )

  const connections = await getErpConnections(accountId)
  let total = 0

  for (const conn of connections) {
    const { records } = await herbeFetchWithSequence(
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

    await batchUpsert(rows)
    total += rows.length
  }

  return { eventsUpserted: total }
}
