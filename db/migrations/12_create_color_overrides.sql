-- Color overrides for activity class groups
-- user_email NULL = admin default, connection_id NULL = all connections
CREATE TABLE IF NOT EXISTS color_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email      TEXT,
  connection_id   UUID REFERENCES account_erp_connections(id) ON DELETE CASCADE,
  class_group_code TEXT NOT NULL,
  color           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one override per (account, user, connection, class_group)
-- COALESCE handles NULLs for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_color_overrides_unique
  ON color_overrides (account_id, COALESCE(user_email, ''), COALESCE(connection_id::text, ''), class_group_code);

CREATE INDEX IF NOT EXISTS idx_color_overrides_account ON color_overrides (account_id);
CREATE INDEX IF NOT EXISTS idx_color_overrides_user ON color_overrides (account_id, user_email) WHERE user_email IS NOT NULL;
