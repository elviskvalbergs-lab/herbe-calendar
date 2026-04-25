import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { fetchErpTasks } from '@/lib/herbe/taskRecordUtils'
import { fetchOutlookTasks } from '@/lib/outlook/tasks'
import { fetchGoogleTasks } from '@/lib/google/tasks'
import {
  getCachedTasks,
  replaceCachedTasksForSource,
  tasksCacheIsFresh,
  type CachedTaskRow,
} from '@/lib/cache/tasks'
import { getCodeByEmail } from '@/lib/personCodes'
import { getAzureConfig } from '@/lib/accountConfig'
import { getGoogleConfig } from '@/lib/google/client'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import type { Task, TaskSource } from '@/types/task'
import type { AzureConfig } from '@/lib/accountConfig'

interface SourceErrorInfo { source: TaskSource; msg: string; stale?: boolean; truncated?: boolean }

async function safeGetCachedTasks(accountId: string, userEmail: string, source: TaskSource): Promise<Task[]> {
  try {
    return await getCachedTasks(accountId, userEmail, source)
  } catch (e) {
    console.warn(`[tasks] ${source} cache read skipped:`, e)
    return []
  }
}

async function getFirstGoogleTokenId(userEmail: string, accountId: string): Promise<string | null> {
  const accounts = await getUserGoogleAccounts(userEmail, accountId)
  return accounts[0]?.id ?? null
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const { accountId, email } = session
    const url = new URL(req.url)
    const requestedSource = url.searchParams.get('source') as TaskSource | null
    // ?live=1 forces a live fetch + cache refresh. Default path serves from
    // the DB cache when it's recent (same pattern as events) so initial
    // load and post-mutation refreshes don't pay the full ERP roundtrip.
    const live = url.searchParams.get('live') === '1'
    const want = (s: TaskSource) => !requestedSource || requestedSource === s

    const [personCode, azureConfig, googleTokenId, googleWorkspaceConfigured] = await Promise.all([
      want('herbe')
        ? getCodeByEmail(email, accountId).catch(e => { console.warn('[tasks] getCodeByEmail failed:', e); return null })
        : Promise.resolve(null),
      want('outlook')
        ? getAzureConfig(accountId).catch(e => { console.warn('[tasks] getAzureConfig failed:', e); return null })
        : Promise.resolve(null),
      want('google')
        ? getFirstGoogleTokenId(email, accountId).catch(e => { console.warn('[tasks] getFirstGoogleTokenId failed:', e); return null })
        : Promise.resolve(null),
      want('google')
        ? getGoogleConfig(accountId).then(cfg => !!cfg).catch(e => { console.warn('[tasks] getGoogleConfig failed:', e); return false })
        : Promise.resolve(false),
    ])

    const empty = { tasks: [] as Task[], configured: false } as SourceResult
    // Time each source independently so we can show the user where the
    // aggregate latency is going. Kept parallel — this is only diagnostic.
    const timed = <T,>(label: TaskSource, run: () => Promise<T>): Promise<{ result: T; ms: number }> => {
      const t0 = Date.now()
      return run().then(result => {
        const ms = Date.now() - t0
        console.log(`[tasks] ${label} fetched in ${ms}ms`)
        return { result, ms }
      })
    }
    const [erpT, outlookT, googleT] = await Promise.all([
      want('herbe')
        ? timed('herbe', () => fetchErpAndCache(accountId, email, personCode ? [personCode] : [], live))
        : Promise.resolve({ result: empty, ms: 0 }),
      want('outlook')
        ? timed('outlook', () => fetchOutlookAndCache(accountId, email, azureConfig, live))
        : Promise.resolve({ result: empty, ms: 0 }),
      want('google')
        ? timed('google', () => fetchGoogleAndCache(accountId, email, googleTokenId, googleWorkspaceConfigured, live))
        : Promise.resolve({ result: empty, ms: 0 }),
    ])
    const erpR = erpT.result, outlookR = outlookT.result, googleR = googleT.result
    const timings: Partial<Record<TaskSource, number>> = {}
    if (want('herbe')) timings.herbe = erpT.ms
    if (want('outlook')) timings.outlook = outlookT.ms
    if (want('google')) timings.google = googleT.ms

    const errors: SourceErrorInfo[] = []
    if (erpR.error) errors.push({ source: 'herbe', msg: erpR.error, stale: erpR.stale, truncated: erpR.truncated })
    else if (erpR.truncated) errors.push({ source: 'herbe', msg: 'Showing partial data — too many tasks in window', truncated: true })
    if (outlookR.error) errors.push({ source: 'outlook', msg: outlookR.error, stale: outlookR.stale })
    if (googleR.error) errors.push({ source: 'google', msg: googleR.error, stale: googleR.stale })

    const tasks: Task[] = [...erpR.tasks, ...outlookR.tasks, ...googleR.tasks]

    // Only report `configured` flags for sources actually queried — the caller
    // uses `source=google` to refresh one side-channel and should merge the
    // result rather than clobber the other sources' state.
    const configured: Partial<Record<TaskSource, boolean>> = {}
    if (want('herbe')) configured.herbe = true
    if (want('outlook')) configured.outlook = !!outlookR.configured
    if (want('google')) configured.google = !!googleR.configured

    console.log(`[tasks] returning ${tasks.length} total (erp=${erpR.tasks.length}/${timings.herbe ?? '-'}ms outlook=${outlookR.tasks.length}/${timings.outlook ?? '-'}ms google=${googleR.tasks.length}/${timings.google ?? '-'}ms) errors=${errors.length} source=${requestedSource ?? 'all'}`)
    return NextResponse.json({ tasks, configured, errors, timings, source: requestedSource ?? null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[tasks] aggregator failed:', e)
    return NextResponse.json(
      { tasks: [], configured: { herbe: true, outlook: false, google: false }, errors: [{ source: 'herbe', msg: 'Tasks unavailable' }] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

// -------- per-source helpers with cache fallback --------

interface SourceResult {
  tasks: Task[]
  configured: boolean
  stale?: boolean
  /** ERP only: set when herbeFetchAll hit MAX_PAGES so the client can show
   *  "showing partial data" alongside the existing stale banner. */
  truncated?: boolean
  error?: string
}

function cacheRowsFrom(
  tasks: Task[],
  accountId: string,
  userEmail: string,
  source: TaskSource,
): CachedTaskRow[] {
  return tasks.map(t => ({
    accountId,
    userEmail,
    source,
    connectionId: t.sourceConnectionId ?? '',
    taskId: t.id,
    payload: t as unknown as Record<string, unknown>,
  }))
}

async function fetchErpAndCache(accountId: string, userEmail: string, personCodes: string[], live: boolean): Promise<SourceResult> {
  if (personCodes.length === 0) return { tasks: [], configured: true }

  if (!live && await tasksCacheIsFresh(accountId, userEmail, 'herbe')) {
    const cached = await safeGetCachedTasks(accountId, userEmail, 'herbe')
    return { tasks: cached, configured: true }
  }

  try {
    const r = await fetchErpTasks(accountId, personCodes)
    if (r.errors.length > 0 && r.tasks.length === 0) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'herbe')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.errors[0].msg }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'herbe',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'herbe'))
      .catch(e => console.warn('[tasks] herbe cache write skipped:', e))
    return { tasks: r.tasks, configured: true, truncated: r.truncated || undefined }
  } catch (e) {
    console.error('[tasks] erp fetch failed:', e)
    const cached = await safeGetCachedTasks(accountId, userEmail, 'herbe')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: 'ERP fetch failed' }
  }
}

