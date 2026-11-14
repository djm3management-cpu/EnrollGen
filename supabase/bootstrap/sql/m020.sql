-- Source statement 1
CREATE TABLE IF NOT EXISTS public.sales_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES public.enrolled_agents(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  product_type  TEXT NOT NULL CHECK (product_type IN ('MA', 'MedSup', 'ACA', 'U65')),
  sale_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source statement 2
CREATE INDEX idx_sales_log_agent_date ON public.sales_log (agent_id, sale_date);

-- Source statement 3
CREATE INDEX idx_sales_log_date       ON public.sales_log (sale_date);

-- Source statement 4
CREATE INDEX idx_sales_log_clerk_user ON public.sales_log (clerk_user_id);

-- Source statement 5
ALTER TABLE public.sales_log ENABLE ROW LEVEL SECURITY;

-- Source statement 6
CREATE POLICY "Agents read own sales"
  ON public.sales_log FOR SELECT
  USING (
    clerk_user_id = auth.jwt() ->> 'sub'
  );

-- Source statement 7
CREATE POLICY "Agents insert own sales"
  ON public.sales_log FOR INSERT
  WITH CHECK (
    clerk_user_id = auth.jwt() ->> 'sub'
  );

-- Source statement 8
CREATE POLICY "Principals read all sales"
  ON public.sales_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

-- Source statement 9
CREATE POLICY "Principals insert any sales"
  ON public.sales_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

-- Source statement 10
CREATE POLICY "Principals manage all sales"
  ON public.sales_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );
