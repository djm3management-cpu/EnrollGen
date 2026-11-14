CREATE TABLE IF NOT EXISTS bulletins (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carrier       TEXT NOT NULL,

  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  states        TEXT[] DEFAULT '{}',

  link          TEXT,

  published_at  DATE NOT NULL,

  source_id     TEXT UNIQUE,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulletins_published ON bulletins (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_bulletins_carrier   ON bulletins (carrier);

CREATE INDEX IF NOT EXISTS idx_bulletins_source_id ON bulletins (source_id);

ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON bulletins
  FOR SELECT USING (true);

CREATE POLICY "Allow service-role insert/update" ON bulletins
  FOR ALL USING (auth.role() = 'service_role');
