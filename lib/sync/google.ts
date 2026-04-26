import {
  mapGoogleEvent,
  fetchGoogleEventsForPerson,
  fetchPerUserGoogleEvents,
  type GoogleCalendarEvent,
} from '@/lib/googleUtils'
import { upsertCachedEvents, type CachedEventRow } from '@/lib/cache/events'
import { getGoogleConfig } from '@/lib/google/client'
import { updateSyncState } from '@/lib/cache/syncState'
import { listAccountPersons } from '@/lib/cache/accountPersons'
import { fullSyncRange } from '@/lib/sync/erp'
import { withTimeout } from '@/lib/sync/withTimeout'
import { pool } from '@/lib/db'

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

// ─── syncAllGoogle (exported) ─────────────────────────────────────────

const BATCH_SIZE = 500

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

async function syncAccountGoogleDomainWide(
  accountId: string,
  mode: SyncMode,
  people: { code: string; email: string }[],
): Promise<{ events: number; error?: string }> {
  const config = await getGoogleConfig(accountId)
  if (!config) return { events: 0 }

  try {
    await updateSyncState(accountId, 'google', '', { syncStatus: 'syncing' })
    const { dateFrom, dateTo } = fullSyncRange()
    const rows: CachedEventRow[] = []

    // Fetch in parallel with concurrency limit
    const CONCURRENCY = 10
    for (let i = 0; i < people.length; i += CONCURRENCY) {
      const batch = people.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async ({ code, email }) => {
          const events = await fetchGoogleEventsForPerson(email, accountId, dateFrom, dateTo)
          if (!events) return []
          return events.flatMap(ev => buildGoogleCacheRows(ev, {
            source: 'google',
            accountId,
            personCode: code,
            personEmail: email,
            sessionEmail: email,
          }))
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled') rows.push(...r.value)
      }
    }
    if (mode === 'full') {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `DELETE FROM cached_events WHERE account_id = $1 AND source = 'google'`,
          [accountId],
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
    } else {
      await batchUpsert(rows)
    }
    await updateSyncState(accountId, 'google', '', {
      syncCursor: null,
      syncStatus: 'idle',
      errorMessage: null,
      isFullSync: true,
    })
    return { events: rows.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await updateSyncState(accountId, 'google', '', { syncStatus: 'error', errorMessage: msg }).catch(() => {})
    return { events: 0, error: msg }
  }
}

interface TokenRow { id: string; user_email: string; google_email: string }

async function syncAccountGoogleUser(
  accountId: string,
  mode: SyncMode,
  emailToCode: Map<string, string>,
): Promise<{ connections: number; events: number; errors: string[] }> {
  const { rows: tokens } = await pool.query<TokenRow>(
    `SELECT id, user_email, google_email FROM user_google_tokens WHERE account_id = $1`,
    [accountId],
  )

  const tokenResults = await Promise.allSettled(
    tokens.map(token => withTimeout(
      (async () => {
      let connections = 0
      let events = 0
      const errors: string[] = []

      const personCode = emailToCode.get(token.user_email.toLowerCase())
      if (!personCode) {
        errors.push(`${accountId}/${token.user_email}: no person_code — skipped`)
        return { connections, events, errors }
      }

      try {
        await updateSyncState(accountId, 'google-user', token.id, { syncStatus: 'syncing' })
        const { dateFrom, dateTo } = fullSyncRange()
        const { events: fetched, warnings } = await fetchPerUserGoogleEvents(token.user_email, accountId, dateFrom, dateTo)
        const rows: CachedEventRow[] = []
        for (const item of fetched) {
          if (item.tokenId !== token.id) continue
          rows.push(...buildGoogleCacheRows(item.event, {
            source: 'google-user',
            accountId,
            personCode,
            personEmail: token.user_email,
            sessionEmail: token.user_email,
            tokenId: token.id,
            calendarId: item.calendarId,
            calendarName: item.calendarName,
            accountEmail: item.accountEmail,
            color: item.color,
          }))
        }
        if (mode === 'full') {
          const client = await pool.connect()
          try {
            await client.query('BEGIN')
            await client.query(
              `DELETE FROM cached_events WHERE account_id = $1 AND source = 'google-user' AND connection_id = $2`,
              [accountId, token.id],
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
        } else {
          await batchUpsert(rows)
        }
        await updateSyncState(accountId, 'google-user', token.id, {
          syncCursor: null,
          syncStatus: 'idle',
          errorMessage: warnings.length ? warnings.join('; ').slice(0, 500) : null,
          isFullSync: true,
        })
        connections++
        events += rows.length
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${accountId}/${token.id}: ${msg}`)
        await updateSyncState(accountId, 'google-user', token.id, { syncStatus: 'error', errorMessage: msg }).catch(() => {})
      }

      return { connections, events, errors }
      })(),
      60_000,
      `google-user:${accountId}/${token.id}`,
    ))
  )

  let connections = 0
  let events = 0
  const errors: string[] = []
  for (const r of tokenResults) {
    if (r.status === 'fulfilled') {
      connections += r.value.connections
      events += r.value.events
      errors.push(...r.value.errors)
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.error('[sync/google-user] timeout:', accountId, reason)
      errors.push(`google-user/${accountId}: ${reason}`)
    }
  }
  return { connections, events, errors }
}

/**
 * Sync Google events for every active account. Runs domain-wide ('google')
 * and per-user OAuth ('google-user') flows in sequence.
 */
export async function syncAllGoogle(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, connections: 0, events: 0, errors: [] }
  const { rows: accounts } = await pool.query<{ id: string }>(
    `SELECT id FROM tenant_accounts WHERE suspended_at IS NULL`,
  )
  result.accounts = accounts.length

  const accountResults = await Promise.allSettled(
    accounts.map(async (account) => {
      const people = await listAccountPersons(account.id)
      const emailToCode = new Map(people.map(p => [p.email.toLowerCase(), p.code]))
      let dw: { events: number; error?: string }
      try {
        dw = await withTimeout(
          syncAccountGoogleDomainWide(account.id, mode, people),
          60_000,
          `google:${account.id}`,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[sync/google] timeout:', account.id, msg)
        dw = { events: 0, error: msg }
      }
      const pu = await syncAccountGoogleUser(account.id, mode, emailToCode)
      return { dw, pu }
    })
  )
  for (const r of accountResults) {
    if (r.status === 'fulfilled') {
      const { dw, pu } = r.value
      if (dw.events > 0) result.connections++
      result.events += dw.events
      if (dw.error) result.errors.push(`google: ${dw.error}`)
      result.connections += pu.connections
      result.events += pu.events
      result.errors.push(...pu.errors)
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.error('[sync/google] account rejected:', reason)
      result.errors.push(`google: ${reason}`)
    }
  }
  return result
}
