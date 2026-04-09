-- SMTP config per account (for magic link emails when Azure is not available)
CREATE TABLE IF NOT EXISTS account_smtp_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL UNIQUE REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  host          TEXT NOT NULL DEFAULT '',
  port          INT NOT NULL DEFAULT 587,
  username      TEXT NOT NULL DEFAULT '',
  password      BYTEA,                    -- AES-256-GCM encrypted
  sender_email  TEXT NOT NULL DEFAULT '',
  sender_name   TEXT NOT NULL DEFAULT 'Herbe Calendar',
  use_tls       BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google Workspace config per account
CREATE TABLE IF NOT EXISTS account_google_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL UNIQUE REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  service_account_email TEXT NOT NULL DEFAULT '',     -- service account email
  service_account_key   BYTEA,                        -- private key JSON, encrypted
  admin_email           TEXT NOT NULL DEFAULT '',     -- Workspace admin email for domain-wide delegation
  domain                TEXT NOT NULL DEFAULT '',     -- Workspace domain (e.g. company.com)
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
