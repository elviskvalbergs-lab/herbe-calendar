import { herbeFetchAll } from './client'
import { REGISTERS } from './constants'
import { getErpConnections } from '@/lib/accountConfig'
import { parsePersons } from './recordUtils'
import type { ErpConnection } from '@/lib/accountConfig'
import type { Task } from '@/types/task'

/** Returns true if a Herbe record is a task (TodoFlag='1'). */
export function isTaskRecord(r: Record<string, unknown>): boolean {
  return String(r['TodoFlag'] ?? '') === '1'
}

/** Map a Herbe task record to the unified Task shape. */
export function mapHerbeTask(
  r: Record<string, unknown>,
  personCode: string,
  connectionId: string,
  connectionName: string,
): Task {
  const sernr = String(r['SerNr'] ?? '')
  const transDate = String(r['TransDate'] ?? '')
  const prName = String(r['PRName'] ?? '')
  const cuName = String(r['CUName'] ?? '')
  const rows = r['rows'] as Record<string, unknown>[] | undefined
  let textValue = String(r['Text'] ?? '')
  if (!textValue && rows && rows.length > 0) {
    textValue = rows.map(row => String(row['Text'] ?? '')).filter(Boolean).join('\n')
  }

  const task: Task = {
    id: `herbe:${sernr}`,
    source: 'herbe',
    sourceConnectionId: connectionId,
    title: String(r['Comment'] ?? ''),
    description: undefined,
    dueDate: transDate || undefined,
    done: String(r['OKFlag'] ?? '0') === '1',
    listName: prName || cuName || undefined,
    erp: {
      activityTypeCode: String(r['ActType'] ?? '') || undefined,
      projectCode: String(r['PRCode'] ?? '') || undefined,
      projectName: prName || undefined,
      customerCode: String(r['CUCode'] ?? '') || undefined,
      customerName: cuName || undefined,
      textInMatrix: textValue || undefined,
    },
  }
  // Silence unused-var for personCode/connectionName (kept in signature for symmetry with mapHerbeRecord).
  void personCode
  void connectionName
  return task
}

/** Fetch ERP tasks for the signed-in user across all ERP connections. */
export async function fetchErpTasks(
  accountId: string,
  personCodes: string[],
): Promise<{ tasks: Task[]; errors: { connection: string; msg: string }[] }> {
  const result: { tasks: Task[]; errors: { connection: string; msg: string }[] } = {
    tasks: [],
    errors: [],
  }

  let connections: ErpConnection[] = []
  try {
    connections = await getErpConnections(accountId)
  } catch (e) {
    result.errors.push({ connection: '(all)', msg: String(e) })
    return result
  }

  const perConn = await Promise.all(connections.map(async conn => {
    try {
      const tasks = await fetchErpTasksForConnection(conn, personCodes)
      return { tasks, error: null }
    } catch (e) {
      return { tasks: [] as Task[], error: { connection: conn.name, msg: String(e) } }
    }
  }))
  for (const r of perConn) {
    result.tasks.push(...r.tasks)
    if (r.error) result.errors.push(r.error)
  }
  return result
}

async function fetchErpTasksForConnection(conn: ErpConnection, personCodes: string[]): Promise<Task[]> {
  const personSet = new Set(personCodes)
  const today = new Date()
  // Window: 1 year back (done tasks) + 6 months forward. Wider ranges blow
  // past MAX_PAGES on busy ERPs and truncate the most recent records.
  const from = new Date(today); from.setFullYear(from.getFullYear() - 1)
  const to = new Date(today); to.setMonth(to.getMonth() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const raw = await herbeFetchAll(REGISTERS.activities, {
    sort: 'TransDate',
    range: `${fmt(from)}:${fmt(to)}`,
  }, 500, conn)

  const tasks: Task[] = []
  for (const record of raw) {
    const r = record as Record<string, unknown>
    if (!isTaskRecord(r)) continue
    const { main, cc } = parsePersons(r)
    const mainSet = new Set(main)
    const allPersons = [...main, ...cc.filter(p => !mainSet.has(p))]
    for (const p of allPersons) {
      if (personSet.has(p)) {
        tasks.push(mapHerbeTask(r, p, conn.id, conn.name))
        break // one task per record, not per person
      }
    }
  }
  return tasks
}

export function buildCompleteTaskBody(done: boolean): Record<string, string> {
  return { OKFlag: done ? '1' : '0' }
}

export interface CreateTaskInput {
  title: string
  description?: string
  personCode: string
  dueDate?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
}

export function buildCreateTaskBody(input: CreateTaskInput): Record<string, string> {
  // Always stamp TransDate. Without it, the record is excluded from the
  // task fetcher's date-range query and disappears from the sidebar.
  const today = new Date().toISOString().slice(0, 10)
  const body: Record<string, string> = {
    TodoFlag: '1',
    Comment: input.title,
    MainPersons: input.personCode,
    TransDate: input.dueDate ?? today,
  }
  if (input.description) body.Text = input.description
  if (input.activityTypeCode) body.ActType = input.activityTypeCode
  if (input.projectCode) body.PRCode = input.projectCode
  if (input.customerCode) body.CUCode = input.customerCode
  return body
}

export interface EditTaskInput {
  title?: string
  description?: string
  dueDate?: string
}

export function buildEditTaskBody(input: EditTaskInput): Record<string, string> {
  const body: Record<string, string> = {}
  if (input.title !== undefined) body.Comment = input.title
  if (input.description !== undefined) body.Text = input.description
  if (input.dueDate !== undefined) body.TransDate = input.dueDate
  return body
}
