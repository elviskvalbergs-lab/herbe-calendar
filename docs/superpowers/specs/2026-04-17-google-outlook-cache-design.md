# Google & Outlook Cache Layer — Design Spec

## Goal

Extend the existing ERP cache layer to also cover Outlook (Microsoft Graph) and Google Calendar events. Today these are re-fetched live on every page load, which is the dominant cost after ERP was cached. Caching them brings calendar navigation from ~hundreds of ms of third-party HTTP work down to a single local DB read.

The design reuses the `cached_events` and `sync_state` tables as-is, extends the existing Vercel cron to include Outlook and Google sources, and adds write-through on the existing Google/Outlook mutation routes.

## Non-goals

- No delta/deltaLink or `syncToken` support in v1. Sync is always a time-bounded full pull over the same whole-month window used for ERP. Delta can land per-provider later without schema changes.
- No webhooks/push subscriptions. Polling via the existing daily cron only. We accept up-to-one-day staleness for events created directly in Gmail/Outlook; write-through covers the in-app edit path.
- No new UI. The admin `/admin/cache` page already renders sync status for all rows in `sync_state` — it automatically lights up once new sources start writing.

## Storage

Reuse existing schema. No migration needed.

`cached_events` primary key: `(account_id, source, source_id, person_code)`.
- `source`:
  - `outlook` — Outlook events (account-level Azure app, one row per attendee person_code)
  - `google` — domain-wide Google Workspace events (account-level)
  - `google-user` — per-user Google OAuth events (one row per google token)
- `connection_id`:
  - `outlook`: empty string (one account-level Azure config)
  - `google`: empty string
  - `google-user`: the `user_google_tokens.id` UUID
