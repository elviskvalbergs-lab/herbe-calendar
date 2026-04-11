-- Cached holidays per country per year
CREATE TABLE IF NOT EXISTS cached_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  year        INT NOT NULL,
  date        DATE NOT NULL,
  name        TEXT NOT NULL,
  name_en     TEXT,
  type        TEXT NOT NULL DEFAULT 'Public',
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_code, date)
);

CREATE INDEX IF NOT EXISTS idx_cached_holidays_lookup
  ON cached_holidays(country_code, year);

-- Default holiday country per account
ALTER TABLE tenant_accounts ADD COLUMN IF NOT EXISTS holiday_country TEXT;

-- Per-person holiday country override
ALTER TABLE person_codes ADD COLUMN IF NOT EXISTS holiday_country TEXT;

-- Booking template: allow booking on holidays
ALTER TABLE booking_templates ADD COLUMN IF NOT EXISTS allow_holidays BOOLEAN NOT NULL DEFAULT false;
