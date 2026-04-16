import { pool } from '@/lib/db'

/**
 * True iff at least one connection for the account has completed a full
 * reconciliation sync for the given source. Read-side cache lookups must
 * fall back to live when this is false — the cache may contain only a
 * handful of write-through rows and would otherwise hide the rest.
 */
export async function hasCompletedInitialSync(
  accountId: string,
  source = 'herbe',
): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM sync_state
       WHERE account_id = $1 AND source = $2 AND last_full_sync_at IS NOT NULL
     ) AS ok`,
    [accountId, source],
  )
  return rows[0]?.ok ?? false
}

export interface SyncState {
  accountId: string
  source: string
  connectionId: string
  syncCursor: string | null
  lastSyncAt: Date | null
  lastFullSyncAt: Date | null
  syncStatus: string
  errorMessage: string | null
}

/**
 * Get sync state for a specific source+connection.
 */
export async function getSyncState(
  accountId: string,
  source: string,
  connectionId = '',
): Promise<SyncState | null> {
  const { rows } = await pool.query<{
    account_id: string
    source: string
    connection_id: string
    sync_cursor: string | null
    last_sync_at: Date | null
    last_full_sync_at: Date | null
    sync_status: string
    error_message: string | null
  }>(
    `SELECT * FROM sync_state
     WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
    [accountId, source, connectionId],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    accountId: r.account_id,
    source: r.source,
    connectionId: r.connection_id,
    syncCursor: r.sync_cursor,
    lastSyncAt: r.last_sync_at,
    lastFullSyncAt: r.last_full_sync_at,
    syncStatus: r.sync_status,
    errorMessage: r.error_message,
  }
}

/**
 * Get all sync states for an account (for status display).
 */
export async function getAllSyncStates(accountId: string): Promise<SyncState[]> {
  const { rows } = await pool.query(
    `SELECT * FROM sync_state WHERE account_id = $1 ORDER BY source, connection_id`,
    [accountId],
  )
  return rows.map((r: any) => ({
    accountId: r.account_id,
    source: r.source,
    connectionId: r.connection_id,
    syncCursor: r.sync_cursor,
    lastSyncAt: r.last_sync_at,
    lastFullSyncAt: r.last_full_sync_at,
    syncStatus: r.sync_status,
    errorMessage: r.error_message,
  }))
}

/**
 * Upsert sync state after a sync run.
 */
export async function updateSyncState(
  accountId: string,
  source: string,
  connectionId: string,
  update: {
    syncCursor?: string | null
    syncStatus?: string
    errorMessage?: string | null
    isFullSync?: boolean
  },
): Promise<void> {
  const now = new Date()
  await pool.query(
    `INSERT INTO sync_state (account_id, source, connection_id, sync_cursor, last_sync_at, last_full_sync_at, sync_status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (account_id, source, connection_id)
     DO UPDATE SET
       sync_cursor = COALESCE($4, sync_state.sync_cursor),
       last_sync_at = $5,
       last_full_sync_at = CASE WHEN $9 THEN $5 ELSE sync_state.last_full_sync_at END,
       sync_status = $7,
       error_message = $8`,
    [
      accountId,
      source,
      connectionId,
      update.syncCursor ?? null,
      now,
      update.isFullSync ? now : null,
      update.syncStatus ?? 'idle',
      update.errorMessage ?? null,
      update.isFullSync ?? false,
    ],
  )
}

/**
 * Reset sync state (clear cursor, forcing next sync to be a full sync).
 */
export async function resetSyncState(
  accountId: string,
  source: string,
  connectionId?: string,
): Promise<void> {
  if (connectionId !== undefined) {
    await pool.query(
      `DELETE FROM sync_state WHERE account_id = $1 AND source = $2 AND connection_id = $3`,
      [accountId, source, connectionId],
    )
  } else {
    await pool.query(
      `DELETE FROM sync_state WHERE account_id = $1 AND source = $2`,
      [accountId, source],
    )
  }
}
