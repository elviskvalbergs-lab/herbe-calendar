import { pool } from '@/lib/db'
import type { Task, TaskSource } from '@/types/task'

export interface CachedTaskRow {
  accountId: string
  userEmail: string
  source: TaskSource
  connectionId: string
  taskId: string
  payload: Record<string, unknown>
}

/**
 * Read cached tasks for a given (account, user, source).
 * Returns the raw `Task` shape.
 */
export async function getCachedTasks(
  accountId: string,
  userEmail: string,
  source: TaskSource,
): Promise<Task[]> {
  const { rows } = await pool.query<{ payload: Task }>(
    `SELECT payload FROM cached_tasks
     WHERE account_id = $1 AND user_email = $2 AND source = $3`,
    [accountId, userEmail, source],
  )
  return rows.map(r => r.payload)
}

/**
 * Upsert cached task rows. Primary key is
 * (account_id, user_email, source, connection_id, task_id).
 */
export async function upsertCachedTasks(
  rows: CachedTaskRow[],
  queryable: { query: (...args: any[]) => Promise<any> } = pool,
): Promise<void> {
  if (rows.length === 0) return

  const values: unknown[] = []
  const placeholders: string[] = []
  let idx = 1
  for (const r of rows) {
    placeholders.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, now())`,
    )
    values.push(r.accountId, r.userEmail, r.source, r.connectionId, r.taskId, JSON.stringify(r.payload))
    idx += 6
  }
  await queryable.query(
    `INSERT INTO cached_tasks (account_id, user_email, source, connection_id, task_id, payload, fetched_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (account_id, user_email, source, connection_id, task_id)
     DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
    values,
  )
}

/**
 * Delete all cached rows for an account+user+source. Used when a live
 * fetch succeeds so orphaned rows (task deleted in source) disappear.
 */
export async function deleteCachedTasksForSource(
  accountId: string,
  userEmail: string,
  source: TaskSource,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM cached_tasks
     WHERE account_id = $1 AND user_email = $2 AND source = $3`,
    [accountId, userEmail, source],
  )
  return rowCount ?? 0
}

/**
 * Write-through: atomically replace an entire source's cache for a user.
 * Runs inside a transaction to avoid an inconsistent window.
 */
export async function replaceCachedTasksForSource(
  accountId: string,
  userEmail: string,
  source: TaskSource,
  rows: CachedTaskRow[],
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM cached_tasks WHERE account_id = $1 AND user_email = $2 AND source = $3`,
      [accountId, userEmail, source],
    )
    await upsertCachedTasks(rows, client)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
