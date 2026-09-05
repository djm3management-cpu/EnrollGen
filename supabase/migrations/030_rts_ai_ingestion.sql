-- AI-assisted carrier RTS ingestion, tenant scoping, and audit history.

ALTER TABLE public.carrier_rts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE
    DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.tenant_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carrier_source_id UUID,
  ADD COLUMN IF NOT EXISTS state_appointments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS writing_number TEXT,
  ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS source_file_hash TEXT;

UPDATE public.carrier_rts rts
SET agent_id = agent.id
FROM public.tenant_agents agent
WHERE rts.agent_id IS NULL
  AND agent.tenant_id = rts.tenant_id
  AND (
    (NULLIF(rts.agent_npn, '') IS NOT NULL AND agent.npn = rts.agent_npn)
    OR lower(agent.name) = lower(rts.agent_name)
  );

ALTER TABLE public.carrier_rts
  ALTER COLUMN tenant_id SET NOT NULL;

-- Replace the original global matrix identity with a tenant-aware identity.
ALTER TABLE public.carrier_rts
  DROP CONSTRAINT IF EXISTS carrier_rts_channel_carrier_product_line_agent_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_rts_tenant_matrix_key
  ON public.carrier_rts(tenant_id, channel, carrier, product_line, agent_name);

CREATE INDEX IF NOT EXISTS idx_carrier_rts_tenant_agent
  ON public.carrier_rts(tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_carrier_rts_tenant_status
  ON public.carrier_rts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_carrier_rts_source_hash
  ON public.carrier_rts(tenant_id, source_file_hash)
  WHERE source_file_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rts_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.tenant_agents(id),
  source_filename TEXT NOT NULL,
  source_type TEXT,
  file_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  records_created INTEGER NOT NULL DEFAULT 0 CHECK (records_created >= 0),
  records_updated INTEGER NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
  records_skipped INTEGER NOT NULL DEFAULT 0 CHECK (records_skipped >= 0),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rts_ingestion_file_hash
  ON public.rts_ingestion_log(tenant_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_rts_ingestion_tenant_created
  ON public.rts_ingestion_log(tenant_id, created_at DESC);

-- Keep the matrix upsert and its audit row in one database transaction.
CREATE OR REPLACE FUNCTION public.commit_rts_ingestion(
  p_tenant_id UUID,
  p_uploaded_by UUID,
  p_source_filename TEXT,
  p_source_type TEXT,
  p_file_hash TEXT,
  p_row_count INTEGER,
  p_records_skipped INTEGER,
  p_warnings JSONB,
  p_rows JSONB
)
RETURNS TABLE(
  ingestion_id UUID,
  committed_at TIMESTAMPTZ,
  records_created INTEGER,
  records_updated INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ingestion_id UUID;
  v_committed_at TIMESTAMPTZ;
  v_records_created INTEGER;
  v_records_updated INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_agents agent
    WHERE agent.id = p_uploaded_by
      AND agent.tenant_id = p_tenant_id
      AND agent.is_active = true
  ) THEN
    RAISE EXCEPTION 'The ingestion user is not an active agent in this tenant.';
  END IF;

  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'RTS ingestion requires at least one normalized row.';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_records_updated
  FROM jsonb_to_recordset(p_rows) AS incoming(
    channel TEXT,
    carrier TEXT,
    product_line TEXT,
    agent_name TEXT
  )
  JOIN public.carrier_rts existing
    ON existing.tenant_id = p_tenant_id
   AND existing.channel = incoming.channel
   AND existing.carrier = incoming.carrier
   AND existing.product_line = incoming.product_line
   AND existing.agent_name = incoming.agent_name;

  v_records_created := jsonb_array_length(p_rows) - v_records_updated;

  INSERT INTO public.rts_ingestion_log (
    tenant_id,
    uploaded_by,
    source_filename,
    source_type,
    file_hash,
    row_count,
    records_created,
    records_updated,
    records_skipped,
    warnings
  )
  VALUES (
    p_tenant_id,
    p_uploaded_by,
    p_source_filename,
    p_source_type,
    p_file_hash,
    p_row_count,
    v_records_created,
    v_records_updated,
    p_records_skipped,
    COALESCE(p_warnings, '[]'::jsonb)
  )
  RETURNING id, created_at INTO v_ingestion_id, v_committed_at;

  INSERT INTO public.carrier_rts (
    tenant_id,
    channel,
    carrier,
    carrier_source_id,
    product_line,
    agent_id,
    agent_name,
    agent_npn,
    clerk_user_id,
    status,
    states,
    state_appointments,
    writing_number,
    certifications,
    cert_date,
    termination_date,
    effective_date,
    notes,
    source_file_hash
  )
  SELECT
    p_tenant_id,
    item.channel,
    item.carrier,
    item.carrier_source_id,
    item.product_line,
    item.agent_id,
    item.agent_name,
    item.agent_npn,
    item.clerk_user_id,
    item.status,
    item.states,
    COALESCE(item.state_appointments, '[]'::jsonb),
    item.writing_number,
    COALESCE(item.certifications, '[]'::jsonb),
    item.cert_date,
    item.termination_date,
    item.effective_date,
    item.notes,
    p_file_hash
  FROM jsonb_to_recordset(p_rows) AS item(
    channel TEXT,
    carrier TEXT,
    carrier_source_id UUID,
    product_line TEXT,
    agent_id UUID,
    agent_name TEXT,
    agent_npn TEXT,
    clerk_user_id TEXT,
    status TEXT,
    states TEXT,
    state_appointments JSONB,
    writing_number TEXT,
    certifications JSONB,
    cert_date TEXT,
    termination_date DATE,
    effective_date DATE,
    notes TEXT
  )
  ON CONFLICT (tenant_id, channel, carrier, product_line, agent_name)
  DO UPDATE SET
    carrier_source_id = EXCLUDED.carrier_source_id,
    agent_id = EXCLUDED.agent_id,
    agent_npn = EXCLUDED.agent_npn,
    clerk_user_id = EXCLUDED.clerk_user_id,
    status = EXCLUDED.status,
    states = EXCLUDED.states,
    state_appointments = EXCLUDED.state_appointments,
    writing_number = EXCLUDED.writing_number,
    certifications = EXCLUDED.certifications,
    cert_date = EXCLUDED.cert_date,
    termination_date = EXCLUDED.termination_date,
    effective_date = EXCLUDED.effective_date,
    notes = EXCLUDED.notes,
    source_file_hash = EXCLUDED.source_file_hash,
    updated_at = NOW();

  RETURN QUERY
  SELECT v_ingestion_id, v_committed_at, v_records_created, v_records_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_rts_ingestion(
  UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_rts_ingestion(
  UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB, JSONB
) TO service_role;

ALTER TABLE public.carrier_rts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rts_ingestion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read carrier_rts" ON public.carrier_rts;
DROP POLICY IF EXISTS "Agents can update their own rows" ON public.carrier_rts;
DROP POLICY IF EXISTS "carrier_rts_tenant_read" ON public.carrier_rts;
CREATE POLICY "carrier_rts_tenant_read"
  ON public.carrier_rts FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "carrier_rts_agent_update" ON public.carrier_rts;
CREATE POLICY "carrier_rts_agent_update"
  ON public.carrier_rts FOR UPDATE TO authenticated
  USING (
    public.is_current_tenant(tenant_id)
    AND (
      clerk_user_id = (auth.jwt() ->> 'sub')
      OR EXISTS (
        SELECT 1
        FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = (auth.jwt() ->> 'sub')
          AND agent.role = 'admin'
          AND agent.is_active = true
      )
    )
  )
  WITH CHECK (
    public.is_current_tenant(tenant_id)
    AND (
      clerk_user_id = (auth.jwt() ->> 'sub')
      OR EXISTS (
        SELECT 1
        FROM public.tenant_agents agent
        WHERE agent.tenant_id = carrier_rts.tenant_id
          AND agent.clerk_user_id = (auth.jwt() ->> 'sub')
          AND agent.role = 'admin'
          AND agent.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS "carrier_rts_service_role" ON public.carrier_rts;
CREATE POLICY "carrier_rts_service_role"
  ON public.carrier_rts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "rts_ingestion_log_tenant_read" ON public.rts_ingestion_log;
CREATE POLICY "rts_ingestion_log_tenant_read"
  ON public.rts_ingestion_log FOR SELECT TO authenticated
  USING (public.is_current_tenant(tenant_id));

DROP POLICY IF EXISTS "rts_ingestion_log_service_role" ON public.rts_ingestion_log;
CREATE POLICY "rts_ingestion_log_service_role"
  ON public.rts_ingestion_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, UPDATE ON public.carrier_rts TO authenticated;
GRANT ALL ON public.carrier_rts TO service_role;
GRANT SELECT ON public.rts_ingestion_log TO authenticated;
GRANT ALL ON public.rts_ingestion_log TO service_role;
