-- API tokens for external BI tool access
CREATE TABLE IF NOT EXISTS api_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,       -- SHA-256 hash of the token (token itself shown once on creation)
  name        TEXT NOT NULL DEFAULT '',   -- human-readable label
  scope       TEXT NOT NULL DEFAULT 'account', -- 'account' = this account only, 'super' = all accounts
  created_by  TEXT NOT NULL,              -- email of creator
  last_used   TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,               -- NULL = active, set to revoke
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_account ON api_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash) WHERE revoked_at IS NULL;
