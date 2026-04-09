-- Unified person codes table: maps users from ERP and/or Azure AD to short codes
CREATE TABLE IF NOT EXISTS person_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  azure_object_id TEXT UNIQUE,           -- Azure AD object ID (immutable)
  erp_code TEXT,                          -- Original code from Standard ERP (e.g. 'EKS')
  generated_code TEXT NOT NULL UNIQUE,    -- Short code used throughout the app
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'erp',     -- 'erp', 'azure', 'both'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_codes_email ON person_codes (email);
CREATE INDEX IF NOT EXISTS idx_person_codes_erp_code ON person_codes (erp_code);
CREATE INDEX IF NOT EXISTS idx_person_codes_generated_code ON person_codes (generated_code);
