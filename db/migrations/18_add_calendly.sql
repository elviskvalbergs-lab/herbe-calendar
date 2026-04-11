-- Per-user Calendly connection
CREATE TABLE IF NOT EXISTS user_calendly_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email          TEXT NOT NULL,
  account_id          UUID NOT NULL,
  access_token        BYTEA NOT NULL,
  calendly_user_uri   TEXT NOT NULL,
  calendly_user_name  TEXT,
  calendly_org_uri    TEXT,
  webhook_uri         TEXT,
  signing_key         BYTEA,
  default_template_id UUID NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_email, account_id)
);

-- Per-event-type template override
CREATE TABLE IF NOT EXISTS user_calendly_event_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendly_token_id   UUID NOT NULL REFERENCES user_calendly_tokens(id) ON DELETE CASCADE,
  event_type_uri      TEXT NOT NULL,
  event_type_name     TEXT NOT NULL,
  event_type_duration INT,
  template_id         UUID,
  UNIQUE(calendly_token_id, event_type_uri)
);

-- Webhook processing log (dedup + audit)
CREATE TABLE IF NOT EXISTS calendly_webhook_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uri           TEXT NOT NULL UNIQUE,
  calendly_token_id   UUID NOT NULL,
  template_id         UUID NOT NULL,
  status              TEXT NOT NULL DEFAULT 'processed',
  error               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
