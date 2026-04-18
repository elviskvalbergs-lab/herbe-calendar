import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/adminAuth'
import { getAdminAccountId, getAllAccounts } from '@/lib/adminAccountId'
import AdminShell from '@/components/AdminShell'
import { pool } from '@/lib/db'
import { findDuplicatePersonCodes } from '@/lib/personCodes'
import MembersClient from './MembersClient'

export default async function MembersPage() {
  const overrideAccountId = await getAdminAccountId()
  let session
  try {
    session = await requireAdminSession('admin', overrideAccountId)
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') redirect('/login')
    redirect('/cal')
  }
  const accounts = session.isSuperAdmin ? await getAllAccounts() : []

  // Include orphan person_codes rows — ones that have no matching
  // account_members entry. These still appear in the user selector via
  // /api/users (which reads person_codes directly), so hiding them from
  // the admin list leaves ghosts the admin can't manage. We surface them
  // as is_orphan=true so the UI can disable the role/active toggles and
  // flag them for cleanup (merge or delete).
  const [{ rows: members }, duplicates] = await Promise.all([
    pool.query(
      `SELECT am.email, am.role, am.active, am.last_login, am.created_at,
              pc.id AS person_code_id, pc.generated_code, pc.erp_code, pc.display_name, pc.source, pc.holiday_country,
              false AS is_orphan
         FROM account_members am
         LEFT JOIN person_codes pc
           ON LOWER(pc.email) = LOWER(am.email)
          AND pc.account_id = am.account_id
        WHERE am.account_id = $1
       UNION ALL
       SELECT pc.email, NULL::account_role AS role, false AS active,
              NULL::timestamptz AS last_login, NULL::timestamptz AS created_at,
              pc.id AS person_code_id, pc.generated_code, pc.erp_code, pc.display_name, pc.source, pc.holiday_country,
              true AS is_orphan
         FROM person_codes pc
        WHERE pc.account_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM account_members am
             WHERE am.account_id = pc.account_id
               AND LOWER(am.email) = LOWER(pc.email)
          )
       ORDER BY is_orphan ASC, active DESC, display_name ASC NULLS LAST`,
      [session.accountId]
    ),
    findDuplicatePersonCodes(session.accountId),
  ])

  return (
    <AdminShell email={session.email} accountName={session.accountName} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} accounts={accounts}>
      <h1 className="text-xl font-bold mb-6">Members</h1>
      <MembersClient members={members} accountId={session.accountId} isSuperAdmin={session.isSuperAdmin} duplicates={duplicates} />
    </AdminShell>
  )
}
