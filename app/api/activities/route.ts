import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch, herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { extractHerbeError } from '@/lib/herbe/errors'
import { getErpConnections } from '@/lib/accountConfig'
import { trackEvent } from '@/lib/analytics'
import type { Activity } from '@/types'

function toTime(raw: string): string {
  // "HH:mm:ss" or "HH:mm" → "HH:mm"
  return (raw ?? '').slice(0, 5)
}

function mapActivity(r: Record<string, unknown>, personCode: string): Activity {
  const mainPersonsRaw = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ccPersonsRaw = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  // Text lives in row 0 of the Herbe record — may come back flat as r['Text']
  // or nested under r['rows']?.[0]?.['Text'] depending on the API endpoint
  const rows = r['rows'] as Record<string, unknown>[] | undefined
  let textValue = String(r['Text'] ?? '')
  if (!textValue && rows && rows.length > 0) {
    textValue = rows
      .map(row => String(row['Text'] ?? ''))
      .filter(s => s !== '')
      .join('\n')
  }
  const finalTextValue = textValue || undefined
  return {
    id: String(r['SerNr'] ?? ''),
    source: 'herbe',
    personCode,
    mainPersons: mainPersonsRaw.length ? mainPersonsRaw : undefined,
    ccPersons: ccPersonsRaw.length ? ccPersonsRaw : undefined,
    description: String(r['Comment'] ?? ''),
    date: String(r['TransDate'] ?? ''),
    timeFrom: toTime(String(r['StartTime'] ?? '')),
    timeTo: toTime(String(r['EndTime'] ?? '')),
    activityTypeCode: String(r['ActType'] ?? '') || undefined,
    customerCode: String(r['CUCode'] ?? '') || undefined,
    customerName: String(r['CUName'] ?? '') || undefined,
    projectCode: String(r['PRCode'] ?? '') || undefined,
    projectName: String(r['PRName'] ?? r['PRComment'] ?? '') || undefined,
    itemCode: String(r['ItemCode'] ?? '') || undefined,
    textInMatrix: finalTextValue,
    accessGroup: String(r[ACTIVITY_ACCESS_GROUP_FIELD] ?? '') || undefined,
    planned: String(r['CalTimeFlag'] ?? '1') === '2',
  }
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const persons = searchParams.get('persons')
  const date = searchParams.get('date')
  const dateFrom = searchParams.get('dateFrom') ?? date
  const dateTo = searchParams.get('dateTo') ?? date

  if (!persons) return NextResponse.json({ error: 'persons required' }, { status: 400 })
  if (!dateFrom) return NextResponse.json({ error: 'date required' }, { status: 400 })

  try {
    const personList = persons.split(',').map(p => p.trim())
    const personSet = new Set(personList)

    // Fetch from all active ERP connections
    let connections: Awaited<ReturnType<typeof getErpConnections>> = []
    try {
      connections = await getErpConnections(session.accountId)
    } catch (e) {
      console.error('[activities] getErpConnections failed:', e)
      return NextResponse.json({ error: `ERP config error: ${String(e)}` }, { status: 500 })
    }
    console.log(`[activities] Found ${connections.length} ERP connections, persons: ${persons}, date: ${dateFrom}`)
    if (connections.length === 0) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
    }
    const allResults: Activity[] = []

    await Promise.all(connections.map(async (conn) => {
      try {
        const raw = await herbeFetchAll(REGISTERS.activities, {
          sort: 'TransDate',
          range: `${dateFrom}:${dateTo}`,
        }, 100, conn)

        // Filter to calendar entries only (TodoFlag 0 or empty = calendar, 1 = task, 2 = done)
        const calendarRecords = raw.filter(r => {
          const todoFlag = String((r as Record<string, unknown>)['TodoFlag'] ?? '0')
          return todoFlag === '0' || todoFlag === ''
        })

        const results: Activity[] = calendarRecords.flatMap(r => {
          const rec = r as Record<string, unknown>
          const mainPersons = String(rec['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
          return mainPersons
            .filter(p => personSet.has(p))
            .map(p => ({ ...mapActivity(rec, p), erpConnectionId: conn.id, erpConnectionName: conn.name !== 'Default (env)' ? conn.name : undefined }))
        })

        // Emit CC rows
        for (const record of calendarRecords) {
          const r = record as Record<string, unknown>
          const mainPersonsArr = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
          const ccPersonsArr = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
          for (const ccCode of ccPersonsArr) {
            if (personList.includes(ccCode) && !mainPersonsArr.includes(ccCode)) {
              results.push({ ...mapActivity(r, ccCode), erpConnectionId: conn.id, erpConnectionName: conn.name !== 'Default (env)' ? conn.name : undefined })
            }
          }
        }

        allResults.push(...results)
      } catch (e) {
        console.warn(`[activities] ERP connection "${conn.name}" failed:`, String(e))
      }
    }))

    // Track day_viewed (fire-and-forget)
    if (dateFrom && session.email) {
      trackEvent(session.accountId, session.email, 'day_viewed', { date: dateFrom }).catch(() => {})
    }

    return NextResponse.json(allResults, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Fields that live on row 0 of the activity record, not the header
const ROW_FIELDS = new Set(['Text'])

export function toHerbeForm(
  data: Record<string, unknown>,
  allowEmptyFields: Set<string> = new Set()
): string {
  const parts: string[] = []
  
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue
    if (v === '' && !allowEmptyFields.has(k)) continue

    if (k === 'Text') {
      const text = String(v)
      if (!text) {
        parts.push(`set_row_field.0.Text=`)
      } else {
        const lines = text.split('\n')
        const chunks: string[] = []
        for (const line of lines) {
          if (line.length === 0) {
            chunks.push('')
            continue
          }
          const words = line.split(' ')
          let currentChunk = ''
          for (const word of words) {
            if (!currentChunk) {
              currentChunk = word
            } else if (currentChunk.length + 1 + word.length <= 100) {
              currentChunk += ' ' + word
            } else {
              chunks.push(currentChunk)
              currentChunk = word
            }
            while (currentChunk.length > 100) {
              chunks.push(currentChunk.slice(0, 100))
              currentChunk = currentChunk.slice(100)
            }
          }
          if (currentChunk) chunks.push(currentChunk)
        }
        
        chunks.forEach((chunk, i) => {
          parts.push(`set_row_field.${i}.Text=${encodeURIComponent(chunk)}`)
        })
        // Clear up to 10 subsequent rows to avoid leftover text if the new text is shorter
        for (let i = chunks.length; i < chunks.length + 10; i++) {
          parts.push(`set_row_field.${i}.Text=`)
        }
      }
      continue
    }
    
    parts.push(`set_field.${k}=${encodeURIComponent(String(v))}`)
  }
  
  return parts.join('&')
}

export async function POST(req: NextRequest) {
  let postSession
  try {
    postSession = await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    // Resolve ERP connection for this request
    const connectionId = new URL(req.url).searchParams.get('connectionId')
    const connections = await getErpConnections(postSession.accountId)
    const conn = connectionId ? connections.find(c => c.id === connectionId) : connections[0]

    const body = await req.json()
    const formBody = toHerbeForm(body, new Set(['CCPersons']))
    const res = await herbeFetch(REGISTERS.activities, undefined, {
      method: 'POST',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    }, conn)
    const data = await res.json().catch(() => null)
    console.log(`POST ActVc → ${res.status}`, JSON.stringify(data))
    if (!res.ok) {
      const errMsg = data ? extractHerbeError(data) : `Herbe error ${res.status}`
      return NextResponse.json({ error: errMsg }, { status: res.status })
    }
    // Check for Herbe validation errors returned with HTTP 200 (errors array)
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = (data.errors as unknown[]).map(e => extractHerbeError(e))
      return NextResponse.json({ error: msgs[0], errors: msgs.map(m => ({ message: m })) }, { status: 422 })
    }
    // Extract the created record so SerNr is at top level
    const created = (data?.data?.[REGISTERS.activities] as Record<string, unknown>[] | undefined)?.[0]
    // If Herbe returned an empty result (no record created), it likely rejected due to a validation rule
    if (!created?.['SerNr']) {
      // Build a helpful error from whatever Herbe returned
      const rawErr = data?.error ?? data?.message ?? data?.errors
      const hint = rawErr
        ? extractHerbeError(rawErr)
        : `Activity was not saved — Herbe response: ${JSON.stringify(data).slice(0, 300)}`
      return NextResponse.json({ error: hint }, { status: 422 })
    }
    trackEvent(postSession.accountId, postSession.email, 'activity_created').catch(() => {})
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
