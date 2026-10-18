-- ============================================================
--  SALES LOG — Leaderboard & Bonus Tracking
--  Tracks individual sales per agent for dashboard aggregations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES public.enrolled_agents(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  product_type  TEXT NOT NULL CHECK (product_type IN ('MA', 'MedSup', 'ACA', 'U65')),
  sale_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Performance indexes for leaderboard queries ──
CREATE INDEX idx_sales_log_agent_date ON public.sales_log (agent_id, sale_date);
CREATE INDEX idx_sales_log_date       ON public.sales_log (sale_date);
CREATE INDEX idx_sales_log_clerk_user ON public.sales_log (clerk_user_id);

-- ── Row-Level Security ──
ALTER TABLE public.sales_log ENABLE ROW LEVEL SECURITY;

-- Agents can read their own sales
CREATE POLICY "Agents read own sales"
  ON public.sales_log FOR SELECT
  USING (
    clerk_user_id = auth.jwt() ->> 'sub'
  );

-- Agents can insert their own sales
CREATE POLICY "Agents insert own sales"
  ON public.sales_log FOR INSERT
  WITH CHECK (
    clerk_user_id = auth.jwt() ->> 'sub'
  );

-- Principals (managers) can read all sales for leaderboard
CREATE POLICY "Principals read all sales"
  ON public.sales_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

-- Principals can insert sales on behalf of agents
CREATE POLICY "Principals insert any sales"
  ON public.sales_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );

-- Principals can update/delete sales for corrections
CREATE POLICY "Principals manage all sales"
  ON public.sales_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.enrolled_agents
      WHERE clerk_user_id = auth.jwt() ->> 'sub'
        AND role = 'principal'
    )
  );