async function fetchOutlookAndCache(accountId: string, userEmail: string, azureConfig: AzureConfig | null, live: boolean): Promise<SourceResult> {
  // "configured" means the admin has set up the connection. Tab visibility
  // follows admin/user setup, not live-fetch success. Auth/scope failures
  // surface as errors in-tab.
  if (!azureConfig) return { tasks: [], configured: false }

  if (!live && await tasksCacheIsFresh(accountId, userEmail, 'outlook')) {
    const cached = await safeGetCachedTasks(accountId, userEmail, 'outlook')
    return { tasks: cached, configured: true }
  }

  try {
    const r = await fetchOutlookTasks(userEmail, azureConfig)
    if (!r.configured) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'outlook')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: 'Missing Tasks.ReadWrite.All admin consent' }
    }
    if (r.error) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'outlook')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.error }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'outlook',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'outlook'))
      .catch(e => console.warn('[tasks] outlook cache write skipped:', e))
    return { tasks: r.tasks, configured: true }
  } catch (e) {
    console.error('[tasks] outlook fetch failed:', e)
    const cached = await safeGetCachedTasks(accountId, userEmail, 'outlook')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: 'Outlook fetch failed' }
  }
}

async function fetchGoogleAndCache(
  accountId: string,
  userEmail: string,
  tokenId: string | null,
  workspaceConfigured: boolean,
  live: boolean,
): Promise<SourceResult> {
  // Tab visibility: Google is "configured" when EITHER a workspace service
  // account is set up (admin-level) OR the user has per-user OAuth. Google
  // Tasks are personal, so only per-user OAuth can read/write them — but
  // we still show the tab if workspace is configured so the user can see
  // why it's empty and reconnect.
  if (!tokenId && !workspaceConfigured) return { tasks: [], configured: false }
  if (!tokenId) {
    return { tasks: [], configured: true, error: 'Connect your personal Google account in Settings to load Tasks' }
  }

  if (!live && await tasksCacheIsFresh(accountId, userEmail, 'google')) {
    const cached = await safeGetCachedTasks(accountId, userEmail, 'google')
    return { tasks: cached, configured: true }
  }

  try {
    const r = await fetchGoogleTasks(tokenId, userEmail, accountId)
    if (!r.configured) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'google')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: 'Google token missing Tasks scope — reconnect' }
    }
    if (r.error) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'google')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.error }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'google',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'google'))
      .catch(e => console.warn('[tasks] google cache write skipped:', e))
    return { tasks: r.tasks, configured: true }
  } catch (e) {
    console.error('[tasks] google fetch failed:', e)
    const cached = await safeGetCachedTasks(accountId, userEmail, 'google')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: 'Google fetch failed' }
  }
}
