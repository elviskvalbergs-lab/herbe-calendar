-- Task cache for multi-source task feature. Stale fallback when a
-- source (ERP / Microsoft Graph / Google Tasks) fails during live fetch.

CREATE TABLE IF NOT EXISTS cached_tasks (
  account_id     UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email     TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('herbe', 'outlook', 'google')),
  connection_id  TEXT NOT NULL DEFAULT '',
  task_id        TEXT NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_email, source, connection_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_cached_tasks_lookup
  ON cached_tasks (account_id, user_email, source);
