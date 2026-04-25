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
  const { main, cc } = parsePersons(r)

  const task: Task = {
    id: `herbe:${sernr}`,
    source: 'herbe',
    sourceConnectionId: connectionId,
    title: String(r['Comment'] ?? ''),
    description: undefined,
    dueDate: transDate || undefined,
    done: String(r['OKFlag'] ?? '0') === '1',
    listName: connectionName || undefined,
    mainPersons: main.length > 0 ? main : undefined,
    ccPersons: cc.length > 0 ? cc : undefined,
    erp: {
      activityTypeCode: String(r['ActType'] ?? '') || undefined,
      projectCode: String(r['PRCode'] ?? '') || undefined,
      projectName: prName || undefined,
      customerCode: String(r['CUCode'] ?? '') || undefined,
      customerName: cuName || undefined,
      textInMatrix: textValue || undefined,
    },
  }
  // personCode kept for signature symmetry with mapHerbeRecord.
  void personCode
  // Surface project/customer in ERP metadata on the Task (used for copy-to-event pre-fill).
  void prName; void cuName
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
  // Two server-side optimisations vs the naive "fetch every ActVc in the
  // range" query: filter.TodoFlag=1 tells ERP to send only task records
  // (calendar events are the overwhelming majority in busy accounts), and
  // fields= trims each row to the handful the task mapper actually reads.
  // Together these often cut the fetch from tens of seconds to a second or
  // two on large connections.
  const raw = await herbeFetchAll(REGISTERS.activities, {
    sort: 'TransDate',
    range: `${fmt(from)}:${fmt(to)}`,
    'filter.TodoFlag': '1',
    fields: 'SerNr,Comment,TransDate,OKFlag,TodoFlag,MainPersons,CCPersons,ActType,PRCode,PRName,CUCode,CUName,Text',
  }, 500, conn)

  const tasks: Task[] = []
  let taskCount = 0
  let matchedForUser = 0
  for (const record of raw) {
    const r = record as Record<string, unknown>
    if (!isTaskRecord(r)) continue
    taskCount++
    const { main, cc } = parsePersons(r)
    const mainSet = new Set(main)
    const allPersons = [...main, ...cc.filter(p => !mainSet.has(p))]
    for (const p of allPersons) {
      if (personSet.has(p)) {
        tasks.push(mapHerbeTask(r, p, conn.id, conn.name))
        matchedForUser++
        break // one task per record, not per person
      }
    }
  }
  console.log(`[tasks/erp] ${conn.name}: fetched ${raw.length} records, ${taskCount} tasks, ${matchedForUser} matched user ${[...personSet].join(',')}`)
  return tasks
}

export function buildCompleteTaskBody(done: boolean): Record<string, string> {
  return { OKFlag: done ? '1' : '0' }
}

export interface CreateTaskInput {
  title: string
  description?: string
  /** Fallback main person when `mainPersons` is empty — typically the session user's code. */
  personCode: string
  /** Full main-person list picked in the form. Takes precedence over `personCode`. */
  mainPersons?: string[]
  dueDate?: string
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
  ccPersons?: string[]
}

export function buildCreateTaskBody(input: CreateTaskInput): Record<string, string> {
  // Always stamp TransDate. Without it, the record is excluded from the
  // task fetcher's date-range query and disappears from the sidebar.
  const today = new Date().toISOString().slice(0, 10)
  const mainPersons = input.mainPersons && input.mainPersons.length > 0
    ? input.mainPersons.join(',')
    : input.personCode
  const body: Record<string, string> = {
    TodoFlag: '1',
    Comment: input.title,
    MainPersons: mainPersons,
    TransDate: input.dueDate ?? today,
  }
  if (input.description) body.Text = input.description
  if (input.activityTypeCode) body.ActType = input.activityTypeCode
  if (input.projectCode) body.PRCode = input.projectCode
  if (input.customerCode) body.CUCode = input.customerCode
  if (input.ccPersons && input.ccPersons.length > 0) body.CCPersons = input.ccPersons.join(',')
  return body
}

export interface EditTaskInput {
  title?: string
  description?: string
  dueDate?: string
  mainPersons?: string[]
  ccPersons?: string[]
  activityTypeCode?: string
  projectCode?: string
  customerCode?: string
}

export function buildEditTaskBody(input: EditTaskInput): Record<string, string> {
  const body: Record<string, string> = {}
  if (input.title !== undefined) body.Comment = input.title
  if (input.description !== undefined) body.Text = input.description
  if (input.dueDate !== undefined) body.TransDate = input.dueDate
  if (input.mainPersons !== undefined) body.MainPersons = input.mainPersons.join(',')
  if (input.ccPersons !== undefined) body.CCPersons = input.ccPersons.join(',')
  if (input.activityTypeCode !== undefined) body.ActType = input.activityTypeCode
  if (input.projectCode !== undefined) body.PRCode = input.projectCode
  if (input.customerCode !== undefined) body.CUCode = input.customerCode
  return body
}
