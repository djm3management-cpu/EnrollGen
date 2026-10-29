-- Explicit MA dispositions only. No historical backfill or changes to scoring.
BEGIN;

-- Existing opportunities are conservatively treated as stages set by a person.
ALTER TABLE public.opportunities
  ADD COLUMN stage_change_source text NOT NULL DEFAULT 'manual'
  CHECK (stage_change_source IN ('manual','call_disposition'));
GRANT SELECT (stage_change_source) ON public.opportunities TO authenticated;

CREATE FUNCTION public.mark_manual_opportunity_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN NEW.stage_change_source := 'manual'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_manual_opportunity_stage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mark_manual_opportunity_stage BEFORE UPDATE OF stage_id ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.mark_manual_opportunity_stage();

CREATE TABLE public.call_disposition_opportunity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  call_id uuid NOT NULL REFERENCES public.call_records(id),
  opportunity_id uuid,
  actor_id uuid REFERENCES public.tenant_agents(id),
  old_outcome text,
  new_outcome text,
  action text NOT NULL CHECK (action IN ('created','moved','stage_preserved','enrollment_changed','skipped')),
  reason text,
  stage_id_before uuid,
  stage_id_after uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id,opportunity_id) REFERENCES public.opportunities(tenant_id,id)
);
CREATE INDEX call_disposition_opportunity_log_call
  ON public.call_disposition_opportunity_log(tenant_id,call_id,created_at);
ALTER TABLE public.call_disposition_opportunity_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_disposition_opportunity_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.call_disposition_opportunity_log TO authenticated;
GRANT ALL ON public.call_disposition_opportunity_log TO service_role;
REVOKE ALL ON SEQUENCE public.call_disposition_opportunity_log_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.call_disposition_opportunity_log_id_seq TO service_role;
CREATE POLICY disposition_opportunity_log_tenant ON public.call_disposition_opportunity_log
  FOR SELECT TO authenticated USING (public.opportunities_is_tenant(tenant_id));
CREATE POLICY disposition_opportunity_log_service ON public.call_disposition_opportunity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.sync_ma_disposition_opportunity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid; owner_id uuid; pipeline uuid; dest public.pipeline_stages;
  opp public.opportunities; old_outcome text; action text; reason text;
  before_stage uuid; changed_history_id uuid;
