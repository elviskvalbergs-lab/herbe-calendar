-- Index for DELETE ... WHERE account_id AND source AND date BETWEEN queries
-- Used by forceSyncRange and deleteCachedEvents
CREATE INDEX IF NOT EXISTS idx_cached_events_source_date
ON cached_events (account_id, source, date);
