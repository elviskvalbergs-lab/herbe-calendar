import { NextResponse } from 'next/server'
import { requireSession, unauthorized } from '@/lib/herbe/auth-guard'
import { getAvailableCountries } from '@/lib/holidays'

export async function GET() {
  try {
    await requireSession()
  } catch {
    return unauthorized()
  }

  const countries = await getAvailableCountries()
  return NextResponse.json(countries)
}
