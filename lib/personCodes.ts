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
 * Fetches all codes with the same prefix in one query to avoid N+1 round-trips.
 */
export async function findUniqueCode(baseCode: string, accountId: string, excludeEmail?: string): Promise<string> {
  // Fetch all codes starting with baseCode in one query
  const { rows } = await pool.query<{ generated_code: string }>(
    'SELECT generated_code FROM person_codes WHERE account_id = $1 AND generated_code LIKE $2'
      + (excludeEmail ? ' AND email != $3' : ''),
    excludeEmail ? [accountId, `${baseCode}%`, excludeEmail] : [accountId, `${baseCode}%`]
  )
  const taken = new Set(rows.map(r => r.generated_code))

  if (!taken.has(baseCode)) return baseCode

  for (let i = 2; i < 100; i++) {
    const candidate = `${baseCode}${i}`
    if (!taken.has(candidate)) return candidate
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

  // Build a set of all existing codes for in-memory uniqueness resolution
  const takenCodes = new Set(existing.map(r => r.generated_code))

  /** Resolve a unique code entirely in-memory (0 DB queries). */
  function resolveUniqueCode(baseCode: string): string {
    if (!takenCodes.has(baseCode)) { takenCodes.add(baseCode); return baseCode }
    for (let i = 2; i < 100; i++) {
      const candidate = `${baseCode}${i}`
      if (!takenCodes.has(candidate)) { takenCodes.add(candidate); return candidate }
    }
    throw new Error(`Could not generate unique code for base "${baseCode}"`)
  }

  // --- Phase 1: compute all operations (pure, no DB queries) ---
  const detachIds: string[] = []  // row IDs to null out azure_object_id
  const updates: { id: string; displayName: string; source: string; azureObjectId: string | null; erpCode: string | null; email: string }[] = []
  const inserts: { azureObjectId: string | null; erpCode: string | null; code: string; email: string; displayName: string; source: string }[] = []

  for (const [emailKey, { erp, azure, google }] of merged) {
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

    // Check for azure_object_id conflicts that need detaching
    if (azureObjectId) {
      const conflicting = byAzureId.get(azureObjectId)
      if (conflicting && (!existingRecord || conflicting.id !== existingRecord.id)) {
        detachIds.push(conflicting.id)
        byAzureId.delete(azureObjectId)
      }
    }

    if (existingRecord) {
      updates.push({ id: existingRecord.id, displayName, source, azureObjectId, erpCode, email })
    } else {
      const code = erpCode ?? resolveUniqueCode(generateCode(displayName))
      inserts.push({ azureObjectId, erpCode, code, email, displayName, source })
    }
  }

  // --- Phase 2: execute batched DB operations ---
  const results: PersonCodeRecord[] = []

  // Batch detach conflicting azure_object_ids
  if (detachIds.length > 0) {
    await pool.query(
      'UPDATE person_codes SET azure_object_id = NULL, updated_at = now() WHERE id = ANY($1::uuid[])',
      [detachIds],
    )
  }

  // Batch updates using UPDATE FROM VALUES
  if (updates.length > 0) {
    const values: unknown[] = []
    const placeholders: string[] = []
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i]
      const off = i * 6
      placeholders.push(`($${off + 1}::uuid, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6})`)
      values.push(u.id, u.displayName, u.source, u.azureObjectId, u.erpCode, u.email)
    }
    const { rows } = await pool.query<PersonCodeRecord>(
      `UPDATE person_codes AS pc
       SET display_name = v.display_name,
           source = v.source,
           azure_object_id = CASE WHEN v.azure_object_id IS NOT NULL THEN v.azure_object_id ELSE pc.azure_object_id END,
           erp_code = CASE WHEN v.erp_code IS NOT NULL THEN v.erp_code ELSE pc.erp_code END,
           email = v.email,
           updated_at = now()
       FROM (VALUES ${placeholders.join(', ')})
         AS v(id, display_name, source, azure_object_id, erp_code, email)
       WHERE pc.id = v.id
       RETURNING pc.*`,
      values,
    )
    results.push(...rows)
  }

  // Batch inserts using multi-row INSERT ON CONFLICT
  if (inserts.length > 0) {
    const values: unknown[] = []
    const placeholders: string[] = []
    for (let i = 0; i < inserts.length; i++) {
      const ins = inserts[i]
      const off = i * 7
      placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7})`)
      values.push(accountId, ins.azureObjectId || null, ins.erpCode, ins.code, ins.email, ins.displayName, ins.source)
    }
    const { rows } = await pool.query<PersonCodeRecord>(
      `INSERT INTO person_codes (account_id, azure_object_id, erp_code, generated_code, email, display_name, source)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (account_id, LOWER(email)) DO UPDATE SET updated_at = now()
       RETURNING *`,
      values,
    )
    results.push(...rows)
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

export interface MemberReferenceCounts {
  favoritesReferencing: number
  sharedCalendars: number
  cachedEvents: number
}

/**
 * Count the references that would be affected by deleting a member.
 * The caller decides whether to refuse deletion or cascade-delete.
 */
export async function countMemberReferences(
  accountId: string,
  email: string,
  generatedCode: string | null,
  queryFn: { query: typeof pool.query } = pool,
): Promise<MemberReferenceCounts> {
  const code = generatedCode ?? ''
  const q = queryFn.query.bind(queryFn)
  const [favs, cals, cached] = await Promise.all([
    code
      ? q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM user_favorites
           WHERE account_id = $1 AND $2 = ANY(person_codes)`,
          [accountId, code],
        )
      : Promise.resolve({ rows: [{ n: 0 }] }),
    code
      ? q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM user_calendars
           WHERE target_person_code = $1
             AND user_email IN (SELECT email FROM account_members WHERE account_id = $2)`,
          [code, accountId],
        )
      : Promise.resolve({ rows: [{ n: 0 }] }),
    code
      ? q<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM cached_events
           WHERE account_id = $1 AND person_code = $2`,
          [accountId, code],
        )
      : Promise.resolve({ rows: [{ n: 0 }] }),
  ])
  return {
    favoritesReferencing: favs.rows[0]?.n ?? 0,
    sharedCalendars: cals.rows[0]?.n ?? 0,
    cachedEvents: cached.rows[0]?.n ?? 0,
  }
}

