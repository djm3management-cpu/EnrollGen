-- Local annual re-shop review. No CMS writes, outreach, replica or scheduler.
BEGIN;
CREATE TABLE public.reshop_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 enrollment_id uuid NOT NULL REFERENCES public.enrollment_intakes(id), contact_id uuid NOT NULL REFERENCES public.contacts(id),
 agent_id uuid NOT NULL REFERENCES public.enrolled_agents(id), target_year integer NOT NULL,
 task_id uuid REFERENCES public.follow_ups(id) ON DELETE SET NULL,
 outcome text CHECK(outcome IN ('kept_plan','reshopped','could_not_reach','asked_not_to_be_contacted','no_longer_client')),
 reviewed_by text, reviewed_at timestamptz,
 retention_started_at timestamptz NOT NULL,
 UNIQUE(enrollment_id,target_year),
 CHECK ((outcome IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (outcome IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
ALTER TABLE public.reshop_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reshop_reviews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,DELETE ON public.reshop_reviews TO service_role;
CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.reshop_reviews FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable();
CREATE TRIGGER lifecycle_purge_marker BEFORE DELETE ON public.reshop_reviews FOR EACH ROW EXECUTE FUNCTION public.retain_lifecycle_purge_marker();
CREATE INDEX reshop_intake_latest ON public.enrollment_intakes(tenant_id,contact_id,submitted_at DESC,id DESC) WHERE completed_at IS NOT NULL AND NOT is_test_enrollment;
CREATE INDEX reshop_crosswalk_identity ON public.plan_terminations(plan_year,old_contract_id,(lpad(old_plan_id,3,'0')));
CREATE INDEX reshop_landscape_identity ON public.cms_plans_py2027(plan_year,contract_id,(lpad(plan_id,3,'0')),county_fips);
CREATE INDEX reshop_dnc_hash ON public.contacts(tenant_id,phone_hash) WHERE do_not_call;

CREATE FUNCTION public.reshop_coverage(p_type text,p_contract text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN upper(coalesce(p_type,'')) IN ('PDP','PART D') OR upper(p_contract) LIKE 'S%' THEN 'PDP'
 WHEN upper(coalesce(p_type,'')) IN ('MA/MAPD/PDP','MA','MAPD','MA-PD','C-SNP','D-SNP','I-SNP','SNP','HMO','PPO','HMO-POS','PFFS','MSA') THEN 'MA'
 ELSE coalesce(nullif(p_type,''),'Unknown coverage') END
$$;
CREATE FUNCTION public.reshop_year(p_date text) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
 RETURN extract(year FROM p_date::date)::integer;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;
CREATE FUNCTION public.reshop_reason_label(p_code text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_code WHEN 'terminated' THEN 'Plan terminated or not renewed' WHEN 'county_dropped' THEN 'County dropped from service area'
 WHEN 'crosswalked' THEN 'Plan consolidated or crosswalked' WHEN 'low_performing' THEN 'Successor flagged low performing'
 WHEN 'stars_below_3' THEN 'Successor star rating below 3.0' WHEN 'premium_increase' THEN 'Monthly premium increased'
 WHEN 'type_changed' THEN 'Plan type changed' WHEN 'renewing' THEN 'Renewing with no flagged change' END
$$;
-- Inputs are projected CMS facts, not text interpretation. All applicable codes
-- are retained. Current successor coverage never proves a removed county.
CREATE FUNCTION public.reshop_evaluate(c jsonb,transitions jsonb,successors jsonb,loaded boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE codes text[]:='{}'; t jsonb; s jsonb; confirmed boolean:=false; renewal boolean:=false; increase numeric:=0; premium numeric;
BEGIN
 IF c->>'coverage' NOT IN ('MA','PDP') THEN RETURN jsonb_build_object('group','not_covered','reasons','[]'::jsonb,'premium_increase',0,'county_confirmed',false); END IF;
 IF c->>'year' IS NULL THEN RETURN jsonb_build_object('group','effective_date_missing','reasons','[]'::jsonb,'premium_increase',0,'county_confirmed',false); END IF;
 IF NOT coalesce(loaded,false) THEN RETURN jsonb_build_object('group','next_year_not_loaded','reasons','[]'::jsonb,'premium_increase',0,'county_confirmed',false); END IF;
 IF c->>'premium' ~ '^\d+(\.\d{1,2})?$' THEN premium:=(c->>'premium')::numeric; END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(transitions) LOOP
  IF t->>'county_fips'=c->>'county_fips' AND t->>'county_mapping_status' IN ('affected_service_area','current_service_area') THEN confirmed:=true; END IF;
  IF t->>'termination_type'='terminated' THEN codes:=array_append(codes,'terminated'); END IF;
  IF t->>'termination_type'='service_area_reduction' AND t->>'county_mapping_status'='affected_service_area' AND t->>'county_fips'=c->>'county_fips' THEN codes:=array_append(codes,'county_dropped'); END IF;
  IF t->>'termination_type'='consolidated_renewal' OR (t->>'new_contract_id' IS NOT NULL AND t->>'new_plan_id' IS NOT NULL AND (t->>'new_contract_id'<>c->>'contract_id' OR lpad(t->>'new_plan_id',3,'0')<>c->>'plan_id')) THEN codes:=array_append(codes,'crosswalked'); END IF;
  IF t->>'termination_type' IN ('renewal','consolidated_renewal','service_area_reduction') THEN renewal:=true; END IF;
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(successors) LOOP
  IF s->>'low_performing'='true' THEN codes:=array_append(codes,'low_performing'); END IF;
  IF (s->>'overall_star_rating')::numeric<3 THEN codes:=array_append(codes,'stars_below_3'); END IF;
  IF premium IS NOT NULL AND (s->>'monthly_premium')::numeric>premium THEN
   codes:=array_append(codes,'premium_increase'); increase:=greatest(increase,(s->>'monthly_premium')::numeric-premium);
  END IF;
  IF nullif(c->>'plan_type','') IS NOT NULL AND nullif(s->>'plan_type','') IS NOT NULL AND c->>'plan_type'<>s->>'plan_type' THEN codes:=array_append(codes,'type_changed'); END IF;
 END LOOP;
 SELECT coalesce(array_agg(code ORDER BY ord),'{}') INTO codes FROM unnest(ARRAY['terminated','county_dropped','crosswalked','low_performing','stars_below_3','premium_increase','type_changed']) WITH ORDINALITY a(code,ord) WHERE code=ANY(codes);
 IF cardinality(codes)=0 AND renewal AND jsonb_array_length(successors)>0 AND confirmed THEN codes:=ARRAY['renewing']; END IF;
 RETURN jsonb_build_object('group',CASE WHEN codes=ARRAY['renewing'] THEN 'renewing' WHEN cardinality(codes)>0 THEN 'needs_review' ELSE 'cms_not_confirmed' END,'reasons',to_jsonb(codes),'premium_increase',increase,'county_confirmed',confirmed);
END $$;

-- Annual source adapter reads only the existing CMS landscape for the requested
-- year. It does not copy, relabel, load or modify the reference data. A future
-- canonical annual table uses the same reviewed columns and publication model.
CREATE FUNCTION public.reshop_landscape_loaded(p_year integer) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE relation regclass; answer boolean;
BEGIN
 IF p_year IS NULL OR p_year<1900 OR p_year>3000 THEN RETURN false; END IF;
 relation:=to_regclass(format('public.cms_plans_py%s',p_year));
 IF relation IS NULL THEN RETURN false; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE plan_year=$1)',relation) INTO answer USING p_year;
 RETURN answer;
END $$;
CREATE FUNCTION public.reshop_plan_rows(p_year integer,p_contract text,p_plan text)
RETURNS TABLE(contract_id text,plan_id text,segment_id text,county_fips text,state_code text,carrier text,plan_type text,monthly_premium numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE relation regclass;
BEGIN
 IF p_year IS NULL OR p_year<1900 OR p_year>3000 THEN RETURN; END IF;
 relation:=to_regclass(format('public.cms_plans_py%s',p_year));
 IF relation IS NULL THEN RETURN; END IF;
 RETURN QUERY EXECUTE format('SELECT contract_id,plan_id,segment_id,county_fips,state_code,carrier,plan_type,monthly_premium FROM %s WHERE plan_year=$1 AND contract_id=$2 AND lpad(plan_id,3,''0'')=$3',relation) USING p_year,p_contract,p_plan;
END $$;

-- Private set-based source. Latest enrollment is chosen BEFORE applying writer
-- scope, so a superseded intake can never reappear for a former writing agent.
CREATE FUNCTION public.reshop_rows(p_actor text,p_org text,p_id uuid DEFAULT NULL) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE identity record;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('RESHOP_LIST_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 IF identity.tenant_id IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 WITH latest AS MATERIALIZED (
  SELECT DISTINCT ON(e.contact_id,public.reshop_coverage(e.data->>'planType',e.data->>'contractId')) e.*,
   public.reshop_coverage(e.data->>'planType',e.data->>'contractId') coverage
  FROM public.enrollment_intakes e WHERE e.tenant_id=identity.tenant_id AND e.completed_at IS NOT NULL AND NOT e.is_test_enrollment
  ORDER BY e.contact_id,public.reshop_coverage(e.data->>'planType',e.data->>'contractId'),e.submitted_at DESC,e.completed_at DESC,e.id DESC
 ), source AS MATERIALIZED (
  SELECT e.id,e.contact_id,e.tenant_id,e.coverage,e.submitted_at,e.retention_started_at,e.data,
   ea.id agent_id,a.agent_slug,a.name agent_name,upper(btrim(e.data->>'contractId')) contract_id,
   CASE WHEN e.data->>'planId' ~ '^\d{1,3}$' THEN lpad(e.data->>'planId',3,'0') END plan_id,
   CASE WHEN e.data->>'segmentId' ~ '^\d{1,3}$' THEN lpad(e.data->>'segmentId',3,'0') END segment_id,
   public.reshop_year(e.data->>'effectiveDate') enrollment_year,coalesce(nullif(c.state,''),e.data->>'state') state,
   CASE WHEN c.county ~ '^\d{5}$' THEN c.county ELSE geo.county_fips END county_fips,
   coalesce(nullif(e.data->>'newCarrier',''),e.carrier_key) carrier,
   CASE WHEN e.data->>'premium' ~ '^\$?\d+(\.\d{1,2})?$' THEN replace(e.data->>'premium','$','') END premium
  FROM latest e JOIN public.contacts c ON c.id=e.contact_id AND c.tenant_id=e.tenant_id
  JOIN public.call_records cr ON cr.id=e.call_id AND cr.tenant_id=e.tenant_id
  JOIN public.enrolled_agents ca ON ca.id=cr.agent_id AND ca.tenant_id=e.tenant_id
  JOIN public.tenant_agents a ON a.tenant_id=e.tenant_id AND
   CASE WHEN nullif(e.data->>'writingAgentId','') IS NOT NULL THEN a.id::text=e.data->>'writingAgentId'
    WHEN nullif(e.data->>'writingAgentSlug','') IS NOT NULL THEN a.agent_slug=e.data->>'writingAgentSlug'
    WHEN nullif(e.data->>'aor','') IS NOT NULL THEN a.agent_slug=lower(replace(e.data->>'aor',' ','_'))
    ELSE a.clerk_user_id=ca.clerk_user_id END
  JOIN public.enrolled_agents ea ON ea.clerk_user_id=a.clerk_user_id AND ea.tenant_id=e.tenant_id
  LEFT JOIN LATERAL (SELECT min(z.county_fips) county_fips FROM public.zip_county_crosswalk z WHERE z.state_code=c.state AND lower(z.county_name)=lower(c.county) HAVING count(DISTINCT z.county_fips)=1) geo ON true
  WHERE (p_id IS NULL OR e.id=p_id) AND (identity.authority='admin' OR identity.authority='agent' AND ea.id=identity.agent_id OR identity.authority='manager' AND ea.id=ANY(identity.team_agent_ids))
   AND NOT c.do_not_call AND NOT EXISTS(SELECT 1 FROM public.contacts d WHERE d.tenant_id=c.tenant_id AND d.do_not_call AND (d.phone_hash=c.phone_hash OR public.normalize_phone_e164(d.phone)=public.normalize_phone_e164(c.phone)))
   AND NOT EXISTS(SELECT 1 FROM public.opportunities o JOIN public.pipeline_stages s ON s.id=o.stage_id AND s.tenant_id=o.tenant_id WHERE o.contact_id=c.id AND o.tenant_id=c.tenant_id AND lower(s.name)='disenrolled')
 ), keyed AS MATERIALIZED (
  SELECT s.*,jsonb_build_array(contract_id,plan_id,segment_id,enrollment_year,state,county_fips,carrier,premium,coverage,CASE WHEN data->>'planType' IN ('HMO','PPO','HMO-POS','PFFS','MSA') THEN data->>'planType' END)::text fact_key FROM source s
 ), keys AS MATERIALIZED (
  SELECT DISTINCT fact_key, contract_id,plan_id,segment_id,enrollment_year,state,county_fips,carrier,premium,coverage,
   CASE WHEN data->>'planType' IN ('HMO','PPO','HMO-POS','PFFS','MSA') THEN data->>'planType' END recorded_type FROM keyed
 ), facts AS MATERIALIZED (
  SELECT k.*,coalesce(current_plan.plan_type,k.recorded_type) plan_type,
   coalesce(x.transitions,'[]') transitions,coalesce(next_plans.successors,'[]') successors,
   public.reshop_landscape_loaded(k.enrollment_year+1) AND EXISTS(SELECT 1 FROM public.plan_terminations w WHERE w.plan_year=k.enrollment_year+1) loaded
  FROM keys k
  LEFT JOIN LATERAL (SELECT l.plan_type,l.carrier FROM public.reshop_plan_rows(k.enrollment_year,k.contract_id,k.plan_id) l WHERE true AND lpad(l.segment_id,3,'0')=k.segment_id AND l.county_fips=k.county_fips AND l.state_code=k.state LIMIT 1) current_plan ON true
  LEFT JOIN LATERAL (
   SELECT jsonb_agg(DISTINCT jsonb_build_object('termination_type',w.termination_type,'source_status',w.source_status,'county_mapping_status',w.county_mapping_status,'county_fips',w.county_fips,'new_contract_id',w.new_contract_id,'new_plan_id',w.new_plan_id)) transitions
   FROM public.plan_terminations w WHERE w.plan_year=k.enrollment_year+1 AND w.old_contract_id=k.contract_id AND lpad(w.old_plan_id,3,'0')=k.plan_id
  ) x ON true
  LEFT JOIN LATERAL (
   SELECT jsonb_agg(DISTINCT jsonb_build_object('contract_id',l.contract_id,'plan_id',lpad(l.plan_id,3,'0'),'segment_id',lpad(l.segment_id,3,'0'),'plan_type',l.plan_type,'monthly_premium',l.monthly_premium,'overall_star_rating',sr.overall_star_rating,'low_performing',sr.low_performing)) successors
   FROM (SELECT DISTINCT t->>'new_contract_id' contract_id,lpad(t->>'new_plan_id',3,'0') plan_id FROM jsonb_array_elements(coalesce(x.transitions,'[]')) t WHERE t->>'termination_type'<>'terminated') targets CROSS JOIN LATERAL public.reshop_plan_rows(k.enrollment_year+1,targets.contract_id,targets.plan_id) l LEFT JOIN public.star_ratings_by_county sr ON sr.plan_year=k.enrollment_year+1 AND sr.contract_id=l.contract_id AND sr.county_fips=l.county_fips
   WHERE l.county_fips=k.county_fips AND l.state_code=k.state
    AND (l.contract_id=k.contract_id OR lower(btrim(l.carrier))=lower(btrim(coalesce(current_plan.carrier,k.carrier))))
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(x.transitions,'[]')) t WHERE t->>'termination_type'<>'terminated' AND t->>'new_contract_id'=l.contract_id AND lpad(t->>'new_plan_id',3,'0')=lpad(l.plan_id,3,'0') AND (t->>'county_fips'=k.county_fips OR t->>'county_fips' IS NULL))
    -- Crosswalk has no segment mapping. A same-plan renewal retains the exact
    -- enrolled segment; changed-plan successors expose their actual segments.
    AND (l.contract_id<>k.contract_id OR lpad(l.plan_id,3,'0')<>k.plan_id OR lpad(l.segment_id,3,'0')=k.segment_id)
  ) next_plans ON true
 ), compared AS MATERIALIZED (
  SELECT f.*,public.reshop_evaluate(jsonb_build_object('coverage',coverage,'year',enrollment_year,'county_fips',county_fips,'contract_id',contract_id,'plan_id',plan_id,'plan_type',plan_type,'premium',premium),transitions,successors,loaded) comparison FROM facts f
 ), permissions AS MATERIALIZED (
  SELECT cr.contact_id,(array_agg(jsonb_build_object('on_file',cr.ptc_on_file,'date',cr.ptc_date,'expiry',cr.ptc_expiry) ORDER BY coalesce(cr.ptc_date::timestamptz,cr.call_start::timestamptz,cr.created_at) DESC,cr.id DESC))[1] ptc
  FROM public.call_records cr WHERE cr.tenant_id=identity.tenant_id AND cr.contact_id IN (SELECT contact_id FROM source) GROUP BY cr.contact_id
 )
 SELECT jsonb_build_object('id',s.id,'contact_id',s.contact_id,'agent_id',s.agent_id,'agent',s.agent_name,'agent_slug',s.agent_slug,'carrier',s.carrier,'state',s.state,
  'coverage',s.coverage,'enrolled_at',s.submitted_at,'year',s.enrollment_year,'target_year',s.enrollment_year+1,'county_fips',s.county_fips,
  'current',jsonb_build_object('contract_id',s.contract_id,'plan_id',s.plan_id,'segment_id',s.segment_id,'plan_type',f.plan_type,'premium',s.premium),
  'successors',CASE WHEN f.loaded AND s.coverage IN ('MA','PDP') THEN f.successors ELSE '[]'::jsonb END,'cms_transitions',CASE WHEN f.loaded AND s.coverage IN ('MA','PDP') THEN (SELECT coalesce(jsonb_agg(t.value-ARRAY['new_contract_id','new_plan_id']),'[]') FROM jsonb_array_elements(f.transitions) t) ELSE '[]'::jsonb END,
  'permission',coalesce(p.ptc,'{}'),'review',jsonb_build_object('outcome',r.outcome,'actor',r.reviewed_by,'time',r.reviewed_at,'task_id',r.task_id))||f.comparison
 FROM keyed s JOIN compared f ON s.fact_key=f.fact_key
 LEFT JOIN public.reshop_reviews r ON r.enrollment_id=s.id AND r.target_year=s.enrollment_year+1
 LEFT JOIN permissions p ON p.contact_id=s.contact_id;
END $$;

CREATE FUNCTION public.read_reshop_list(p_actor text,p_org text,p_filters jsonb DEFAULT '{}',p_offset integer DEFAULT 0,p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; item jsonb; consumer public.contacts; identity record;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>200 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR p_filters-ARRAY['reason','agent','carrier','state','review']<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023'; END IF;
 WITH rows AS MATERIALIZED (SELECT value r FROM public.reshop_rows(p_actor,p_org) value),
 filtered AS MATERIALIZED (SELECT r FROM rows WHERE (NOT p_filters ? 'reason' OR r->'reasons' ? (p_filters->>'reason')) AND (NOT p_filters ? 'agent' OR r->>'agent_id'=p_filters->>'agent') AND (NOT p_filters ? 'carrier' OR r->>'carrier'=p_filters->>'carrier') AND (NOT p_filters ? 'state' OR r->>'state'=p_filters->>'state') AND (NOT p_filters ? 'review' OR coalesce(r#>>'{review,outcome}','unreviewed')=p_filters->>'review')),
 page AS (SELECT r,row_number() OVER (ORDER BY CASE r->>'group' WHEN 'needs_review' THEN 0 WHEN 'renewing' THEN 1 ELSE 2 END,array_position(ARRAY['terminated','county_dropped','crosswalked','low_performing','stars_below_3','premium_increase','type_changed','renewing'],r#>>'{reasons,0}'),(r->>'premium_increase')::numeric DESC,(r->>'enrolled_at')::timestamptz ASC,r->>'id') position FROM filtered ORDER BY position LIMIT p_limit OFFSET p_offset)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(r ORDER BY position) FROM page),'[]'),'total',(SELECT count(*) FROM filtered),'counts',coalesce((SELECT jsonb_object_agg(code,n) FROM (SELECT code,count(*) n FROM filtered CROSS JOIN LATERAL jsonb_array_elements_text(r->'reasons') code GROUP BY code) counts),'{}'),
 'options',jsonb_build_object('agents',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',r->>'agent_id','name',r->>'agent')) FROM rows),'[]'),'carriers',coalesce((SELECT jsonb_agg(DISTINCT r->>'carrier') FROM rows),'[]'),'states',coalesce((SELECT jsonb_agg(DISTINCT r->>'state') FROM rows),'[]')),'offset',p_offset,'limit',p_limit) INTO result;
 -- Only names for the returned page are decrypted, inside the existing HTTP
 -- evidence boundary. Full contact opens still use the existing audited path.
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 FOR item IN SELECT value FROM jsonb_array_elements(result->'rows') LOOP
  SELECT * INTO consumer FROM public.contacts WHERE id=(item->>'contact_id')::uuid AND tenant_id=identity.tenant_id;
  INSERT INTO public.pii_access_log(contact_id,agent_id,clerk_user_id,action) VALUES(consumer.id,identity.roster_id,p_actor,'view');
  item:=item||jsonb_build_object('client',concat_ws(' ',public.decrypt_pii_value(consumer.pii_encrypted->'first_name'),public.decrypt_pii_value(consumer.pii_encrypted->'last_name')));
  result:=jsonb_set(result,ARRAY['rows',(SELECT (ordinality-1)::text FROM jsonb_array_elements(result->'rows') WITH ORDINALITY r WHERE r.value->>'id'=item->>'id')],item);
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION public.act_on_reshop(p_actor text,p_org text,p_id uuid,p_action text,p_outcome text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item jsonb; record public.reshop_reviews; task uuid; anchor timestamptz; identity record;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('task','review') OR p_action='review' AND (p_outcome IS NULL OR p_outcome NOT IN ('kept_plan','reshopped','could_not_reach','asked_not_to_be_contacted','no_longer_client')) THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 -- Enrollment lock serializes task/review retries. Scope/exclusions are checked
 -- again after the lock using the current canonical enrollment and CMS rows.
 PERFORM 1 FROM public.enrollment_intakes WHERE id=p_id FOR UPDATE;
 SELECT value INTO item FROM public.reshop_rows(p_actor,p_org,p_id) value;
 IF item IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 IF item->>'target_year' IS NULL THEN RAISE EXCEPTION 'Effective date required' USING ERRCODE='22023'; END IF;
 SELECT * INTO identity FROM public.resolve_deployment_subject(p_actor,p_org);
 IF identity.authority='admin' AND NOT EXISTS(SELECT 1 FROM public.admin_action_permit WHERE transaction_id=txid_current()) THEN RAISE EXCEPTION 'Audited administrator required' USING ERRCODE='42501'; END IF;
 SELECT retention_started_at INTO anchor FROM public.enrollment_intakes WHERE id=p_id;
 INSERT INTO public.reshop_reviews(tenant_id,enrollment_id,contact_id,agent_id,target_year,retention_started_at) VALUES(identity.tenant_id,p_id,(item->>'contact_id')::uuid,(item->>'agent_id')::uuid,(item->>'target_year')::integer,anchor) ON CONFLICT(enrollment_id,target_year) DO NOTHING;
 SELECT * INTO record FROM public.reshop_reviews WHERE enrollment_id=p_id AND target_year=(item->>'target_year')::integer FOR UPDATE;
 IF p_action='task' THEN
  IF item#>>'{reasons,0}' IS NULL THEN RAISE EXCEPTION 'CMS reason required' USING ERRCODE='22023'; END IF;
  task:=record.task_id;
  IF task IS NULL THEN
   INSERT INTO public.follow_ups(tenant_id,contact_id,agent_id,due_at,reason) VALUES(identity.tenant_id,record.contact_id,item->>'agent_slug',clock_timestamp(),public.reshop_reason_label(item#>>'{reasons,0}')) RETURNING id INTO task;
   UPDATE public.reshop_reviews SET task_id=task WHERE id=record.id;
  END IF;
 ELSE
  IF record.outcome IS NOT NULL AND record.outcome<>p_outcome THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='40001'; END IF;
  UPDATE public.reshop_reviews SET outcome=p_outcome,reviewed_by=p_actor,reviewed_at=clock_timestamp() WHERE id=record.id AND outcome IS NULL;
 END IF;
 SELECT * INTO record FROM public.reshop_reviews WHERE id=record.id;
 RETURN jsonb_build_object('task_id',record.task_id,'outcome',record.outcome,'actor',record.reviewed_by,'time',record.reviewed_at,'use_do_not_call_control',record.outcome='asked_not_to_be_contacted');
END $$;

DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.execute_admin_action(text,text,text,uuid,jsonb,boolean)'::regprocedure) INTO d;
 d:=replace(d,'''tenant_settings'',''contact_assignment''','''reshop_list'',''tenant_settings'',''contact_assignment''');
 d:=replace(d,'''set_vendor_pause'',''save_opportunity_pipeline''','''act_on_reshop'',''set_vendor_pause'',''save_opportunity_pipeline'''); EXECUTE d;
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO d;
 d:=replace(d,'''feature_conference_calling_enabled''','''feature_reshop_list_enabled'',''feature_conference_calling_enabled'''); EXECUTE d;
 SELECT pg_get_functiondef('public.capture_lifecycle_purge_marker(text,uuid)'::regprocedure) INTO d;
 d:=replace(d,'IF p_table<>ALL(ARRAY[','IF p_table<>ALL(ARRAY[''reshop_reviews'','); EXECUTE d;
 SELECT pg_get_functiondef('public.consumer_lifecycle_rows(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'WITH listen_events AS (','WITH reshop_events AS (SELECT ''reshop_reviews:''||r.id::text||'':reshop_review'' key,''reshop_review''::text type,r.reviewed_at "time",r.reviewed_by staff,''reviewed''::text status,''Annual re-shop reviewed''::text summary,jsonb_build_array(jsonb_build_object(''table'',''reshop_reviews'',''id'',r.id,''time'',r.reviewed_at)) evidence,jsonb_build_object(''outcome'',r.outcome,''targetYear'',r.target_year) details FROM public.reshop_reviews r WHERE r.contact_id=p_contact AND r.tenant_id=p_tenant AND r.reviewed_at IS NOT NULL AND public.deployment_feature_enabled(''RESHOP_LIST_ENABLED'')), listen_events AS (');
 d:=replace(d,'SELECT * FROM recap_events UNION ALL','SELECT * FROM reshop_events UNION ALL SELECT * FROM recap_events UNION ALL'); EXECUTE d;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'reshop_%' OR pronamespace='public'::regnamespace AND proname IN ('read_reshop_list','act_on_reshop') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.read_reshop_list(text,text,jsonb,integer,integer),public.act_on_reshop(text,text,uuid,text,text) TO service_role;
COMMIT;
