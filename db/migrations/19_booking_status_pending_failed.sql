-- Extend booking status to support pending and failed states
-- pending: booking record created, external events not yet created
-- failed: event creation threw an error
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rescheduled', 'failed'));
