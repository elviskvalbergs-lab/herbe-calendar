-- Multi-tenant accounts table
CREATE TABLE IF NOT EXISTS tenant_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at  TIMESTAMPTZ
);

-- Seed the default account (absorbs existing single-tenant data)
INSERT INTO tenant_accounts (id, slug, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'burti', 'Burti')
ON CONFLICT DO NOTHING;

-- Account members with roles
CREATE TYPE account_role AS ENUM ('admin', 'member');

CREATE TABLE IF NOT EXISTS account_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        account_role NOT NULL DEFAULT 'member',
  active      BOOLEAN NOT NULL DEFAULT true,
  invited_by  TEXT,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, email)
);

CREATE INDEX IF NOT EXISTS idx_account_members_email ON account_members(email);
CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id);

-- Seed existing users from person_codes into the default account
INSERT INTO account_members (account_id, email, role)
SELECT '00000000-0000-0000-0000-000000000001', email, 'member'
FROM person_codes
ON CONFLICT DO NOTHING;

-- Azure connection config per account (one per account)
CREATE TABLE IF NOT EXISTS account_azure_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL UNIQUE REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL DEFAULT '',
  client_id         TEXT NOT NULL DEFAULT '',
  client_secret     BYTEA,                -- AES-256-GCM encrypted
  sender_email      TEXT NOT NULL DEFAULT '',
  access_token      BYTEA,                -- encrypted cached token
  token_expires_at  BIGINT DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ERP connections per account (multiple allowed)
CREATE TABLE IF NOT EXISTS account_erp_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Default',
  api_base_url    TEXT NOT NULL DEFAULT '',
  company_code    TEXT NOT NULL DEFAULT '',
  client_id       TEXT NOT NULL DEFAULT '',
  client_secret   BYTEA,                  -- encrypted
  access_token    BYTEA,                  -- encrypted
  refresh_token   BYTEA,                  -- encrypted
  token_expires_at BIGINT DEFAULT 0,
  -- Basic auth fallback
  username        TEXT,
  password        BYTEA,                  -- encrypted
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_connections_account ON account_erp_connections(account_id);

-- General account settings (key-value for non-connection config)
CREATE TABLE IF NOT EXISTS account_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  setting_key   TEXT NOT NULL,
  setting_value TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, setting_key)
);

-- Config audit log
CREATE TABLE IF NOT EXISTS config_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID NOT NULL,
  changed_by  TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_config_audit_account ON config_audit_log(account_id, changed_at);
