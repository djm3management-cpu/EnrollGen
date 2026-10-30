BEGIN;
ALTER TABLE public.inbound_calls ADD COLUMN paragon_serviceability text
 CHECK(paragon_serviceability IN ('in_state','callback','not_serviceable'));
ALTER TABLE public.paragon_callback_tasks ADD COLUMN due_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN closed_at timestamptz;
CREATE INDEX paragon_callbacks_owner_open ON public.paragon_callback_tasks(tenant_id,assigned_agent_id,due_at) WHERE status='open';

-- Routing's maintained license/appointment matrix and carrier-tier function are
-- authoritative. Offline/busy eligible agents may receive an asynchronous task.
CREATE FUNCTION public.reconcile_paragon_serviceability(p_call uuid,p_tenant uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.inbound_calls; task public.paragon_callback_tasks; owner_slug text; tier text; classification text;
BEGIN
 SELECT i.* INTO c FROM inbound_calls i JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE i.id=p_call AND i.tenant_id=p_tenant AND s.name='Paragon Media' AND s.type='publisher' FOR UPDATE OF i;
 IF c.id IS NULL OR c.confirmed_state IS NULL THEN RAISE EXCEPTION 'Confirmed Paragon call required'; END IF;
 SELECT * INTO task FROM paragon_callback_tasks WHERE inbound_call_id=c.id AND tenant_id=c.tenant_id FOR UPDATE;
 tier:=paragon_agent_tier(c.routed_agent_id,c.confirmed_state,c.lead_source_id);
 IF tier IN ('full','partial') THEN
  classification:='in_state';
 ELSE
  -- Retain an eligible owner on retries; otherwise distribute to the least
  -- recently assigned eligible teammate. There is deliberately no NPN fallback.
  SELECT a.agent_slug INTO owner_slug FROM tenant_agents a
  LEFT JOIN agent_availability av ON av.agent_id=a.agent_slug
  LEFT JOIN LATERAL(SELECT max(t.created_at) assigned_at FROM paragon_callback_tasks t
   WHERE t.tenant_id=a.tenant_id AND t.assigned_agent_id=a.agent_slug) history ON true
  WHERE a.tenant_id=c.tenant_id AND a.is_active AND a.agent_slug IS NOT NULL
   AND a.agent_slug IS DISTINCT FROM c.routed_agent_id
   AND paragon_agent_tier(a.agent_slug,c.confirmed_state,c.lead_source_id) IN ('full','partial')
  ORDER BY (a.agent_slug=task.assigned_agent_id) DESC NULLS LAST,history.assigned_at NULLS FIRST,av.last_assigned_at NULLS FIRST,a.agent_slug
  LIMIT 1;
  classification:=CASE WHEN owner_slug IS NULL THEN 'not_serviceable' ELSE 'callback' END;
 END IF;
 UPDATE inbound_calls SET wrong_state=classification<>'in_state',paragon_serviceability=classification,
  return_reason=CASE classification WHEN 'not_serviceable' THEN 'out_of_state_not_serviceable' WHEN 'callback' THEN 'wrong_state' ELSE NULL END
 WHERE id=c.id AND tenant_id=c.tenant_id;
 IF classification='callback' THEN
  INSERT INTO paragon_callback_tasks(inbound_call_id,tenant_id,assigned_agent_id,caller_state,confirmed_zip,reason,status)
  VALUES(c.id,c.tenant_id,owner_slug,c.confirmed_state,c.confirmed_zip,'wrong_state','open')
  ON CONFLICT(inbound_call_id) DO UPDATE SET assigned_agent_id=excluded.assigned_agent_id,
   caller_state=excluded.caller_state,confirmed_zip=excluded.confirmed_zip,reason='wrong_state',
   status=CASE WHEN paragon_callback_tasks.status='completed' AND paragon_callback_tasks.assigned_agent_id=excluded.assigned_agent_id
     AND paragon_callback_tasks.caller_state=excluded.caller_state THEN 'completed' ELSE 'open' END,
   closed_at=CASE WHEN paragon_callback_tasks.status='completed' AND paragon_callback_tasks.assigned_agent_id=excluded.assigned_agent_id
     AND paragon_callback_tasks.caller_state=excluded.caller_state THEN paragon_callback_tasks.closed_at ELSE NULL END;
 ELSE
  UPDATE paragon_callback_tasks SET status='cancelled',closed_at=now(),
   reason=CASE classification WHEN 'not_serviceable' THEN 'out_of_state_not_serviceable' ELSE 'state_corrected' END
  WHERE inbound_call_id=c.id AND tenant_id=c.tenant_id AND status='open';
 END IF;
 RETURN jsonb_build_object('confirmed',true,'zip',c.confirmed_zip,'state',c.confirmed_state,'tier',tier,
  'wrong_state',classification<>'in_state','callback_agent_id',owner_slug,'serviceability',classification);
END; $$;
CREATE FUNCTION public.confirm_paragon_call_state(p_call uuid,p_tenant uuid,p_agent text,p_zip text,p_state text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM inbound_calls i JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE i.id=p_call AND i.tenant_id=p_tenant AND i.routed_agent_id=p_agent AND i.source_kind='publisher'
 AND s.name='Paragon Media' AND s.type='publisher' FOR UPDATE OF i;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM tenant_agents WHERE tenant_id=p_tenant AND agent_slug=p_agent AND is_active) THEN
  RAISE EXCEPTION 'Paragon call unavailable'; END IF;
 IF p_zip !~ '^[0-9]{5}$' OR p_state !~ '^[A-Z]{2}$' OR NOT EXISTS(
  SELECT 1 FROM zip_county_crosswalk WHERE zip=p_zip AND state_code=p_state) THEN RAISE EXCEPTION 'Invalid confirmed residence'; END IF;
 UPDATE inbound_calls SET confirmed_zip=p_zip,confirmed_state=p_state WHERE id=p_call AND tenant_id=p_tenant;
 RETURN reconcile_paragon_serviceability(p_call,p_tenant);
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_paragon_serviceability(uuid,uuid),public.confirm_paragon_call_state(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_paragon_serviceability(uuid,uuid),public.confirm_paragon_call_state(uuid,uuid,text,text,text) TO service_role;

-- Existing callback records contain ZIP/state confirmed by the original API.
UPDATE inbound_calls i SET confirmed_state=coalesce(i.confirmed_state,t.caller_state),confirmed_zip=coalesce(i.confirmed_zip,t.confirmed_zip)
 FROM paragon_callback_tasks t WHERE t.inbound_call_id=i.id AND t.tenant_id=i.tenant_id AND t.status='open';
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT i.id,i.tenant_id FROM inbound_calls i JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE s.name='Paragon Media' AND s.type='publisher' AND i.confirmed_state IS NOT NULL
 AND (i.wrong_state OR EXISTS(SELECT 1 FROM paragon_callback_tasks t WHERE t.inbound_call_id=i.id AND t.tenant_id=i.tenant_id AND t.status='open'))
 LOOP PERFORM reconcile_paragon_serviceability(c.id,c.tenant_id); END LOOP;
END $$;

-- Add the dispute flag without changing stored billing evidence/rates or the
-- billable threshold. A flag is evidence for a credit request, not a credit.
DROP FUNCTION public.paragon_vendor_report(uuid,timestamptz,timestamptz);
CREATE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text, serviceability text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.vendor_call_id AS call_id,coalesce(f.arrived_at,i.created_at) AS received_at,
    f.caller_phone,coalesce(i.confirmed_state,f.caller_state),f.billable_seconds AS duration_seconds,
    CASE WHEN f.is_billable THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN f.billable_seconds IS NULL THEN 'billing_unverified'
      WHEN f.is_billable THEN NULL WHEN f.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected' WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
      WHEN r.call_outcome='sale_ancillary' THEN 'sale'
      WHEN coalesce(r.vendor_disposition,r.call_outcome,i.status) IN
        ('enrolled','enrolled_pending_verification','partial_enrollment','not_enrolled','incomplete',
         'callback_scheduled','interested_needs_info','spouse_poa_callback','transferred',
         'application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
         'customer_hung_up','do_not_call','requested_removal','no_answer','voicemail_left',
         'wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller',
         'suspected_fraud','dropped_call','test_call','duplicate_lead','rejected','failed',
         'completed','accepted','declined','voicemail','wrong_state')
      THEN coalesce(r.vendor_disposition,r.call_outcome,i.status)
      ELSE 'other' END AS disposition_category,
    CASE i.paragon_serviceability WHEN 'not_serviceable' THEN 'Out of state: not serviceable' WHEN 'callback' THEN 'Paragon callback: out-of-state' ELSE '' END AS serviceability
  FROM paragon_billing_facts f
  LEFT JOIN inbound_calls i ON i.id=f.inbound_call_id AND i.tenant_id=f.tenant_id
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=f.tenant_id
  WHERE f.source_id=p_source_id AND coalesce(f.arrived_at,i.created_at)>=p_start
    AND coalesce(f.arrived_at,i.created_at)<p_end
  ORDER BY coalesce(f.arrived_at,i.created_at) DESC,f.parent_call_sid DESC;
$$;

REVOKE ALL ON FUNCTION public.paragon_vendor_report(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paragon_vendor_report(uuid,timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