BEGIN
  IF upper(btrim(coalesce(NEW.product_type,''))) <> 'MA' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN old_outcome := OLD.call_outcome; END IF;
  IF coalesce(NEW.call_outcome,'') NOT IN ('enrolled','enrolled_pending_verification')
    AND old_outcome IS DISTINCT FROM 'enrolled' THEN RETURN NEW; END IF;

  SELECT ta.id INTO owner_id FROM public.enrolled_agents e
    JOIN public.tenant_agents ta ON ta.tenant_id=e.tenant_id AND ta.clerk_user_id=e.clerk_user_id
    WHERE e.id=NEW.agent_id AND e.tenant_id=NEW.tenant_id AND e.is_active
      AND coalesce(ta.is_active,true) ORDER BY ta.id LIMIT 1;
  IF auth.role() = 'authenticated' THEN
    SELECT id INTO actor FROM public.tenant_agents WHERE tenant_id=NEW.tenant_id
      AND clerk_user_id=nullif(auth.jwt()->>'sub','') AND coalesce(is_active,true) ORDER BY id LIMIT 1;
    IF actor IS NULL THEN RAISE EXCEPTION 'Agent is outside this workspace' USING ERRCODE='42501'; END IF;
  ELSIF auth.role() = 'service_role' THEN actor := owner_id;
  ELSE RETURN NEW;
  END IF;

  -- Serialize automation for one contact, including retries from different calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || coalesce(NEW.contact_id::text,NEW.id::text) || ':ma-disposition',0));
  SELECT * INTO opp FROM public.opportunities WHERE tenant_id=NEW.tenant_id
    AND call_id=NEW.id AND line_of_business='MA'
    ORDER BY (deleted_at IS NULL) DESC,created_at DESC,id LIMIT 1;
  -- Reuse an open MA opportunity, never another business or an unrelated won sale.
  IF opp.id IS NULL AND NEW.contact_id IS NOT NULL THEN
    SELECT o.* INTO opp FROM public.opportunities o JOIN public.pipelines p ON p.id=o.pipeline_id
      WHERE o.tenant_id=NEW.tenant_id AND o.contact_id=NEW.contact_id AND o.line_of_business='MA'
        AND o.status='open' AND o.deleted_at IS NULL AND (p.line_of_business IS NULL OR p.line_of_business='MA')
      ORDER BY o.updated_at DESC,o.id LIMIT 1;
  END IF;

  IF opp.id IS NOT NULL THEN
    -- Match the board RPC lock order, then re-read after a concurrent manual move.
    PERFORM 1 FROM public.pipelines WHERE id=opp.pipeline_id FOR UPDATE;
    SELECT * INTO opp FROM public.opportunities WHERE id=opp.id FOR UPDATE;
    before_stage := opp.stage_id;
  END IF;
  IF old_outcome = 'enrolled' AND NEW.call_outcome IS DISTINCT FROM 'enrolled' THEN
    action := 'enrollment_changed'; reason := 'Disposition changed away from Enrolled; stage retained';
  ELSIF opp.deleted_at IS NOT NULL THEN
    action := 'skipped'; reason := 'Deleted opportunity retained';
  ELSIF NEW.contact_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE id=NEW.contact_id AND tenant_id=NEW.tenant_id
  ) THEN
    action := 'skipped'; reason := 'No linked contact in this workspace';
  ELSIF opp.id IS NOT NULL AND opp.contact_id IS DISTINCT FROM NEW.contact_id THEN
    action := 'skipped'; reason := 'Call contact differs from the linked opportunity';
  ELSIF actor IS NULL THEN
    action := 'skipped'; reason := 'No active call agent linked to this workspace';
  ELSE
    IF NEW.call_outcome='enrolled_pending_verification' AND opp.id IS NOT NULL
      AND (opp.stage_change_source <> 'call_disposition' OR opp.status <> 'open') THEN
      action := 'stage_preserved'; reason := CASE WHEN opp.stage_change_source <> 'call_disposition'
        THEN 'Pending verification cannot replace a manually set stage'
        ELSE 'Pending verification cannot reopen a closed opportunity' END;
    ELSE
      pipeline := opp.pipeline_id;
      IF pipeline IS NULL THEN
        SELECT id INTO pipeline FROM public.pipelines WHERE tenant_id=NEW.tenant_id
          AND (line_of_business IS NULL OR line_of_business='MA')
          ORDER BY (line_of_business='MA') DESC NULLS LAST,is_default DESC,created_at,id LIMIT 1;
        IF pipeline IS NULL THEN
          INSERT INTO public.pipelines(tenant_id,name,line_of_business)
            VALUES(NEW.tenant_id,'Medicare Advantage','MA') RETURNING id INTO pipeline;
        END IF;
        PERFORM 1 FROM public.pipelines WHERE id=pipeline FOR UPDATE;
      END IF;
      SELECT * INTO dest FROM public.pipeline_stages WHERE tenant_id=NEW.tenant_id AND pipeline_id=pipeline
        AND CASE WHEN NEW.call_outcome='enrolled' THEN is_won
          ELSE lower(btrim(name))='pending' AND NOT is_won AND NOT is_lost END
        ORDER BY (lower(btrim(name))='enrolled') DESC,position,id LIMIT 1;
      IF dest.id IS NULL THEN
        INSERT INTO public.pipeline_stages(tenant_id,pipeline_id,name,position,color,is_won)
          SELECT NEW.tenant_id,pipeline,CASE WHEN NEW.call_outcome='enrolled' THEN 'Enrolled' ELSE 'Pending' END,
            coalesce(max(position),-1)+1,CASE WHEN NEW.call_outcome='enrolled' THEN '#4ade80' ELSE '#fb923c' END,
            NEW.call_outcome='enrolled' FROM public.pipeline_stages WHERE pipeline_id=pipeline RETURNING * INTO dest;
      END IF;
      IF opp.id IS NULL THEN
        SELECT public.save_opportunity(NEW.tenant_id,actor,jsonb_build_object(
          'contact_id',NEW.contact_id,'pipeline_id',pipeline,'stage_id',dest.id,
          'assigned_agent_id',coalesce(owner_id,actor),'line_of_business','MA','title','MA Enrollment',
          'call_id',NEW.id,'carrier',NEW.carrier_name,'plan_name',NEW.plan_name,'effective_date',NEW.effective_date
        )) INTO opp.id;
        action := 'created';
      ELSE
        IF opp.stage_id IS DISTINCT FROM dest.id THEN
          PERFORM public.opportunities_move_internal(opp.id,dest.id,actor,opp.stage_id);
          action := 'moved';
        ELSE action := 'stage_preserved'; reason := 'Already in the disposition stage';
        END IF;
        UPDATE public.opportunities SET call_id=NEW.id,updated_at=clock_timestamp()
          WHERE id=opp.id AND call_id IS DISTINCT FROM NEW.id;
      END IF;
      IF action IN ('created','moved') THEN
        UPDATE public.opportunities SET stage_change_source='call_disposition' WHERE id=opp.id;
        SELECT id INTO changed_history_id FROM public.opportunity_stage_history WHERE opportunity_id=opp.id AND to_stage_id=dest.id
          ORDER BY changed_at DESC,id DESC LIMIT 1;
        UPDATE public.opportunity_events SET payload=payload || jsonb_build_object(
          'source','call_disposition','call_id',NEW.id,'call_outcome',NEW.call_outcome) WHERE history_id=changed_history_id;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.call_disposition_opportunity_log(tenant_id,call_id,opportunity_id,actor_id,
    old_outcome,new_outcome,action,reason,stage_id_before,stage_id_after)
    VALUES(NEW.tenant_id,NEW.id,opp.id,actor,old_outcome,NEW.call_outcome,action,reason,before_stage,
      coalesce((SELECT stage_id FROM public.opportunities WHERE id=opp.id),before_stage));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_ma_disposition_opportunity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_ma_disposition_opportunity
  AFTER INSERT OR UPDATE OF call_outcome,product_type,contact_id,agent_id ON public.call_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_ma_disposition_opportunity();

COMMIT;
