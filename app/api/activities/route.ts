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
  // Send raw UTF-8 values — only escape chars that break form parsing.
  // encodeURIComponent produces %C5%BE for ž, which Herbe decodes as Latin-1 (Å¾).
  function escapeValue(v: string) {
    return v.replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D').replace(/\+/g, '%2B')
  }
  return Object.entries(body)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `set_field.${k}=${escapeValue(String(v))}`)
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return NextResponse.json(data ?? { error: `Herbe error ${res.status}` }, { status: res.status })
    // Extract the created record so SerNr is at top level
    const created = (data?.data?.[REGISTERS.activities] as Record<string, unknown>[] | undefined)?.[0]
    return NextResponse.json(created ?? data ?? {}, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
