-- Add account_id to existing tables and migrate data to default account

-- person_codes
ALTER TABLE person_codes
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES tenant_accounts(id) ON DELETE CASCADE;
UPDATE person_codes SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
ALTER TABLE person_codes ALTER COLUMN account_id SET NOT NULL;

-- Replace global unique constraints with per-account
ALTER TABLE person_codes DROP CONSTRAINT IF EXISTS person_codes_generated_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_codes_code_account ON person_codes(account_id, generated_code);

-- Per-account email uniqueness (drop old if exists)
DO $$ BEGIN
  ALTER TABLE person_codes DROP CONSTRAINT IF EXISTS person_codes_email_account_unique;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_codes_email_account ON person_codes(account_id, LOWER(email));

CREATE INDEX IF NOT EXISTS idx_person_codes_account ON person_codes(account_id);

-- user_favorites
ALTER TABLE user_favorites
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES tenant_accounts(id) ON DELETE CASCADE;
UPDATE user_favorites SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
ALTER TABLE user_favorites ALTER COLUMN account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_favorites_account ON user_favorites(account_id);

-- user_calendars
ALTER TABLE user_calendars
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES tenant_accounts(id) ON DELETE CASCADE;
UPDATE user_calendars SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
ALTER TABLE user_calendars ALTER COLUMN account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_calendars_account ON user_calendars(account_id);
