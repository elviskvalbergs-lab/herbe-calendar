-- 22_create_cache_tables.sql
-- Cache layer for calendar events synced from external sources

CREATE TABLE IF NOT EXISTS cached_events (
  source          TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  connection_id   TEXT NOT NULL DEFAULT '',
  person_code     TEXT NOT NULL,
  date            DATE NOT NULL,
  data            JSONB NOT NULL,
  cached_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, source, source_id, person_code)
);

CREATE INDEX idx_cached_events_lookup
  ON cached_events (account_id, person_code, date);

CREATE INDEX idx_cached_events_source_conn
  ON cached_events (account_id, source, connection_id);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id        UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  connection_id     TEXT NOT NULL DEFAULT '',
  sync_cursor       TEXT,
  last_sync_at      TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  sync_status       TEXT NOT NULL DEFAULT 'idle',
  error_message     TEXT,
  PRIMARY KEY (account_id, source, connection_id)
);
