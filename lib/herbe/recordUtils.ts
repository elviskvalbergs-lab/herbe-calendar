import { herbeFetchAll } from './client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from './constants'
import { getErpConnections } from '@/lib/accountConfig'
import type { Activity } from '@/types'
import type { ErpConnection } from '@/lib/accountConfig'

/** "HH:mm:ss" or "HH:mm" → "HH:mm" */
export function toTime(raw: string): string {
  return (raw ?? '').slice(0, 5)
}

/** Returns true if the record is a calendar entry (not a task or done item) */
export function isCalendarRecord(r: Record<string, unknown>): boolean {
  const todoFlag = String(r['TodoFlag'] ?? '0')
  return todoFlag === '0' || todoFlag === ''
}

/** Parse person lists from a Herbe record */
export function parsePersons(r: Record<string, unknown>): { main: string[]; cc: string[] } {
  const main = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const cc = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { main, cc }
}

export interface MapHerbeOptions {
  /** Include private fields like customerCode, projectCode, itemCode, textInMatrix, accessGroup */
  includePrivateFields?: boolean
  erpConnectionId?: string
  erpConnectionName?: string
}

/** Map a raw Herbe ERP record to an Activity */
export function mapHerbeRecord(r: Record<string, unknown>, personCode: string, opts: MapHerbeOptions = {}): Activity {
  const { main, cc } = parsePersons(r)

  const base: Activity = {
    id: String(r['SerNr'] ?? ''),
    source: 'herbe',
    personCode,
    description: String(r['Comment'] ?? ''),
    date: String(r['TransDate'] ?? ''),
    timeFrom: toTime(String(r['StartTime'] ?? '')),
    timeTo: toTime(String(r['EndTime'] ?? '')),
    activityTypeCode: String(r['ActType'] ?? '') || undefined,
    customerName: String(r['CUName'] ?? '') || undefined,
    projectName: String(r['PRName'] ?? r['PRComment'] ?? '') || undefined,
    mainPersons: main.length ? main : undefined,
    ccPersons: cc.length ? cc : undefined,
    planned: String(r['CalTimeFlag'] ?? '1') === '2',
    okFlag: String(r['OKFlag'] ?? '0') === '1',
  }

  if (opts.includePrivateFields) {
    const rows = r['rows'] as Record<string, unknown>[] | undefined
    let textValue = String(r['Text'] ?? '')
    if (!textValue && rows && rows.length > 0) {
      textValue = rows
        .map(row => String(row['Text'] ?? ''))
        .filter(s => s !== '')
        .join('\n')
    }
    base.customerCode = String(r['CUCode'] ?? '') || undefined
    base.projectCode = String(r['PRCode'] ?? '') || undefined
    base.itemCode = String(r['ItemCode'] ?? '') || undefined
    base.textInMatrix = textValue || undefined
    base.accessGroup = String(r[ACTIVITY_ACCESS_GROUP_FIELD] ?? '') || undefined
  }

  if (opts.erpConnectionId) {
    base.erpConnectionId = opts.erpConnectionId
    base.erpConnectionName = opts.erpConnectionName
  }

  return base
}

/**
 * Fetch ERP calendar activities for a set of person codes across all connections.
 * Returns Activity[] with both main person and CC person rows.
 */
export async function fetchErpActivities(
  accountId: string,
  personCodes: string[],
  dateFrom: string,
  dateTo: string,
  opts: { includePrivateFields?: boolean } = {}
): Promise<Activity[]> {
  let connections: ErpConnection[] = []
  try {
    connections = await getErpConnections(accountId)
  } catch (e) {
    console.error('[herbe/recordUtils] getErpConnections failed:', e)
    return []
  }

  const perConn = await Promise.all(connections.map(conn =>
    fetchErpActivitiesForConnection(conn, personCodes, dateFrom, dateTo, opts)
  ))
  return perConn.flat()
}

/**
 * Live-fetch ERP activities from a single connection, mapped to Activity[]
 * and filtered to the requested person codes (main + CC). Non-throwing —
 * logs and returns [] on failure so a broken connection doesn't poison the
 * caller's union of results.
 */
export async function fetchErpActivitiesForConnection(
  conn: ErpConnection,
  personCodes: string[],
  dateFrom: string,
  dateTo: string,
  opts: { includePrivateFields?: boolean } = {}
): Promise<Activity[]> {
  const personSet = new Set(personCodes)
  const results: Activity[] = []
  try {
    const raw = await herbeFetchAll(REGISTERS.activities, {
      sort: 'TransDate',
      range: `${dateFrom}:${dateTo}`,
    }, 100, conn)

    const calendarRecords = raw.filter(r => isCalendarRecord(r as Record<string, unknown>))

    for (const record of calendarRecords) {
      const r = record as Record<string, unknown>
      const { main, cc } = parsePersons(r)
      const mapOpts: MapHerbeOptions = {
        includePrivateFields: opts.includePrivateFields,
        erpConnectionId: conn.id,
        erpConnectionName: conn.name !== 'Default (env)' ? conn.name : undefined,
      }

      for (const p of main) {
        if (personSet.has(p)) {
          results.push(mapHerbeRecord(r, p, mapOpts))
        }
      }
      for (const ccCode of cc) {
        if (personSet.has(ccCode) && !main.includes(ccCode)) {
          results.push(mapHerbeRecord(r, ccCode, mapOpts))
        }
      }
    }
  } catch (e) {
    console.warn(`[herbe/recordUtils] ERP "${conn.name}" failed:`, String(e))
  }
  return results
}
