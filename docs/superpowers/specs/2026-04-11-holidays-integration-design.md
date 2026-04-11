# Public Holidays Integration Design

## Summary

Integrate public holidays from openholidaysapi.org with per-person country support. Holidays show as visual markers in all calendar views and block booking availability by default. Admin sets a default country, individual members can override. Holidays cached in DB per country per year.

## Decisions

- **API:** openholidaysapi.org — free, no API key, 90+ countries
- **Country assignment:** Default country per account (admin), optional override per person (members page)
- **Visual display:** Holiday background color on date columns (day/3D/5D/7D), red dots in month navigator
- **Booking:** Holidays block full day by default. Per-template toggle: "Allow booking on holidays"
- **Multi-person:** Each person's column shows their country's holidays. Booking uses union of all target persons' holidays.
- **Caching:** Fetch once per country per year, store in DB. Re-fetch yearly or on-demand.

## Data Model

### DB Schema

```sql
-- Cached holidays per country per year
CREATE TABLE IF NOT EXISTS cached_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,       -- ISO 3166-1 alpha-2 (e.g. "LV", "EE", "LT")
  year        INT NOT NULL,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,         -- Local name
  name_en     TEXT,                  -- English name
  type        TEXT NOT NULL DEFAULT 'Public',  -- Public, National, Bank, etc.
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_code, date)
);

CREATE INDEX IF NOT EXISTS idx_cached_holidays_lookup
  ON cached_holidays(country_code, year);
```

### Account config

Add to `tenant_accounts` or a new table:

```sql
ALTER TABLE tenant_accounts ADD COLUMN IF NOT EXISTS holiday_country TEXT;  -- default holiday country (e.g. "LV")
```

### Per-person override

Add to `person_codes`:

```sql
ALTER TABLE person_codes ADD COLUMN IF NOT EXISTS holiday_country TEXT;  -- override, NULL = use account default
```

### Booking template

Extend `TemplateTargets` or add column to `booking_templates`:

```sql
ALTER TABLE booking_templates ADD COLUMN IF NOT EXISTS allow_holidays BOOLEAN NOT NULL DEFAULT false;
```

## Holiday API Client

New file: `lib/holidays.ts`

### `fetchHolidays(countryCode: string, year: number): Promise<Holiday[]>`

```
GET https://openholidaysapi.org/PublicHolidays
  ?countryIsoCode={CC}
  &languageIsoCode={CC}
  &validFrom={year}-01-01
  &validTo={year}-12-31
```

Returns array of `{ startDate, name[0].text, type }`.

### `getHolidays(countryCode: string, year: number): Promise<Holiday[]>`

Checks `cached_holidays` table first. If no rows for this country+year, fetches from API and stores. Returns from DB.

### `getHolidaysForDate(countryCode: string, date: string): Promise<Holiday | null>`

Quick lookup for a single date.

### `getHolidayDates(countryCodes: string[], dateFrom: string, dateTo: string): Promise<Map<string, Holiday[]>>`

Returns holidays for multiple countries in a date range. Used by calendar views and booking availability. Key is date string, value is array of holidays (could be from multiple countries).

## Admin Configuration

### Admin Config page (`/admin/config`)

New "Holidays" section (or add to existing integrations):

- Toggle: "Enable public holidays"
- Country dropdown: select default country (populated from openholidaysapi.org/Countries)
- "Refresh holidays" button to re-fetch from API

### Members page (`/admin/members`)

Per-person country override:
- New column or edit field: "Holiday country"
- Dropdown with country options
- Empty = use account default
- Shows the effective country (inherited or overridden)

## Calendar Views

### Day/3D/5D/7D View

For each date column:
- Determine the holiday country for each visible person
- If ANY person in that column has a holiday on that date, show a subtle holiday background
- Show holiday name in the date header (tooltip or small text)

Implementation: The date header row gets a holiday indicator. The column background gets a semi-transparent red/pink tint.

```
Thu 04/10 🔴 Good Friday
```

Or more subtly: a thin colored bar under the date header with the holiday name.

### Month Navigator

Holiday dates get a red/pink dot (in addition to source-colored dots). Or the date number itself gets a red background/ring (different from today's primary color ring).

### Activity Summary API

Extend `/api/activities/summary` response to include holidays:

```json
{
  "2026-04-10": { "sources": ["herbe", "outlook"], "count": 5 },
  "holidays": {
    "2026-04-10": [{ "name": "Good Friday", "country": "LV" }],
    "2026-04-13": [{ "name": "Easter Monday", "country": "LV" }]
  }
}
```

## Booking Availability

### Current flow (availability/route.ts)

1. Get availability windows from template
2. Collect busy blocks from all sources
3. Compute available slots per day

### With holidays

After step 2, before step 3:
- If template `allow_holidays` is false (default):
  - Get holiday countries for all target persons
  - Get holidays for the date range
  - Mark entire holiday days as blocked (no slots generated)
- If template `allow_holidays` is true:
  - Skip holiday check, compute slots normally

### Person holiday country resolution

```typescript
async function getPersonHolidayCountry(personCode: string, accountId: string): Promise<string | null> {
  // 1. Check person_codes for override
  // 2. Fall back to tenant_accounts.holiday_country
  // Returns null if holidays not configured
}
```

## API Endpoints

### `GET /api/holidays`

Returns holidays for the current view context. Query params:
- `persons` — comma-separated person codes (resolves countries)
- `dateFrom`, `dateTo` — date range
- `accountId` — (from session)

Response: `{ dates: Record<string, { name: string; country: string }[]> }`

### `PUT /api/admin/config` (extend)

Handle `type: 'holidays'`:
- `enabled: boolean`
- `defaultCountry: string`

### `PATCH /api/admin/members` (extend)

Handle `holidayCountry` field per person.

### `GET /api/holidays/countries`

Returns available countries from openholidaysapi.org (cached).

## Scope

### In scope
- openholidaysapi.org integration
- DB caching of holidays
- Default country per account (admin config)
- Per-person country override (members page)
- Holiday background in day/3D/5D/7D views
- Holiday markers in month navigator
- Holidays block booking availability (with per-template override)
- Holiday name display in date headers

### Out of scope
- Custom/manual holidays (company-specific days off)
- Half-day holidays
- Regional holidays within a country (e.g. German states)
- Holiday notifications/reminders
