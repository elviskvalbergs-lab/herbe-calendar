-- Configurable booking horizon (max days into the future for availability)
ALTER TABLE favorite_share_links ADD COLUMN IF NOT EXISTS booking_max_days INTEGER NOT NULL DEFAULT 60;
