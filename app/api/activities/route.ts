import { NextRequest, NextResponse } from 'next/server'
import { herbeFetch, herbeFetchAll } from '@/lib/herbe/client'
import { REGISTERS, ACTIVITY_ACCESS_GROUP_FIELD } from '@/lib/herbe/constants'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import type { Activity } from '@/types'

function toTime(raw: string): string {
  // "HH:mm:ss" or "HH:mm" → "HH:mm"
  return (raw ?? '').slice(0, 5)
}

function mapActivity(r: Record<string, unknown>, personCode: string): Activity {
  const mainPersonsRaw = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const ccPersonsRaw = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
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
    textInMatrix: String(r['Text'] ?? '') || undefined,
    accessGroup: String(r[ACTIVITY_ACCESS_GROUP_FIELD] ?? '') || undefined,
    planned: String(r['CalTimeFlag'] ?? '1') === '2',
  }
}

export async function GET(req: Request) {
  try {
    await requireSession()
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
    const raw = await herbeFetchAll(REGISTERS.activities, {
      sort: 'TransDate',
      range: `${dateFrom}:${dateTo}`,
    })
    const results: Activity[] = raw.flatMap(r => {
      const rec = r as Record<string, unknown>
      const mainPersons = String(rec['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      return mainPersons
        .filter(p => personSet.has(p))
        .map(p => mapActivity(rec, p))
    })

    // Emit CC rows for persons in CCPersons but NOT already in MainPersons
    for (const record of raw) {
      const r = record as Record<string, unknown>
      const mainPersonsArr = String(r['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const ccPersonsArr = String(r['CCPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      for (const ccCode of ccPersonsArr) {
        if (personList.includes(ccCode) && !mainPersonsArr.includes(ccCode)) {
          results.push(mapActivity(r, ccCode))
        }
      }
    }

    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

const HERBE_ERROR_CODES: Record<string, string> = {
  '1058': 'Mandatory field missing',
  '1547': 'Time conflict — an activity already exists at this time for this person',
}

function extractHerbeError(e: unknown): string {
  if (!e) return ''
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.map(extractHerbeError).filter(Boolean).join('; ')
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    // Standard ERP uses @-prefixed keys; also check plain keys
    const code = String(o['@code'] ?? o.code ?? '')
    const mapped = code ? HERBE_ERROR_CODES[code] : undefined
    const rawMsg = o['@description'] ?? o.message ?? o.text ?? o.msg ?? o.description ?? o.Error ?? o.error
    const msg = mapped ?? (rawMsg ? String(rawMsg).trim() : undefined)
    const field = o['@field'] ?? o.field
    if (msg) return field ? `${field}: ${msg}` : msg
    // Include field/code context if available
    const parts: string[] = []
    if (field) parts.push(`field: ${field}`)
    if (code) parts.push(`code: ${code}`)
    if (o.vc) parts.push(`vc: ${o.vc}`)
    return parts.length ? parts.join(', ') : JSON.stringify(e)
  }
  return String(e)
}

// Fields that live on row 0 of the activity record, not the header
const ROW_FIELDS = new Set(['Text'])

export function toHerbeForm(
  data: Record<string, unknown>,
  allowEmptyFields: Set<string> = new Set()
): string {
  return Object.entries(data)
    .filter(([k, v]) => v !== undefined && v !== null && (v !== '' || allowEmptyFields.has(k)))
    .map(([k, v]) => {
      if (k === 'Text') return `set_row_field.0.Text=${encodeURIComponent(String(v))}`
      return `set_field.${k}=${encodeURIComponent(String(v))}`
    })
    .join('&')
}

export async function POST(req: NextRequest) {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  try {
    const body = await req.json()
    const formBody = toHerbeForm(body, new Set(['CCPersons']))
    const res = await herbeFetch(REGISTERS.activities, undefined, {
      method: 'POST',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    })
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
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
