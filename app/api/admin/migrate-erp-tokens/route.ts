import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/adminAuth'
import { pool } from '@/lib/db'
import { encrypt } from '@/lib/crypto'

/**
 * One-time migration: copy global ERP tokens from app_settings
 * into per-connection rows that have OAuth configured but no token.
 * Safe to run multiple times — only updates connections with NULL access_token.
 */
export async function POST() {
  try {
    await requireAdminSession('superadmin')
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Read global tokens from app_settings
  const { rows: settings } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [['herbe_access_token', 'herbe_refresh_token', 'herbe_token_expires_at']]
  )
  const map: Record<string, string> = {}
  for (const row of settings) map[row.key] = row.value

  if (!map['herbe_access_token'] || !map['herbe_refresh_token']) {
    return NextResponse.json({ error: 'No global tokens found in app_settings' }, { status: 404 })
  }

  // Find connections with OAuth configured but no access_token
  const { rows: connections } = await pool.query(
    `SELECT id, name FROM account_erp_connections
     WHERE client_id IS NOT NULL AND client_secret IS NOT NULL
       AND (access_token IS NULL OR access_token = '')
       AND active = true`
  )

  if (connections.length === 0) {
    return NextResponse.json({ message: 'No connections need migration', migrated: 0 })
  }

  const encAccess = encrypt(map['herbe_access_token'])
  const encRefresh = encrypt(map['herbe_refresh_token'])
  const expiresAt = Number(map['herbe_token_expires_at'] ?? 0)

  for (const conn of connections) {
    await pool.query(
      `UPDATE account_erp_connections
       SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = now()
       WHERE id = $4`,
      [encAccess, encRefresh, expiresAt, conn.id]
    )
  }

  return NextResponse.json({
    message: `Migrated ${connections.length} connection(s)`,
    migrated: connections.length,
    connections: connections.map(c => c.name),
  })
}
