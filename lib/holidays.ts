import { pool } from '@/lib/db'
import type { Holiday } from '@/types'

const API_BASE = 'https://openholidaysapi.org'

/** Fetch holidays from openholidaysapi.org */
async function fetchFromApi(countryCode: string, year: number): Promise<Holiday[]> {
  const res = await fetch(
    `${API_BASE}/PublicHolidays?countryIsoCode=${countryCode}&languageIsoCode=${countryCode}&validFrom=${year}-01-01&validTo=${year}-12-31`
  )
  if (!res.ok) {
    console.warn(`[holidays] API fetch failed for ${countryCode}/${year}: ${res.status}`)
    return []
  }
  const data = await res.json()
  return (data as any[]).map(h => ({
    date: h.startDate,
    name: h.name?.[0]?.text ?? h.startDate,
    nameEn: h.name?.find((n: any) => n.language === 'EN')?.text,
    country: countryCode,
    type: h.type ?? 'Public',
  }))
}

/** Get holidays for a country+year, caching in DB. */
export async function getHolidays(countryCode: string, year: number): Promise<Holiday[]> {
  const { rows } = await pool.query(
    'SELECT date::text, name, name_en, country_code, type FROM cached_holidays WHERE country_code = $1 AND year = $2',
    [countryCode, year]
  )
  if (rows.length > 0) {
    return rows.map(r => ({
      date: r.date,
      name: r.name,
      nameEn: r.name_en,
      country: r.country_code,
      type: r.type,
    }))
  }

  const holidays = await fetchFromApi(countryCode, year)
  if (holidays.length > 0) {
    const values: unknown[] = []
    const placeholders: string[] = []
    for (let i = 0; i < holidays.length; i++) {
      const h = holidays[i]
      const off = i * 6
      placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6})`)
      values.push(countryCode, year, h.date, h.name, h.nameEn ?? null, h.type)
    }
    await pool.query(
      `INSERT INTO cached_holidays (country_code, year, date, name, name_en, type)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (country_code, date) DO UPDATE SET name = EXCLUDED.name, name_en = EXCLUDED.name_en, type = EXCLUDED.type, fetched_at = now()`,
      values,
    )
  }
  return holidays
}

/** Get holidays for multiple countries in a date range. Returns Map<dateStr, Holiday[]>. */
export async function getHolidaysForRange(
  countryCodes: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, Holiday[]>> {
  const uniqueCountries = [...new Set(countryCodes)]
  const yearFrom = parseInt(dateFrom.slice(0, 4))
  const yearTo = parseInt(dateTo.slice(0, 4))

  const promises: Promise<Holiday[]>[] = []
  for (const cc of uniqueCountries) {
    for (let y = yearFrom; y <= yearTo; y++) {
      promises.push(getHolidays(cc, y))
    }
  }
  const allHolidays = (await Promise.all(promises)).flat()

  const result = new Map<string, Holiday[]>()
  for (const h of allHolidays) {
    if (h.date >= dateFrom && h.date <= dateTo) {
      const existing = result.get(h.date) ?? []
      existing.push(h)
      result.set(h.date, existing)
    }
  }
  return result
}

/** Resolve holiday country for a person: person override > account default > null */
export async function getPersonHolidayCountry(personCode: string, accountId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT p.holiday_country AS person_country, a.holiday_country AS account_country
     FROM person_codes p
     JOIN tenant_accounts a ON a.id = p.account_id
     WHERE p.generated_code = $1 AND p.account_id = $2`,
    [personCode, accountId]
  )
  if (rows.length === 0) return null
  return rows[0].person_country || rows[0].account_country || null
}

/** Resolve holiday countries for multiple persons. Returns Map<personCode, countryCode>. */
export async function getPersonsHolidayCountries(
  personCodes: string[],
  accountId: string,
): Promise<Map<string, string>> {
  const { rows } = await pool.query(
    `SELECT p.generated_code, p.holiday_country AS person_country, a.holiday_country AS account_country
     FROM person_codes p
     JOIN tenant_accounts a ON a.id = p.account_id
     WHERE p.generated_code = ANY($1) AND p.account_id = $2`,
    [personCodes, accountId]
  )
  const result = new Map<string, string>()
  for (const r of rows) {
    const cc = r.person_country || r.account_country
    if (cc) result.set(r.generated_code, cc)
  }
  return result
}

/** Get available countries from the API (cached in memory). */
let countriesCache: { code: string; name: string }[] | null = null
export async function getAvailableCountries(): Promise<{ code: string; name: string }[]> {
  if (countriesCache) return countriesCache
  try {
    const res = await fetch(`${API_BASE}/Countries?languageIsoCode=EN`)
    if (!res.ok) return []
    const data = await res.json()
    countriesCache = (data as any[]).map(c => ({
      code: c.isoCode,
      name: c.name?.[0]?.text ?? c.isoCode,
    })).sort((a, b) => a.name.localeCompare(b.name))
    return countriesCache
  } catch {
    return []
  }
}
