import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'
import { getErpConnections, getAzureConfig } from '@/lib/accountConfig'
import { herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS } from '@/lib/herbe/constants'
import { graphFetch } from '@/lib/graph/client'
import { getGoogleConfig, listGoogleUsers } from '@/lib/google/client'
import { getAccountIdFromCookie } from '@/lib/adminAccountId'

export async function PATCH(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await req.json()
  const { email, role, active, id: personCodeId, holidayCountry } = body

  // Holiday country override is keyed on person_codes.id
  if (holidayCountry !== undefined && personCodeId !== undefined) {
    await pool.query(
      'UPDATE person_codes SET holiday_country = $1 WHERE id = $2 AND account_id = $3',
      [holidayCountry || null, personCodeId, session.accountId]
    )
    return NextResponse.json({ ok: true })
  }

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const updates: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (role === 'admin' || role === 'member') {
    updates.push(`role = $${idx++}`)
    params.push(role)
  }
  if (typeof active === 'boolean') {
    updates.push(`active = $${idx++}`)
    params.push(active)
  }

  if (updates.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  params.push(email, session.accountId)
  await pool.query(
    `UPDATE account_members SET ${updates.join(', ')} WHERE email = $${idx++} AND account_id = $${idx}`,
    params
  )

  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { email, role } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  try {
    await pool.query(
      `INSERT INTO account_members (account_id, email, role) VALUES ($1, $2, $3)
       ON CONFLICT (account_id, email) DO UPDATE SET role = EXCLUDED.role`,
      [session.accountId, email.trim().toLowerCase(), role || 'member']
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdminSession('admin', getAccountIdFromCookie(req))
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'UNAUTHORIZED') return new NextResponse('Unauthorized', { status: 401 })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { action } = await req.json()
  if (action !== 'sync') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  try {
    const activeEmails = new Set<string>()
    const closedErpEmails = new Set<string>()

    // Fetch from ERP connections
    const erpConnections = await getErpConnections(session.accountId)
    for (const conn of erpConnections) {
      try {
        const users = await herbeFetchAll(REGISTERS.users, {}, 1000, conn)
        for (const u of users as Record<string, unknown>[]) {
          const email = ((u['emailAddr'] || u['LoginEmailAddr'] || '') as string).toLowerCase().trim()
          if (!email || !email.includes('@')) continue
          if (String(u['Closed'] ?? '0') !== '0') {
            closedErpEmails.add(email)
          } else {
            activeEmails.add(email)
          }
        }
      } catch (e) {
        console.warn(`[members sync] ERP "${conn.name}" failed:`, String(e))
      }
    }

    // Fetch from Azure
    const azureConfig = await getAzureConfig(session.accountId)
    if (azureConfig) {
      try {
        const res = await graphFetch('/users?$select=mail,userPrincipalName&$top=999&$filter=accountEnabled eq true', undefined, azureConfig)
        if (res.ok) {
          const data = await res.json()
          for (const u of (data.value ?? []) as Record<string, unknown>[]) {
            const email = ((u['mail'] || u['userPrincipalName'] || '') as string).toLowerCase().trim()
            if (email && email.includes('@') && !email.includes('#EXT#')) activeEmails.add(email)
          }
        }
      } catch (e) {
        console.warn('[members sync] Azure failed:', String(e))
      }
    }

    // Fetch from Google Workspace
    const googleConfig = await getGoogleConfig(session.accountId)
    if (googleConfig) {
      try {
        const users = await listGoogleUsers(googleConfig)
        for (const u of users) {
          const email = u.email.toLowerCase().trim()
          if (email && email.includes('@')) activeEmails.add(email)
        }
      } catch (e) {
        console.warn('[members sync] Google failed:', String(e))
      }
    }

    // Insert new active members
    let added = 0
    for (const email of activeEmails) {
      const { rowCount } = await pool.query(
        `INSERT INTO account_members (account_id, email, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (account_id, email) DO NOTHING`,
        [session.accountId, email]
      )
      if (rowCount && rowCount > 0) added++
    }

    // Deactivate members whose ERP user is closed (and not active in another source)
    let deactivated = 0
    for (const email of closedErpEmails) {
      if (activeEmails.has(email)) continue // still active in Azure/Google
      const { rowCount } = await pool.query(
        `UPDATE account_members SET active = false WHERE account_id = $1 AND LOWER(email) = $2 AND active = true`,
        [session.accountId, email]
      )
      if (rowCount && rowCount > 0) deactivated++
    }

    return NextResponse.json({ ok: true, added, deactivated, total: activeEmails.size })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
