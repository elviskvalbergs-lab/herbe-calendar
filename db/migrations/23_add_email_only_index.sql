-- Index on LOWER(email) alone for auth lookups that don't filter by account_id.
-- The existing idx_person_codes_email_account covers (account_id, LOWER(email))
-- but getCodeByEmail queries by email only, causing a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_person_codes_email_lower
  ON person_codes (LOWER(email));
