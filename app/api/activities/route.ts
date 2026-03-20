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
  return {
    id: String(r['SerNr'] ?? ''),
    source: 'herbe',
    personCode,
    mainPersons: mainPersonsRaw.length ? mainPersonsRaw : undefined,
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
    const result = raw.flatMap(r => {
      const rec = r as Record<string, unknown>
      const mainPersons = String(rec['MainPersons'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
      return mainPersons
        .filter(p => personSet.has(p))
        .map(p => mapActivity(rec, p))
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function toHerbeForm(body: Record<string, unknown>): string {
  return Object.entries(body)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `set_field.${k}=${encodeURIComponent(String(v))}`)
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
    const formBody = toHerbeForm(body)
    const res = await herbeFetch(REGISTERS.activities, undefined, {
      method: 'POST',
      body: formBody,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    })
    const data = await res.json().catch(() => null)
    console.log(`POST ActVc → ${res.status}`, JSON.stringify(data))
    if (!res.ok) return NextResponse.json(data ?? { error: `Herbe error ${res.status}` }, { status: res.status })
    // Check for Herbe validation errors returned with HTTP 200 (errors array)
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = (data.errors as Record<string, unknown>[]).map(e => String(e.message ?? e.text ?? e.msg ?? JSON.stringify(e)))
      return NextResponse.json({ error: msgs[0], errors: msgs.map(m => ({ message: m })) }, { status: 422 })
    }
    // Extract the created record so SerNr is at top level
    const created = (data?.data?.[REGISTERS.activities] as Record<string, unknown>[] | undefined)?.[0]
    // If Herbe returned an empty result (no record created), it likely rejected due to a validation rule
    if (!created?.['SerNr']) {
      const fallbackErr = data?.error ?? data?.message ?? 'Activity was not saved — a required field may be missing or invalid'
      return NextResponse.json({ error: String(fallbackErr) }, { status: 422 })
    }
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