export interface DeleteResult {
  accountMemberDeleted: boolean
  personCodeDeleted: boolean
  favoritesUpdated: number
  calendarsDeleted: number
  cachedEventsDeleted: number
}

/**
 * Hard delete a member: removes the account_members row, the person_code
 * row (if any), and optionally cascades into references. When `cascade`
 * is false the delete refuses if anything references the code; when
 * `cascade` is true it removes references too.
 */
export async function deleteMember(
  accountId: string,
  email: string,
  generatedCode: string | null,
  cascade: boolean,
): Promise<DeleteResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (generatedCode && !cascade) {
      const refs = await countMemberReferences(accountId, email, generatedCode, client)
      if (refs.favoritesReferencing + refs.sharedCalendars + refs.cachedEvents > 0) {
        await client.query('ROLLBACK')
        throw new Error(
          `Cannot delete — code "${generatedCode}" is still referenced ` +
          `(${refs.favoritesReferencing} favorites, ${refs.sharedCalendars} shared calendars, ${refs.cachedEvents} cached events). ` +
          `Use cascade to remove them.`,
        )
      }
    }

    let favoritesUpdated = 0
    let calendarsDeleted = 0
    let cachedEventsDeleted = 0
    if (generatedCode && cascade) {
      const favResult = await client.query(
        `UPDATE user_favorites
           SET person_codes = ARRAY(
             SELECT p FROM unnest(person_codes) AS p WHERE p <> $1
           )
         WHERE account_id = $2 AND $1 = ANY(person_codes)`,
        [generatedCode, accountId],
      )
      favoritesUpdated = favResult.rowCount ?? 0

      const calResult = await client.query(
        `DELETE FROM user_calendars
         WHERE target_person_code = $1
           AND user_email IN (SELECT email FROM account_members WHERE account_id = $2)`,
        [generatedCode, accountId],
      )
      calendarsDeleted = calResult.rowCount ?? 0

      const cacheResult = await client.query(
        `DELETE FROM cached_events WHERE account_id = $1 AND person_code = $2`,
        [accountId, generatedCode],
      )
      cachedEventsDeleted = cacheResult.rowCount ?? 0
    }

    let personCodeDeleted = false
    if (generatedCode) {
      const pcResult = await client.query(
        `DELETE FROM person_codes WHERE account_id = $1 AND generated_code = $2`,
        [accountId, generatedCode],
      )
      personCodeDeleted = (pcResult.rowCount ?? 0) > 0
    }

    const amResult = await client.query(
      `DELETE FROM account_members
       WHERE account_id = $1 AND LOWER(email) = LOWER($2)`,
      [accountId, email],
    )
    const accountMemberDeleted = (amResult.rowCount ?? 0) > 0

    await client.query('COMMIT')
    return {
      accountMemberDeleted,
      personCodeDeleted,
      favoritesUpdated,
      calendarsDeleted,
      cachedEventsDeleted,
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export interface DuplicateCandidate {
  reason: string
  rowAId: string
  rowACode: string
  rowAEmail: string
  rowAErpCode: string | null
  rowASource: string | null
  rowADisplayName: string
  rowBId: string
  rowBCode: string
  rowBEmail: string
  rowBErpCode: string | null
  rowBSource: string | null
  rowBDisplayName: string
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
    a_id: string; a_code: string; a_email: string; a_erp: string | null; a_source: string | null; a_name: string
    b_id: string; b_code: string; b_email: string; b_erp: string | null; b_source: string | null; b_name: string
  }>(
    `SELECT 'cross-code' AS reason,
            a.id AS a_id, a.generated_code AS a_code, a.email AS a_email, a.erp_code AS a_erp, a.source AS a_source, a.display_name AS a_name,
            b.id AS b_id, b.generated_code AS b_code, b.email AS b_email, b.erp_code AS b_erp, b.source AS b_source, b.display_name AS b_name
       FROM person_codes a
       JOIN person_codes b
         ON b.account_id = a.account_id
        AND b.id <> a.id
        AND b.generated_code = a.erp_code
      WHERE a.account_id = $1 AND a.erp_code IS NOT NULL
        AND a.erp_code <> a.generated_code
      UNION ALL
      SELECT 'email-duplicate' AS reason,
             a.id, a.generated_code, a.email, a.erp_code, a.source, a.display_name,
             b.id, b.generated_code, b.email, b.erp_code, b.source, b.display_name
        FROM person_codes a
        JOIN person_codes b
          ON b.account_id = a.account_id
         AND b.id < a.id
         AND LOWER(b.email) = LOWER(a.email)
       WHERE a.account_id = $1
      UNION ALL
      SELECT 'same-name' AS reason,
             a.id, a.generated_code, a.email, a.erp_code, a.source, a.display_name,
             b.id, b.generated_code, b.email, b.erp_code, b.source, b.display_name
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
    rowAId: r.a_id, rowACode: r.a_code, rowAEmail: r.a_email,
    rowAErpCode: r.a_erp, rowASource: r.a_source, rowADisplayName: r.a_name,
    rowBId: r.b_id, rowBCode: r.b_code, rowBEmail: r.b_email,
    rowBErpCode: r.b_erp, rowBSource: r.b_source, rowBDisplayName: r.b_name,
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

    // Previously this step also deactivated the losing email in
    // account_members. That was a mistake: after a subsequent ERP/Azure
    // sync, the winning person_code's email can switch *to* the losing
    // email (common when the admin enters the new address in ERP before
    // merging), which would leave the merged person visible as inactive.
    // Leave account_members alone; orphan rows can be reviewed and
    // deleted explicitly via the delete action.
    const memberDeactivated = false

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
