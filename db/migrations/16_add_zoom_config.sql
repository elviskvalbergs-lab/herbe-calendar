CREATE TABLE IF NOT EXISTS account_zoom_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL UNIQUE,
  zoom_account_id TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  client_secret   BYTEA NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
