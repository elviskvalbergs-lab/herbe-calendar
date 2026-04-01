import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'

let userListCache: { data: Record<string, string>; ts: number } | null = null
const USER_LIST_CACHE_TTL = 5 * 60 * 1000

export async function emailForCode(code: string): Promise<string | null> {
  if (!userListCache || Date.now() - userListCache.ts > USER_LIST_CACHE_TTL) {
    try {
      const users = await herbeFetchAll(REGISTERS.users, {}, 1000)
      const data = Object.fromEntries(
        (users as Record<string, unknown>[])
          .filter(u => u['Code'] && (u['emailAddr'] || u['LoginEmailAddr']))
          .map(u => [u['Code'] as string, (u['emailAddr'] || u['LoginEmailAddr']) as string])
      )
      userListCache = { data, ts: Date.now() }
    } catch (e) {
      console.warn('[emailForCode] UserVc unavailable:', String(e))
      userListCache = { data: {}, ts: Date.now() }
    }
  }
  return userListCache.data[code] ?? null
}
