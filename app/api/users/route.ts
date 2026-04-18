import { NextRequest, NextResponse } from 'next/server'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { graphFetch } from '@/lib/graph/client'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { getGoogleConfig, listGoogleUsers } from '@/lib/google/client'
import { syncPersonCodes, type RawUser } from '@/lib/personCodes'
import { pool } from '@/lib/db'

// Per-account cache: avoids re-fetching ERP + Azure + DB sync on every page load
const usersCache = new Map<string, { response: { users: Record<string, unknown>[]; sources: { herbe: boolean; azure: boolean } }; ts: number }>()
const USERS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes (short for account switching)

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const bustCache = new URL(req.url).searchParams.get('bust') === '1'

  // Return cached result if fresh
  const cached = usersCache.get(session.accountId)
  if (!bustCache && cached && Date.now() - cached.ts < USERS_CACHE_TTL) {
    return NextResponse.json(cached.response, { headers: { 'Cache-Control': 'private, max-age=300' } })
  }

  try {
    const rawUsers: RawUser[] = []
    const diagnostics: string[] = []

    // Fetch from all active ERP connections
    const erpConnections = await getErpConnections(session.accountId)
    const hasErp = erpConnections.length > 0
    diagnostics.push(`account=${session.accountId}, erpConns=${erpConnections.length}`)

    const debugCode = new URL(req.url).searchParams.get('debugCode')?.toUpperCase() ?? null

    if (hasErp) {
      await Promise.all(erpConnections.map(async (conn) => {
        try {
          const users = await herbeFetchAll(REGISTERS.users, {}, 1000, conn)
          const active = users.filter(u => String((u as Record<string, unknown>)['Closed'] ?? '0') === '0')

          diagnostics.push(`erp:${conn.name}=${active.length}/${users.length}`)
          for (const u of active as Record<string, unknown>[]) {
            const code = u['Code'] as string
            // Scan every value that looks like an email across the record.
            // Hansaworld/Standard Books has changed the email field name
            // over versions (emailAddr, EmailAddr, LoginEmailAddr, Email,
            // EMailAddr, EMail, Addr1..Addr5, etc.). Prefer explicit fields
            // first, then fall back to any string with an "@".
            const emailFromKnownFields = (
              u['emailAddr'] || u['EmailAddr'] || u['EMailAddr'] ||
              u['LoginEmailAddr'] || u['Email'] || u['EMail'] || ''
            ) as string
            let email = emailFromKnownFields
            if (!email) {
              for (const v of Object.values(u)) {
                if (typeof v === 'string' && v.includes('@') && v.length < 120 && !v.includes(' ')) {
                  email = v
                  break
                }
              }
            }
            const name = (u['Name'] || code || '') as string
            if (!code) continue
            if (debugCode && code.toUpperCase() === debugCode) {
              console.log(`[users debug ${conn.name}] ${code} record keys:`, Object.keys(u).join(','))
              console.log(`[users debug ${conn.name}] ${code} record:`, JSON.stringify(u).slice(0, 2000))
              console.log(`[users debug ${conn.name}] ${code} resolved email: "${email}"`)
            }
            rawUsers.push({
              email: email || `${code.toLowerCase()}@erp.local`,
              displayName: name,
              source: 'erp',
              erpCode: code,
            })
          }
        } catch (e) {
          diagnostics.push(`erp:${conn.name}=FAIL:${String(e).slice(0, 120)}`)
        }
      }))
    }

    // Fetch from Azure AD (if configured in DB)
    const azureConfig = await getAzureConfig(session.accountId)
    const hasAzure = !!azureConfig
    if (hasAzure) {
      try {
        const res = await graphFetch('/users?$select=id,displayName,mail,userPrincipalName&$top=999&$filter=accountEnabled eq true', undefined, azureConfig!)
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

    // Fetch from Google Workspace (if configured)
    const googleConfig = await getGoogleConfig(session.accountId)
    const hasGoogle = !!googleConfig
    if (hasGoogle) {
      try {
        const googleUsers = await listGoogleUsers(googleConfig)
        for (const u of googleUsers) {
          rawUsers.push({
            email: u.email,
            displayName: u.name,
            source: 'google',
            googleId: u.id,
          })
        }
      } catch (e) {
        console.warn('[users] Google Workspace fetch failed:', String(e))
      }
    }

    diagnostics.push(`raw=${rawUsers.length}`)

    // Sync to person_codes table and get unified list
    let result: Record<string, unknown>[]
    try {
      const personCodes = await syncPersonCodes(rawUsers, session.accountId)
      diagnostics.push(`synced=${personCodes.length}`)
      // syncPersonCodes only returns rows matched against the ERP/Azure/
      // Google feed. Manually-added members (source='manual') never appear
      // in those feeds, so pull the full person_codes list and fold in
      // anything that wasn't already returned.
      const seen = new Set(personCodes.map(pc => pc.id))
      const { rows: manualExtras } = await pool.query<{
        id: string; generated_code: string; email: string; display_name: string;
        erp_code: string | null; source: string | null
      }>(
        `SELECT id, generated_code, email, display_name, erp_code, source
         FROM person_codes WHERE account_id = $1 AND id <> ALL($2::uuid[])`,
        [session.accountId, Array.from(seen)],
      )
      diagnostics.push(`manualExtras=${manualExtras.length}`)
      result = [
        ...personCodes.map(pc => ({
          Code: pc.generated_code,
          Name: pc.display_name,
          emailAddr: pc.email,
          ...(pc.erp_code ? { erpCode: pc.erp_code } : {}),
          ...(pc.source ? { _source: pc.source } : {}),
        })),
        ...manualExtras.map(pc => ({
          Code: pc.generated_code,
          Name: pc.display_name,
          emailAddr: pc.email,
          ...(pc.erp_code ? { erpCode: pc.erp_code } : {}),
          ...(pc.source ? { _source: pc.source } : {}),
        })),
      ]
    } catch (e) {
      diagnostics.push(`sync=FAIL:${String(e).slice(0, 120)}`)
      result = rawUsers.map(u => ({
        Code: u.erpCode || u.displayName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3),
        Name: u.displayName,
        emailAddr: u.email,
      }))
    }

    console.log(`[users] ${diagnostics.join(' | ')} | final=${result.length}`)

    const erpConnectionList = erpConnections.map(c => ({ id: c.id, name: c.name, companyCode: c.companyCode, serpUuid: (c as any).serpUuid }))
    const responseData = {
      users: result,
      sources: { herbe: hasErp, azure: hasAzure, google: hasGoogle },
      erpConnections: erpConnectionList,
    }

    // Cache the result per account (skip if empty — might be transient failure)
    if (result.length > 0) {
      usersCache.set(session.accountId, { response: responseData as any, ts: Date.now() })
    }

    const cacheHeader = result.length > 0 ? 'private, max-age=300' : 'no-store'
    return NextResponse.json(responseData, { headers: { 'Cache-Control': cacheHeader } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
