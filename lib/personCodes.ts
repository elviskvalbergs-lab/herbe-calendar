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
  const byAzureId = new Map(existing.filter(r => r.azure_object_id).map(r => [r.azure_object_id!, r]))

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
    // Try to find existing record by email, ERP code, or Azure object ID.
    // The Azure fallback catches email changes in Azure — without it a
    // renamed Azure user would silently create a duplicate row.
    const existingRecord =
      byEmail.get(emailKey) ??
      (erp?.erpCode ? byErpCode.get(erp.erpCode) : undefined) ??
      (azure?.azureObjectId ? byAzureId.get(azure.azureObjectId) : undefined)
    const displayName = erp?.displayName || azure?.displayName || google?.displayName || ''
    const email = erp?.email || azure?.email || google?.email || ''
    const sources = [erp && 'erp', azure && 'azure', google && 'google'].filter(Boolean) as string[]
    const source = sources.join('+')
    const azureObjectId = azure?.azureObjectId || null
    const erpCode = erp?.erpCode || null

    if (existingRecord) {
      // Update existing record. Never overwrite a real email with the ERP
      // "@erp.local" placeholder — that placeholder only appears when the
      // merge iteration visits the ERP-dummy entry for a row that already
      // has a real email attached via azure_object_id.
      const { rows } = await pool.query<PersonCodeRecord>(
        `UPDATE person_codes
         SET display_name = $1, source = $2,
             azure_object_id = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE azure_object_id END,
             erp_code = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE erp_code END,
             email = CASE
               WHEN $5 LIKE '%@erp.local' AND email NOT LIKE '%@erp.local' THEN email
               ELSE $5
             END,
             updated_at = now()
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

export interface DuplicateCandidate {
  reason: string
  rowAId: string
  rowACode: string
  rowAEmail: string
  rowBId: string
  rowBCode: string
  rowBEmail: string
}

/**
 * Detect pairs of person_codes rows that appear to be the same person.
 * Called from the admin UI to surface a merge prompt. We look for:
 *
 * 1. Cross-reference: one row's erp_code equals another row's
 *    generated_code. This is the "Diana case" — ERP renamed someone to
 *    an email that was already used by an Azure-only row, so the Azure
 *    row gained an erp_code while an orphan ERP row with the matching
 *    generated_code still exists.
 * 2. Email duplicates: two active rows share an email (case-insensitive).
 *    Shouldn't happen thanks to the unique index, but surface it if the
 *    index is somehow disabled or a historical collision survived.
 */
export async function findDuplicatePersonCodes(accountId: string): Promise<DuplicateCandidate[]> {
  const { rows } = await pool.query<{
    reason: string
    a_id: string
    a_code: string
    a_email: string
    b_id: string
    b_code: string
    b_email: string
  }>(
    `SELECT 'cross-code' AS reason,
            a.id AS a_id, a.generated_code AS a_code, a.email AS a_email,
            b.id AS b_id, b.generated_code AS b_code, b.email AS b_email
       FROM person_codes a
       JOIN person_codes b
         ON b.account_id = a.account_id
        AND b.id <> a.id
        AND b.generated_code = a.erp_code
      WHERE a.account_id = $1 AND a.erp_code IS NOT NULL
        AND a.erp_code <> a.generated_code
      UNION ALL
      SELECT 'email-duplicate' AS reason,
             a.id, a.generated_code, a.email,
             b.id, b.generated_code, b.email
        FROM person_codes a
        JOIN person_codes b
          ON b.account_id = a.account_id
         AND b.id < a.id
         AND LOWER(b.email) = LOWER(a.email)
       WHERE a.account_id = $1
      UNION ALL
      SELECT 'same-name' AS reason,
             a.id, a.generated_code, a.email,
             b.id, b.generated_code, b.email
        FROM person_codes a
        JOIN person_codes b
          ON b.account_id = a.account_id
         AND b.id < a.id
         AND LOWER(TRIM(b.display_name)) = LOWER(TRIM(a.display_name))
         AND LENGTH(TRIM(a.display_name)) > 0
         AND LOWER(a.email) <> LOWER(b.email)
       WHERE a.account_id = $1`,
    [accountId],
  )
  return rows.map(r => ({
    reason: r.reason,
    rowAId: r.a_id,
    rowACode: r.a_code,
    rowAEmail: r.a_email,
    rowBId: r.b_id,
    rowBCode: r.b_code,
    rowBEmail: r.b_email,
  }))
}

export interface MergeResult {
  fromCode: string
  intoCode: string
  favoritesUpdated: number
  calendarsUpdated: number
  cacheRowsUpdated: number
  cacheRowsDeleted: number
  memberDeactivated: boolean
}

/**
 * Merge the "from" person_codes row into the "into" row, rewriting every
 * reference that used the losing code. Both rows must belong to the same
 * account. The losing row is deleted; its email is deactivated in
 * account_members if no other person_code still uses it.
 *
 * Rewrites:
 * - user_favorites.person_codes (array element replace)
 * - user_calendars.target_person_code
 * - cached_events.person_code (with dedupe against the winning side)
 * Copies erp_code / azure_object_id / holiday_country onto the winning row
 * when the winner is missing them.
 */
export async function mergePersonCodes(
  accountId: string,
  fromId: string,
  intoId: string,
): Promise<MergeResult> {
  if (fromId === intoId) throw new Error('Cannot merge a row into itself')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query<PersonCodeRecord>(
      'SELECT * FROM person_codes WHERE account_id = $1 AND id = ANY($2)',
      [accountId, [fromId, intoId]],
    )
    const fromRow = rows.find(r => r.id === fromId)
    const intoRow = rows.find(r => r.id === intoId)
    if (!fromRow || !intoRow) {
      throw new Error('One or both person_codes not found for this account')
    }
    const fromCode = fromRow.generated_code
    const intoCode = intoRow.generated_code

    // 1. user_favorites.person_codes — replace the code in every array that
    //    contains it, and dedupe using array_agg(DISTINCT).
    const favResult = await client.query(
      `UPDATE user_favorites
         SET person_codes = ARRAY(
           SELECT DISTINCT CASE WHEN p = $1 THEN $2 ELSE p END
           FROM unnest(person_codes) AS p
         )
       WHERE account_id = $3 AND $1 = ANY(person_codes)`,
      [fromCode, intoCode, accountId],
    )
    const favoritesUpdated = favResult.rowCount ?? 0

    // 2. user_calendars.target_person_code — direct rename (schema predates
    //    account scoping; scope it by the account via person_codes email
    //    membership so we don't touch other accounts' rows).
    const calResult = await client.query(
      `UPDATE user_calendars
         SET target_person_code = $2
       WHERE target_person_code = $1
         AND user_email IN (SELECT email FROM account_members WHERE account_id = $3)`,
      [fromCode, intoCode, accountId],
    )
    const calendarsUpdated = calResult.rowCount ?? 0

    // 3. cached_events.person_code — first delete rows that would collide
    //    with an existing `into` row (same account, source, source_id,
    //    person_code primary key), then rename the rest.
    const cacheDeleteResult = await client.query(
      `DELETE FROM cached_events c
       WHERE c.account_id = $1 AND c.person_code = $2
         AND EXISTS (
           SELECT 1 FROM cached_events d
           WHERE d.account_id = c.account_id
             AND d.source = c.source
             AND d.source_id = c.source_id
             AND d.person_code = $3
         )`,
      [accountId, fromCode, intoCode],
    )
    const cacheRowsDeleted = cacheDeleteResult.rowCount ?? 0

    const cacheUpdateResult = await client.query(
      `UPDATE cached_events SET person_code = $2
       WHERE account_id = $1 AND person_code = $3`,
      [accountId, intoCode, fromCode],
    )
    const cacheRowsUpdated = cacheUpdateResult.rowCount ?? 0

    // 4. Delete the losing row FIRST so attributes we're about to copy to
    //    the winner (erp_code, azure_object_id) don't briefly duplicate
    //    values across two rows and trip the unique indexes.
    await client.query('DELETE FROM person_codes WHERE id = $1', [fromId])

    // 5. Copy missing attributes onto the winner.
    await client.query(
      `UPDATE person_codes SET
         erp_code = COALESCE(erp_code, $2),
         azure_object_id = COALESCE(azure_object_id, $3),
         holiday_country = COALESCE(holiday_country, $4),
         source = CASE
           WHEN source IS NULL OR source = '' THEN $5
           ELSE source
         END,
         updated_at = now()
       WHERE id = $1`,
      [
        intoId,
        fromRow.erp_code,
        fromRow.azure_object_id,
        (fromRow as unknown as { holiday_country?: string }).holiday_country ?? null,
        fromRow.source,
      ],
    )

    // 6. Deactivate the losing email in account_members (only if it differs
    //    from the winning email — no point deactivating our own row).
    let memberDeactivated = false
    if (fromRow.email.toLowerCase() !== intoRow.email.toLowerCase()) {
      const memberResult = await client.query(
        `UPDATE account_members SET active = false
         WHERE account_id = $1 AND LOWER(email) = LOWER($2) AND active = true`,
        [accountId, fromRow.email],
      )
      memberDeactivated = (memberResult.rowCount ?? 0) > 0
    }

    await client.query('COMMIT')
    return {
      fromCode,
      intoCode,
      favoritesUpdated,
      calendarsUpdated,
      cacheRowsUpdated,
      cacheRowsDeleted,
      memberDeactivated,
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
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
