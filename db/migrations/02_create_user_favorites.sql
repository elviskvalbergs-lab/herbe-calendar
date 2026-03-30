-- Create user_favorites table for persistent favorites (replaces localStorage)
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('day', '3day', '5day')),
  person_codes TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_email ON user_favorites(user_email);
