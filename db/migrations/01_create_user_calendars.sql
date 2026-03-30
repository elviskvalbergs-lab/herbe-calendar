-- Create user_calendars table for persistent ICS links
CREATE TABLE IF NOT EXISTS user_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  target_person_code TEXT NOT NULL,
  name TEXT NOT NULL,
  ics_url TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_calendars_user_email ON user_calendars(user_email);
CREATE INDEX IF NOT EXISTS idx_user_calendars_target_person_code ON user_calendars(target_person_code);
