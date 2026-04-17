import { mapOutlookEvent, fetchOutlookEventsForPerson, type OutlookEvent } from '@/lib/outlookUtils'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { getAzureConfig } from '@/lib/accountConfig'
import { updateSyncState } from '@/lib/cache/syncState'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { fullSyncRange } from '@/lib/sync/erp'
import { pool } from '@/lib/db'

const SOURCE = 'outlook'
const BATCH_SIZE = 500

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

// ─── syncAllOutlook (exported) ─────────────────────────────────────────

export type SyncMode = 'incremental' | 'full'

export interface SyncResult {
  accounts: number
  connections: number
  events: number
  errors: string[]
}

async function batchUpsert(rows: CachedEventRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await upsertCachedEvents(rows.slice(i, i + BATCH_SIZE))
  }
}

async function syncAccountOutlook(
  accountId: string,
  mode: SyncMode,
): Promise<{ events: number; error?: string }> {
  const azure = await getAzureConfig(accountId)
  if (!azure) return { events: 0 }

  const { dateFrom, dateTo } = fullSyncRange()
  const sessionEmail = azure.senderEmail

  try {
    await updateSyncState(accountId, SOURCE, '', { syncStatus: 'syncing' })

    if (mode === 'full') {
      await pool.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND source = $2`,
        [accountId, SOURCE],
      )
    }

    const people = await listAccountPersons(accountId)
    const rows: CachedEventRow[] = []
    for (const { code, email } of people) {
      const events = await fetchOutlookEventsForPerson(email, accountId, dateFrom, dateTo, sessionEmail)
      if (!events) continue
      for (const ev of events) {
        rows.push(...buildOutlookCacheRows(ev, accountId, code, sessionEmail))
      }
    }

    await batchUpsert(rows)

    await updateSyncState(accountId, SOURCE, '', {
      syncCursor: null,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })
    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, SOURCE, '', { syncStatus: 'error', errorMessage: msg }).catch(() => {})
    return { events: 0, error: msg }
  }
}

/**
 * Sync Outlook events for every active account with Azure configured.
 * `mode='full'` deletes the account's outlook rows first; `'incremental'`
 * just upserts (v1 has no delta, so both modes fetch the same window).
 */
export async function syncAllOutlook(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, connections: 0, events: 0, errors: [] }
  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )
  result.accounts = accounts.length

  for (const account of accounts) {
    const { events, error } = await syncAccountOutlook(account.id, mode)
    if (events > 0) result.connections++
    result.events += events
    if (error) result.errors.push(`${account.id}: ${error}`)
  }
  return result
}
