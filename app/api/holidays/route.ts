import { NextRequest, NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getPersonsHolidayCountries, getHolidaysForRange } from '@/lib/holidays'

export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireSession()
  } catch {
    return unauthorized()
  }

  const { searchParams: params } = new URL(req.url)
  const persons = params.get('persons') ?? ''
  const dateFrom = params.get('dateFrom') ?? ''
  const dateTo = params.get('dateTo') ?? dateFrom

  if (!persons || !dateFrom) return NextResponse.json({})

  const personCodes = persons.split(',').map(p => p.trim())
  const countryMap = await getPersonsHolidayCountries(personCodes, session.accountId)
  const countryCodes = [...new Set(countryMap.values())]

  if (countryCodes.length === 0) return NextResponse.json({ dates: {}, personCountries: {} })

  const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)

  const dates: Record<string, { name: string; country: string }[]> = {}
  for (const [date, hols] of holidays) {
    dates[date] = hols.map(h => ({ name: h.name, country: h.country }))
  }

  // Include person→country mapping so frontend can apply per-person
  const personCountries: Record<string, string> = {}
  for (const [code, cc] of countryMap) personCountries[code] = cc

  return NextResponse.json({ dates, personCountries }, { headers: { 'Cache-Control': 'no-store' } })
}
