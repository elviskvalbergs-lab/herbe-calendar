-- Booking templates (user-defined meeting types)
CREATE TABLE IF NOT EXISTS booking_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  name            TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  availability_windows JSONB NOT NULL DEFAULT '[]',
  buffer_minutes  INT NOT NULL DEFAULT 0,
  targets         JSONB NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '[]',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_templates_account ON booking_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_booking_templates_user ON booking_templates(user_email);

-- Junction: which templates are offered on which share links
CREATE TABLE IF NOT EXISTS share_link_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id   UUID NOT NULL REFERENCES favorite_share_links(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES booking_templates(id) ON DELETE CASCADE,
  UNIQUE (share_link_id, template_id)
);

-- Add booking_enabled flag to share links
ALTER TABLE favorite_share_links ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT false;

-- Bookings (created meetings)
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES booking_templates(id),
  share_link_id   UUID NOT NULL REFERENCES favorite_share_links(id),
  booker_email    TEXT NOT NULL,
  booked_date     DATE NOT NULL,
  booked_time     TIME NOT NULL,
  duration_minutes INT NOT NULL,
  field_values    JSONB NOT NULL DEFAULT '{}',
  cancel_token    TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'rescheduled')),
  created_erp_ids JSONB DEFAULT '[]',
  created_outlook_id TEXT,
  created_google_id TEXT,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_account ON bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cancel_token ON bookings(cancel_token);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booked_date);
CREATE INDEX IF NOT EXISTS idx_bookings_share_link ON bookings(share_link_id);
