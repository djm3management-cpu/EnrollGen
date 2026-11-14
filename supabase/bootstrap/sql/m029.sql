-- Source statement 1
CREATE TABLE IF NOT EXISTS public.carrier_rts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL,
  carrier TEXT NOT NULL,
  product_line TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_npn TEXT,
  clerk_user_id TEXT,
  status TEXT DEFAULT '',
  states TEXT DEFAULT '',
  cert_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(channel, carrier, product_line, agent_name)
);

-- Source statement 2
ALTER TABLE public.carrier_rts ENABLE ROW LEVEL SECURITY;

-- Source statement 3
DROP POLICY IF EXISTS "Anyone can read carrier_rts" ON public.carrier_rts;

-- Source statement 4
CREATE POLICY "Anyone can read carrier_rts" ON public.carrier_rts
  FOR SELECT USING (true);

-- Source statement 5
DROP POLICY IF EXISTS "Agents can update their own rows" ON public.carrier_rts;

-- Source statement 6
CREATE POLICY "Agents can update their own rows" ON public.carrier_rts
  FOR UPDATE
  USING (
    clerk_user_id = (auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    clerk_user_id = (auth.jwt() ->> 'sub')
  );

-- Source statement 7
CREATE INDEX IF NOT EXISTS idx_carrier_rts_agent
  ON public.carrier_rts(agent_name);

-- Source statement 8
CREATE INDEX IF NOT EXISTS idx_carrier_rts_channel
  ON public.carrier_rts(channel);

-- Source statement 9
CREATE OR REPLACE FUNCTION public.update_carrier_rts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Source statement 10
DROP TRIGGER IF EXISTS carrier_rts_updated ON public.carrier_rts;

-- Source statement 11
CREATE TRIGGER carrier_rts_updated
  BEFORE UPDATE ON public.carrier_rts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_carrier_rts_timestamp();

-- Source statement 12
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'carrier_rts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carrier_rts;
  END IF;
END;
$$;
