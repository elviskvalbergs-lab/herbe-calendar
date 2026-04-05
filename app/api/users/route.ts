import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { graphFetch } from '@/lib/graph/client'
import { isHerbeConfigured, isAzureConfigured } from '@/lib/sourceConfig'
import { getErpConnections } from '@/lib/accountConfig'
import { syncPersonCodes, type RawUser } from '@/lib/personCodes'

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

// Module-level cache: avoids re-fetching ERP + Azure + DB sync on every page load
let usersCache: { response: { users: Record<string, unknown>[]; sources: { herbe: boolean; azure: boolean } }; ts: number } | null = null
const USERS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const debug = new URL(req.url).searchParams.get('debug')
  const bustCache = new URL(req.url).searchParams.get('bust') === '1'

  // Return cached result if fresh (skip for debug queries)
  if (!debug && !bustCache && usersCache && Date.now() - usersCache.ts < USERS_CACHE_TTL) {
    return NextResponse.json(usersCache.response, { headers: { 'Cache-Control': 'private, max-age=300' } })
  }

  try {
    const rawUsers: RawUser[] = []

    // Fetch from all active ERP connections
    const erpConnections = await getErpConnections(DEFAULT_ACCOUNT_ID)
    const hasErp = isHerbeConfigured() || erpConnections.length > 0

    if (hasErp) {
      await Promise.all(erpConnections.map(async (conn) => {
        try {
          const users = await herbeFetchAll(REGISTERS.users, {}, 1000, conn)
          const active = users.filter(u => String((u as Record<string, unknown>)['Closed'] ?? '0') === '0')

          if (debug) {
            const record = (users as Record<string, unknown>[]).find(u => u['Code'] === debug)
            if (record) return NextResponse.json(record)
          }

          for (const u of active as Record<string, unknown>[]) {
            const code = u['Code'] as string
            const email = (u['emailAddr'] || u['LoginEmailAddr'] || u['Email'] || '') as string
            const name = (u['Name'] || code || '') as string
            if (!code) continue
            rawUsers.push({
              email: email || `${code.toLowerCase()}@erp.local`,
              displayName: name,
              source: 'erp',
              erpCode: code,
            })
          }
        } catch (e) {
          console.warn(`[users] ERP connection "${conn.name}" fetch failed:`, String(e))
        }
      }))
    }

    // Fetch from Azure AD (if configured)
    if (isAzureConfigured()) {
      try {
        const res = await graphFetch('/users?$select=id,displayName,mail,userPrincipalName&$top=999&$filter=accountEnabled eq true')
        if (res.ok) {
          const data = await res.json()
          const azureUsers = (data.value ?? []) as Record<string, unknown>[]
          for (const u of azureUsers) {
            const email = (u['mail'] || u['userPrincipalName'] || '') as string
            const name = (u['displayName'] || '') as string
            const objectId = (u['id'] || '') as string
            if (!email || !name) continue
            if (email.includes('#EXT#') || !email.includes('@')) continue
            rawUsers.push({
              email,
              displayName: name,
              source: 'azure',
              azureObjectId: objectId,
            })
          }
        } else {
          console.warn('[users] Azure AD fetch failed:', res.status, await res.text().catch(() => ''))
        }
      } catch (e) {
        console.warn('[users] Azure AD fetch failed:', String(e))
      }
    }

    // Sync to person_codes table and get unified list
    let result: Record<string, unknown>[]
    try {
      const personCodes = await syncPersonCodes(rawUsers)
      result = personCodes.map(pc => ({
        Code: pc.generated_code,
        Name: pc.display_name,
        emailAddr: pc.email,
        ...(pc.erp_code ? { erpCode: pc.erp_code } : {}),
        ...(pc.source ? { _source: pc.source } : {}),
      }))
    } catch (e) {
      console.warn('[users] person_codes sync failed, returning raw users:', String(e))
      result = rawUsers.map(u => ({
        Code: u.erpCode || u.displayName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3),
        Name: u.displayName,
        emailAddr: u.email,
      }))
    }

    const erpConnectionList = erpConnections.map(c => ({ id: c.id, name: c.name }))
    const responseData = {
      users: result,
      sources: { herbe: hasErp, azure: isAzureConfigured() },
      erpConnections: erpConnectionList,
    }

    // Cache the result
    usersCache = { response: responseData as any, ts: Date.now() }

    return NextResponse.json(responseData, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