- `source_id`: the event's provider ID (Graph `id`, Google `id`)
- `person_code`: the local person code the event is attached to (for Outlook derived from `emailForCode`, for Google from the token owner's code)
- `data`: the `Activity`-shaped JSON already produced by `fetchOutlookEventsForPerson` and `mapGoogleEvent`

`sync_state` primary key: `(account_id, source, connection_id)`. Each of the three new sources gets its own rows. The `hasCompletedInitialSync` helper added for ERP is source-parametrised — we pass `'outlook'`, `'google'`, `'google-user'` to check each source independently.

## Sync engine

Add a new module `lib/sync/graph.ts` and `lib/sync/google.ts` that each export:

```typescript
export async function syncAllOutlook(): Promise<SyncResult>
export async function syncAllOutlookFull(): Promise<SyncResult>
export async function syncAllGoogle(): Promise<SyncResult>
export async function syncAllGoogleFull(): Promise<SyncResult>
```

Shape matches `lib/sync/erp.ts`'s `syncAllErp(mode)` so the existing cron route can call all three in sequence:

```typescript
// app/api/sync/cron/route.ts
const erp = await syncAllErp(mode)
const outlook = await syncAllOutlook(mode)
const google = await syncAllGoogle(mode)
return NextResponse.json({ erp, outlook, google })
```

### Outlook sync

Per account (with Azure config present):
1. Resolve person list from `account_members` (or the same logic `/api/activities/summary` uses).
2. For each person:
   - Resolve email via `emailForCode(code, accountId)`. If none, skip.
   - Call `fetchOutlookEventsForPerson(email, accountId, dateFrom, dateTo)` — existing function, returns the same `Activity`-shaped records already stored in the old live path.
   - Build `CachedEventRow`s with `source='outlook'`, `connection_id=''`, `person_code=<code>`, `date=ev.date`.
3. Batch-upsert, then set `sync_state` to `idle` with `isFullSync=true`. No cursor (delta not used in v1 — cursor stays `NULL`).
4. For the daily reconciliation path, first delete `cached_events WHERE account=$1 AND source='outlook'` for that account (mirrors `fullReconciliation` in ERP).

### Google sync

Two separate flows because Google has two auth paths in this repo.

**Domain-wide Google Workspace** (`source='google'`):
- Iterates the account's person list, calls `fetchGoogleEventsForPerson(email, accountId, dateFrom, dateTo)`.
- Keyed by person code like Outlook.

**Per-user Google OAuth** (`source='google-user'`):
- Iterates `user_google_tokens` rows for the account.
- Calls `fetchPerUserGoogleEvents(tokenRow.user_email, accountId, dateFrom, dateTo)` to get all events across the user's enabled calendars (from `user_google_calendars`).
- `connection_id = user_google_tokens.id`, `person_code` = the local code of the token owner (looked up by `user_email`).
- Each calendar's events are flattened into one row each — we don't store per-calendar breakdown in `cached_events` because the existing read path doesn't split by calendar.

### Date window

Same `fullSyncRange()` helper the ERP engine uses — already rounded to whole months so month view never straddles. No per-provider tweaking.

## Read path

The three read endpoints (`/api/activities`, `/api/activities/summary`, `/api/share/[token]/activities`) already have the cache-or-live branch for ERP with `isRangeCovered()` + `hasCompletedInitialSync()`. We extend each to do the same dance for Outlook and Google.

Before:
```typescript
// ERP block — cache-or-live
// Outlook block — always live via fetchOutlookEventsForPerson
// Google block — always live via fetchGoogleEventsForPerson
// google-user block — always live via fetchPerUserGoogleEvents
```

After:
```typescript
function canUseCache(accountId, source, dateFrom, dateTo) {
  return isRangeCovered(dateFrom, dateTo)
      && await hasCompletedInitialSync(accountId, source)
}
// Each block: if canUseCache(...) → getCachedEvents(..., source)
//             else → existing live fetch
```

The per-block live fetch is preserved verbatim so any block can fall back or opt out independently. Parallelise the three `hasCompletedInitialSync` calls with `Promise.all`.

## Write-through

Four route files need write-through added, mirroring the ERP pattern already in `app/api/activities/route.ts` and `app/api/activities/[id]/route.ts`:

| Route | Mutation | Cache action |
|-------|----------|--------------|
| `app/api/outlook/route.ts` | POST (create) | Upsert the created event with `source='outlook'` |
| `app/api/outlook/[id]/route.ts` | PATCH, DELETE | Upsert (re-fetch after edit) or deleteCachedEvent |
| `app/api/google/route.ts` | POST | Upsert with `source='google'` or `'google-user'` based on which token was used |
| `app/api/google/[id]/route.ts` | PATCH, DELETE | Upsert or deleteCachedEvent |

Write-through is fire-and-forget (`.catch(() => log)`), same as ERP. We never block the user response on cache writes.

## Error handling

- Per-person fetch errors stay non-fatal, swallowed into `syncResult.errors[]`. Missing Azure config or zero `user_google_tokens` rows are non-errors (just skipped).
- Token refresh failures on Graph or Google already log via existing code paths. Sync engine doesn't try to refresh — it calls the existing fetch functions, which handle refresh themselves.
- If the sync engine for a provider fails wholesale, `sync_state.sync_status='error'` is recorded. The read path's `hasCompletedInitialSync` still returns `false` until at least one full sync completes, so a broken provider means live fallback — never degraded cache results.

## Testing

New unit tests:
- `__tests__/lib/sync/graph.test.ts` — covers row-building from Graph event shape, skipping when no Azure config.
- `__tests__/lib/sync/google.test.ts` — covers row-building for both `google` and `google-user` sources, per-user token iteration.
- Existing `__tests__/api/activities.test.ts` / `share-activities.test.ts` extended with a "cache used for Outlook when initialSyncDone" case and a "falls back to live" case — same pattern as existing ERP coverage.

## Rollout

1. Ship the sync engine + cron integration with cache writes but *no* read-side changes. Let the daily cron run once.
2. Verify `cached_events` has `source='outlook'` and `source='google'` rows; spot-check against a live fetch.
3. Flip the read path to use cache for Outlook/Google. Monitor for discrepancies.
4. Add write-through in a follow-up PR once reads are proven stable.

The existing `hasCompletedInitialSync` guard means step 3 is safe to ship even before step 1 has succeeded on any given account — unsynced accounts stay on live until their first successful sync run.

## Out of scope / follow-ups

- Delta sync per provider (Graph `@odata.deltaLink`, Google `syncToken`) — a known perf win once the live-for-uncovered path stops mattering.
- Google push notifications and Graph subscriptions — reduces the daily staleness window toward real-time.
- Per-calendar source IDs (e.g. `google-user:<email>:<calendar_id>`) — would let the calendar-sources UI filter at DB level instead of in-memory.
