-- Add performance indexes identified in pre-launch review.
-- Note: analytics_events (account_id, event_type, event_date) is already
-- covered by idx_analytics_event_type from migration 07.

CREATE INDEX IF NOT EXISTS idx_cached_events_full
  ON cached_events (account_id, source, person_code, date);

CREATE INDEX IF NOT EXISTS idx_bookings_share_status
  ON bookings (share_link_id, status, booked_date);
