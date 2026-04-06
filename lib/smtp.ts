import { createTransport } from 'nodemailer'
import { pool } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  senderEmail: string
  senderName: string
  useTls: boolean
}

const smtpCache = new Map<string, { data: SmtpConfig | null; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function getSmtpConfig(accountId: string): Promise<SmtpConfig | null> {
  const cached = smtpCache.get(accountId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const { rows } = await pool.query(
      'SELECT host, port, username, password, sender_email, sender_name, use_tls FROM account_smtp_config WHERE account_id = $1',
      [accountId]
    )
    if (rows[0] && rows[0].host) {
      let pwd = ''
      if (rows[0].password) {
        try { pwd = decrypt(rows[0].password) } catch {}
      }
      const config: SmtpConfig = {
        host: rows[0].host,
        port: rows[0].port,
        username: rows[0].username,
        password: pwd,
        senderEmail: rows[0].sender_email,
        senderName: rows[0].sender_name,
        useTls: rows[0].use_tls,
      }
      smtpCache.set(accountId, { data: config, ts: Date.now() })
      return config
    }
  } catch (e) {
    console.warn('[smtp] Config lookup failed:', String(e))
  }

  smtpCache.set(accountId, { data: null, ts: Date.now() })
  return null
}

export async function sendMailSmtp(config: SmtpConfig, to: string, subject: string, html: string): Promise<void> {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: config.useTls ? { rejectUnauthorized: false } : undefined,
  })

  await transport.sendMail({
    from: config.senderName ? `"${config.senderName}" <${config.senderEmail}>` : config.senderEmail,
    to,
    subject,
    html,
  })
}
