import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { saveAzureConfig, getAzureConfig } from '@/lib/accountConfig'
import { graphFetch } from '@/lib/graph/client'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getSmtpConfig, sendMailSmtp } from '@/lib/smtp'
import { getGoogleConfig, listGoogleUsers } from '@/lib/google/client'

function getAccountIdFromCookie(req: NextRequest): string | undefined {
  return req.cookies.get('adminAccountId')?.value || undefined
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

  try {
    const body = await req.json()

    if (body.type === 'azure') {
      const existing = await getAzureConfig(session.accountId)
      await saveAzureConfig(session.accountId, {
        tenantId: body.tenantId ?? '',
        clientId: body.clientId ?? '',
        clientSecret: body.clientSecret || existing?.clientSecret || '',
        senderEmail: body.senderEmail ?? '',
      })
      return NextResponse.json({ ok: true })
    }

    if (body.type === 'smtp') {
      const encPassword = body.password ? encrypt(body.password) : null
      // Preserve existing password if not provided
      let passwordToStore = encPassword
      if (!encPassword) {
        const existing = await getSmtpConfig(session.accountId)
        if (existing) {
          const { rows } = await pool.query('SELECT password FROM account_smtp_config WHERE account_id = $1', [session.accountId])
          passwordToStore = rows[0]?.password ?? null
        }
      }
      await pool.query(
        `INSERT INTO account_smtp_config (account_id, host, port, username, password, sender_email, sender_name, use_tls, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (account_id) DO UPDATE SET
           host = EXCLUDED.host, port = EXCLUDED.port, username = EXCLUDED.username,
           password = COALESCE(EXCLUDED.password, account_smtp_config.password),
           sender_email = EXCLUDED.sender_email, sender_name = EXCLUDED.sender_name,
           use_tls = EXCLUDED.use_tls, updated_at = now()`,
        [session.accountId, body.host ?? '', body.port ?? 587, body.username ?? '', passwordToStore, body.senderEmail ?? '', body.senderName ?? 'Herbe Calendar', body.useTls ?? true]
      )
      return NextResponse.json({ ok: true })
    }

    if (body.type === 'google') {
      const encKey = body.serviceAccountKey ? encrypt(body.serviceAccountKey) : null
      let keyToStore = encKey
      if (!encKey) {
        const { rows } = await pool.query('SELECT service_account_key FROM account_google_config WHERE account_id = $1', [session.accountId])
        keyToStore = rows[0]?.service_account_key ?? null
      }
      await pool.query(
        `INSERT INTO account_google_config (account_id, service_account_email, service_account_key, admin_email, domain, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (account_id) DO UPDATE SET
           service_account_email = EXCLUDED.service_account_email,
           service_account_key = COALESCE(EXCLUDED.service_account_key, account_google_config.service_account_key),
           admin_email = EXCLUDED.admin_email, domain = EXCLUDED.domain, updated_at = now()`,
        [session.accountId, body.serviceAccountEmail ?? '', keyToStore, body.adminEmail ?? '', body.domain ?? '']
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown config type' }, { status: 400 })
  } catch (e) {
    console.error('[admin/config PUT]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
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

  try {
    const body = await req.json()

    if (body.action === 'test-azure') {
      const config = await getAzureConfig(session.accountId)
      if (!config) return NextResponse.json({ ok: false, error: 'Azure not configured' })
      const res = await graphFetch('/users?$select=id&$top=1', undefined, config)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json({ ok: false, error: `Graph API error ${res.status}: ${text.slice(0, 200)}` })
      }
      const data = await res.json()
      const countRes = await graphFetch('/users/$count', { headers: { ConsistencyLevel: 'eventual' } }, config)
      const userCount = countRes.ok ? parseInt(await countRes.text()) : (data.value?.length ?? 0)
      return NextResponse.json({ ok: true, userCount })
    }

    if (body.action === 'test-smtp') {
      const config = await getSmtpConfig(session.accountId)
      if (!config) return NextResponse.json({ ok: false, error: 'SMTP not configured' })
      try {
        await sendMailSmtp(config, session.email, 'Herbe Calendar SMTP Test', '<p>SMTP connection is working!</p>')
        return NextResponse.json({ ok: true, message: `Test email sent to ${session.email}` })
      } catch (e) {
        return NextResponse.json({ ok: false, error: String(e) })
      }
    }

    if (body.action === 'test-google') {
      const config = await getGoogleConfig(session.accountId)
      if (!config) return NextResponse.json({ ok: false, error: 'Google not configured' })
      try {
        const users = await listGoogleUsers(config)
        return NextResponse.json({ ok: true, userCount: users.length })
      } catch (e: unknown) {
        const err = e as { message?: string; response?: { data?: unknown; status?: number } }
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message ?? String(e)
        console.error('[admin/config] Google test failed:', detail)
        return NextResponse.json({ ok: false, error: detail })
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) })
  }
}
