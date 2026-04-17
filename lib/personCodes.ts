import { pool } from '@/lib/db'

/** Raw user record from either source before merging */
export interface RawUser {
  email: string
  displayName: string
  source: 'erp' | 'azure' | 'google'
  erpCode?: string         // Original ERP code (e.g. 'EKS')
  azureObjectId?: string   // Azure AD immutable object ID
  googleId?: string        // Google Workspace user ID
}

/** Person code record from the DB */
export interface PersonCodeRecord {
  id: string
  azure_object_id: string | null
  erp_code: string | null
  generated_code: string
  email: string
  display_name: string
  source: string
}

/**
 * Generate a short person code from a display name.
 * Algorithm: first letter of first name + first and last letter of surname.
 * e.g. "Elvis Kvalbergs" → "EKS", "John Doe" → "JDE"
 * Falls back to first 3 chars of name if single-word name.
 */
export function generateCode(displayName: string): string {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return 'USR'

  const first = parts[0].toUpperCase()
  if (parts.length === 1) {
    return first.slice(0, 3).padEnd(3, 'X')
  }

  const last = parts[parts.length - 1].toUpperCase()
  return (first[0] + last[0] + last[last.length - 1]).toUpperCase()
}

/**
 * Find a unique code by appending a number suffix if needed.
 * e.g. "EKS" → "EKS", "EKS2", "EKS3", ...
 */
export async function findUniqueCode(baseCode: string, accountId: string, excludeEmail?: string): Promise<string> {
  // Check if base code is available within this account
  const { rows } = await pool.query(
    'SELECT generated_code FROM person_codes WHERE account_id = $1 AND generated_code = $2' + (excludeEmail ? ' AND email != $3' : ''),
    excludeEmail ? [accountId, baseCode, excludeEmail] : [accountId, baseCode]
  )
  if (rows.length === 0) return baseCode

  // Try with numeric suffixes
  for (let i = 2; i < 100; i++) {
    const candidate = `${baseCode}${i}`
    const { rows: r } = await pool.query(
      'SELECT generated_code FROM person_codes WHERE account_id = $1 AND generated_code = $2' + (excludeEmail ? ' AND email != $3' : ''),
      excludeEmail ? [accountId, candidate, excludeEmail] : [accountId, candidate]
    )
    if (r.length === 0) return candidate
  }
  throw new Error(`Could not generate unique code for base "${baseCode}"`)
}

/**
 * Sync a list of raw users into the person_codes table.
 * - Matches by email (case-insensitive)
 * - Updates existing records (name, source, azure_object_id)
 * - Inserts new records with generated codes
 * - ERP code always takes priority as the generated_code when available
 */
