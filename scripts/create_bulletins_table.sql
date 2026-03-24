-- Bulletins table for carrier & CMS updates (auto-populated daily)
CREATE TABLE IF NOT EXISTS bulletins (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carrier       TEXT NOT NULL,                -- e.g. "UHC", "CMS", "Humana"
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  states        TEXT[] DEFAULT '{}',          -- affected states
  link          TEXT,                         -- source URL
  published_at  DATE NOT NULL,               -- bulletin date
  source_id     TEXT UNIQUE,                 -- dedup key (URL hash or feed GUID)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_bulletins_published ON bulletins (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulletins_carrier   ON bulletins (carrier);
CREATE INDEX IF NOT EXISTS idx_bulletins_source_id ON bulletins (source_id);

-- Enable RLS but allow anon read
ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON bulletins
  FOR SELECT USING (true);

CREATE POLICY "Allow service-role insert/update" ON bulletins
  FOR ALL USING (auth.role() = 'service_role');
