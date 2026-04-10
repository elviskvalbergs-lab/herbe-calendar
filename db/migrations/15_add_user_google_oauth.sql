-- Per-user Google OAuth tokens
CREATE TABLE IF NOT EXISTS user_google_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,
  account_id      UUID NOT NULL,
  google_email    TEXT NOT NULL,
  access_token    BYTEA NOT NULL,
  refresh_token   BYTEA NOT NULL,
  token_expires_at BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, google_email, account_id)
);

CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user
  ON user_google_tokens(user_email, account_id);

-- Per-user Google calendar selection and colors
CREATE TABLE IF NOT EXISTS user_google_calendars (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_google_token_id UUID NOT NULL REFERENCES user_google_tokens(id) ON DELETE CASCADE,
  calendar_id          TEXT NOT NULL,
  name                 TEXT NOT NULL,
  color                TEXT,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_google_token_id, calendar_id)
);
