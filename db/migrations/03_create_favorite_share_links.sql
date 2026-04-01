CREATE TABLE IF NOT EXISTS favorite_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_id UUID NOT NULL REFERENCES user_favorites(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  visibility TEXT NOT NULL DEFAULT 'busy' CHECK (visibility IN ('busy', 'titles', 'full')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON favorite_share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_favorite_id ON favorite_share_links(favorite_id);
