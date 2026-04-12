-- Sharing level for per-user Google calendars
ALTER TABLE user_google_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
-- Values: 'private', 'busy', 'titles', 'full'

-- Sharing level for ICS feeds
ALTER TABLE user_calendars ADD COLUMN IF NOT EXISTS sharing TEXT NOT NULL DEFAULT 'private';
