-- Source statement 1
CREATE TABLE IF NOT EXISTS public.training_completions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id TEXT,
  agent_name TEXT,
  product_type TEXT DEFAULT 'MA',
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  sections_completed INTEGER,
  total_sections INTEGER DEFAULT 8,
  notes TEXT
);

-- Source statement 2
ALTER TABLE public.training_completions ENABLE ROW LEVEL SECURITY;

-- Source statement 3
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.training_completions;

-- Source statement 4
CREATE POLICY "Allow insert for authenticated" ON public.training_completions
  FOR INSERT TO authenticated WITH CHECK (true);

-- Source statement 5
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.training_completions;

-- Source statement 6
CREATE POLICY "Allow read for authenticated" ON public.training_completions
  FOR SELECT TO authenticated USING (true);
