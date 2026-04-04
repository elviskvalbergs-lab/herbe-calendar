-- Analytics events table (append-only, 30-day retention recommended)
CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- 'login', 'activity_created', 'activity_edited', 'activity_deleted', 'day_viewed'
  event_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_analytics_account_date ON analytics_events(account_id, event_date);
CREATE INDEX IF NOT EXISTS idx_analytics_account_user_date ON analytics_events(account_id, user_email, event_date);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(account_id, event_type, event_date);

-- Deduplicate day_viewed per user per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_day_viewed_dedup
  ON analytics_events(account_id, user_email, event_date, (metadata->>'date'))
  WHERE event_type = 'day_viewed';