export async function syncPersonCodes(users: RawUser[], accountId: string): Promise<PersonCodeRecord[]> {
  if (users.length === 0) return []

  // Load existing records for this account only
  const { rows: existing } = await pool.query<PersonCodeRecord>(
    'SELECT * FROM person_codes WHERE account_id = $1',
    [accountId]
  )
  const byEmail = new Map(existing.map(r => [r.email.toLowerCase(), r]))
  const byErpCode = new Map(existing.filter(r => r.erp_code).map(r => [r.erp_code!, r]))

  // Merge users by email (case-insensitive), also match ERP users by code
  const merged = new Map<string, { erp?: RawUser; azure?: RawUser; google?: RawUser }>()
  for (const u of users) {
    const key = u.email.toLowerCase()
    // Skip ERP users without real email addresses
    if (u.source === 'erp' && key.endsWith('@erp.local')) continue
    const entry = merged.get(key) ?? {}
    if (u.source === 'erp') entry.erp = u
    else if (u.source === 'google') entry.google = u
    else entry.azure = u
    merged.set(key, entry)
  }

  // Also add ERP users with dummy emails (no matching Azure user)
  for (const u of users) {
    if (u.source !== 'erp') continue
    const key = u.email.toLowerCase()
    if (!key.endsWith('@erp.local')) continue
    // These users have no real email, add them separately
    merged.set(key, { erp: u })
  }

  const results: PersonCodeRecord[] = []

  for (const [emailKey, { erp, azure, google }] of merged) {
    // Try to find existing record by email OR by ERP code
    const existingRecord = byEmail.get(emailKey) ?? (erp?.erpCode ? byErpCode.get(erp.erpCode) : undefined)
    const displayName = erp?.displayName || azure?.displayName || google?.displayName || ''
    const email = erp?.email || azure?.email || google?.email || ''
    const sources = [erp && 'erp', azure && 'azure', google && 'google'].filter(Boolean) as string[]
    const source = sources.join('+')
    const azureObjectId = azure?.azureObjectId || null
    const erpCode = erp?.erpCode || null

    if (existingRecord) {
      // Update existing record
      const { rows } = await pool.query<PersonCodeRecord>(
        `UPDATE person_codes
         SET display_name = $1, source = $2,
             azure_object_id = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE azure_object_id END,
             erp_code = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE erp_code END,
             email = $5, updated_at = now()
         WHERE id = $6
         RETURNING *`,
        [displayName, source, azureObjectId, erpCode, email, existingRecord.id]
      )
      if (rows[0]) results.push(rows[0])
    } else {
      // Generate code for new user: use ERP code if available, otherwise generate
      const code = erpCode ?? await findUniqueCode(generateCode(displayName), accountId, email)
      try {
        const { rows } = await pool.query<PersonCodeRecord>(
          `INSERT INTO person_codes (account_id, azure_object_id, erp_code, generated_code, email, display_name, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [accountId, azureObjectId || null, erpCode, code, email, displayName, source]
        )
        if (rows[0]) results.push(rows[0])
      } catch (e) {
        // Duplicate — skip (likely a race condition or duplicate email with different case)
        console.warn(`[personCodes] Insert failed for ${email}:`, String(e))
        // Try to fetch the existing one
        const { rows } = await pool.query<PersonCodeRecord>(
          'SELECT * FROM person_codes WHERE account_id = $1 AND LOWER(email) = $2',
          [accountId, emailKey]
        )
        if (rows[0]) results.push(rows[0])
      }
    }
  }

  return results
}

/**
 * Ensure a person_codes row exists for the given account+email. Used when a
 * member is added manually (outside the ERP/Azure/Google sync paths) so
 * they still get a generated_code and can be referenced by the calendar,
 * ICS attachments, etc. Returns the resulting record.
 *
 * If `displayName` is not provided, one is derived from the email local
 * part (e.g. 'elvis.kvalbergs@example.com' → 'Elvis Kvalbergs').
 */
export async function ensurePersonCode(
  accountId: string,
  email: string,
  displayName?: string,
): Promise<PersonCodeRecord> {
  const normalizedEmail = email.trim().toLowerCase()
  const { rows: existing } = await pool.query<PersonCodeRecord>(
    'SELECT * FROM person_codes WHERE account_id = $1 AND LOWER(email) = $2',
    [accountId, normalizedEmail],
  )
  if (existing[0]) return existing[0]

  const name = (displayName && displayName.trim()) || deriveNameFromEmail(normalizedEmail)
  const code = await findUniqueCode(generateCode(name), accountId, normalizedEmail)
  const { rows } = await pool.query<PersonCodeRecord>(
    `INSERT INTO person_codes (account_id, generated_code, email, display_name, source)
     VALUES ($1, $2, $3, $4, 'manual')
     RETURNING *`,
    [accountId, code, normalizedEmail, name],
  )
  return rows[0]
}

function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[.\-_]/)
    .filter(Boolean)
    .map(p => p[0]?.toUpperCase() + p.slice(1))
    .join(' ')
}

/**
 * Look up a person code by email.
 */
export async function getCodeByEmail(email: string, accountId?: string): Promise<string | null> {
  if (accountId) {
    const { rows } = await pool.query<{ generated_code: string }>(
      'SELECT generated_code FROM person_codes WHERE account_id = $1 AND LOWER(email) = LOWER($2)',
      [accountId, email]
    )
    return rows[0]?.generated_code ?? null
  }
  // Fallback: search across all accounts (used during auth before account is known)
  const { rows } = await pool.query<{ generated_code: string }>(
    'SELECT generated_code FROM person_codes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  )
  return rows[0]?.generated_code ?? null
}

/**
 * Check if an email exists in the person_codes table.
 */
export async function isEmailKnown(email: string, accountId?: string): Promise<boolean> {
  if (accountId) {
    const { rows } = await pool.query(
      'SELECT 1 FROM person_codes WHERE account_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
      [accountId, email]
    )
    return rows.length > 0
  }
  // Fallback: search across all accounts (used during auth before account is known)
  const { rows } = await pool.query(
    'SELECT 1 FROM person_codes WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email]
  )
  return rows.length > 0
}
