import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { fetchErpTasks } from '@/lib/herbe/taskRecordUtils'
import { fetchOutlookTasks } from '@/lib/outlook/tasks'
import { fetchGoogleTasks } from '@/lib/google/tasks'
import {
  getCachedTasks,
  replaceCachedTasksForSource,
  type CachedTaskRow,
} from '@/lib/cache/tasks'
import { getCodeByEmail } from '@/lib/personCodes'
import { getAzureConfig } from '@/lib/accountConfig'
import { getUserGoogleAccounts } from '@/lib/google/userOAuth'
import type { Task, TaskSource } from '@/types/task'
import type { AzureConfig } from '@/lib/accountConfig'

interface SourceErrorInfo { source: TaskSource; msg: string; stale?: boolean }

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

export async function GET(_req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const { accountId, email } = session
    const personCode = await getCodeByEmail(email, accountId).catch(e => {
      console.warn('[tasks] getCodeByEmail failed:', e); return null
    })
    const azureConfig = await getAzureConfig(accountId).catch(e => {
      console.warn('[tasks] getAzureConfig failed:', e); return null
    })
    const googleTokenId = await getFirstGoogleTokenId(email, accountId).catch(e => {
      console.warn('[tasks] getFirstGoogleTokenId failed:', e); return null
    })

    const [erpR, outlookR, googleR] = await Promise.all([
      fetchErpAndCache(accountId, email, personCode ? [personCode] : []),
      fetchOutlookAndCache(accountId, email, azureConfig),
      fetchGoogleAndCache(accountId, email, googleTokenId),
    ])

    const errors: SourceErrorInfo[] = []
    if (erpR.error) errors.push({ source: 'herbe', msg: erpR.error, stale: erpR.stale })
    if (outlookR.error) errors.push({ source: 'outlook', msg: outlookR.error, stale: outlookR.stale })
    if (googleR.error) errors.push({ source: 'google', msg: googleR.error, stale: googleR.stale })

    const tasks: Task[] = [
      ...erpR.tasks, ...outlookR.tasks, ...googleR.tasks,
    ]

    const configured = {
      herbe: true,
      outlook: !!outlookR.configured,
      google: !!googleR.configured,
    }
    return NextResponse.json({ tasks, configured, errors }, { headers: { 'Cache-Control': 'no-store' } })
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

async function fetchErpAndCache(accountId: string, userEmail: string, personCodes: string[]): Promise<SourceResult> {
  if (personCodes.length === 0) return { tasks: [], configured: true }
  try {
    const r = await fetchErpTasks(accountId, personCodes)
    if (r.errors.length > 0 && r.tasks.length === 0) {
      const cached = await safeGetCachedTasks(accountId, userEmail, 'herbe')
      return { tasks: cached, configured: true, stale: cached.length > 0, error: r.errors[0].msg }
    }
    await replaceCachedTasksForSource(accountId, userEmail, 'herbe',
      cacheRowsFrom(r.tasks, accountId, userEmail, 'herbe'))
      .catch(e => console.warn('[tasks] herbe cache write skipped:', e))
    return { tasks: r.tasks, configured: true }
  } catch (e) {
    console.error('[tasks] erp fetch failed:', e)
    const cached = await safeGetCachedTasks(accountId, userEmail, 'herbe')
    return { tasks: cached, configured: true, stale: cached.length > 0, error: 'ERP fetch failed' }
  }
}

async function fetchOutlookAndCache(accountId: string, userEmail: string, azureConfig: AzureConfig | null): Promise<SourceResult> {
  if (!azureConfig) return { tasks: [], configured: false }
  try {
    const r = await fetchOutlookTasks(userEmail, azureConfig)
    if (!r.configured) return { tasks: [], configured: false }
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

async function fetchGoogleAndCache(accountId: string, userEmail: string, tokenId: string | null): Promise<SourceResult> {
  if (!tokenId) return { tasks: [], configured: false }
  try {
    const r = await fetchGoogleTasks(tokenId, userEmail, accountId)
    if (!r.configured) return { tasks: [], configured: false }
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
