-- Multi-tier timezone support.
-- tenant_accounts.default_timezone: account-level fallback (always set).
-- account_members.timezone: per-user override (NULL = use account default).
-- account_erp_connections.timezone: TZ ERP TransDate/StartTime/EndTime are stored in.
-- account_azure_config.source_timezone: TZ to send in Outlook Prefer header (NULL = account default).
-- user_google_calendars.source_timezone: TZ from Google calendar metadata (NULL = account default).
-- user_calendly_tokens.source_timezone: TZ Calendly invite times resolve to (NULL = host member TZ).

ALTER TABLE tenant_accounts
  ADD COLUMN IF NOT EXISTS default_timezone TEXT NOT NULL DEFAULT 'Europe/Riga';

ALTER TABLE account_members
  ADD COLUMN IF NOT EXISTS timezone TEXT NULL;

ALTER TABLE account_erp_connections
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Riga';

ALTER TABLE account_azure_config
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

ALTER TABLE user_google_calendars
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

ALTER TABLE user_calendly_tokens
  ADD COLUMN IF NOT EXISTS source_timezone TEXT NULL;

-- Cached events/tasks were bucketed under the implicit Riga assumption.
-- Wipe so that subsequent reads re-bucket using the resolved viewer TZ.
DELETE FROM cached_events;
DELETE FROM cached_tasks;
