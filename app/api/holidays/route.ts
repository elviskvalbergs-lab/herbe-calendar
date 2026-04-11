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

  if (countryCodes.length === 0) return NextResponse.json({})

  const holidays = await getHolidaysForRange(countryCodes, dateFrom, dateTo)

  const result: Record<string, { name: string; country: string }[]> = {}
  for (const [date, hols] of holidays) {
    result[date] = hols.map(h => ({ name: h.name, country: h.country }))
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
