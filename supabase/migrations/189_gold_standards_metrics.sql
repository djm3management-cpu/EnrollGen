-- UNAPPLIED: isolated pilot only
-- Gold Standards attribution and metrics (docs/feature-gold-standards.md,
-- items 3 and 4). Read only. Fenced by GOLD_STANDARDS_METRICS_ENABLED.
-- 1. enrollment_attribution(p_tenant): one row per qualifying enrollment
--    (gold_enrollments in 188, the re-shop selection) with agency, writing
--    agent, carrier, product line, plan type, SNP type from the plan year
--    landscape, lead source and sub id from the originating inbound call and
--    its ping decision, the call, submitted date and effective date. A missing
--    link is null; the enrollment still counts.
-- 2. gold_facts(p_tenants,p_from,p_to,p_plan_year): the facts the metrics
--    need, with no names, phones, MBIs or dates of birth.
-- 3. gold_standard_compute(p_facts,p_from,p_to,p_group,p_network): the metric
--    math on facts only. telephony/src/ping/goldStandards.js mirrors it
--    exactly and the property tests compare both on generated facts.
-- 4. gold_standard_scorecard(p_tenant,...) for one agency (the buyer and
--    agency admin views) and gold_standard_network_scorecard(...) for the
--    operator, which returns aggregates only.
-- Definitions (implemented exactly; see the feature doc):
--   period end = effective date + 3 calendar months (month end clamps).
--   retained   = effectuated and no disenrolled or terminated_by_carrier
--                event effective before the period end, unless a later
--                reinstatement (higher seq) effective on or before that loss
--                date restores continuous coverage.
--   matured    = effectuated, period end <= p_to and <= the latest imported
--                member status file date for the member's carrier. Other
--                effectuated members are pending and leave both numerator and
--                denominator.
--   member-months = sum of days from effective date to the earlier of
--                coverage end or p_to, divided by 30.4375.
--   rates      = point estimate plus a Wilson score interval at z = 1.96;
--                n = 0 gives null rate and null interval, never zero.
-- Service role only. Forward only. Never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Normalized SNP label from the landscape row: non_snp when the plan is not
-- a SNP, null when the landscape has no row (unknown, never guessed).
CREATE FUNCTION public.gold_snp_label(p_category text,p_snp_type text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_category IS NULL THEN NULL
  WHEN p_category<>'SNP' THEN 'non_snp'
  WHEN upper(coalesce(p_snp_type,'')) LIKE '%DUAL%' OR upper(coalesce(p_snp_type,''))='D-SNP' THEN 'D-SNP'
  WHEN upper(coalesce(p_snp_type,'')) LIKE '%CHRONIC%' OR upper(coalesce(p_snp_type,''))='C-SNP' THEN 'C-SNP'
  WHEN upper(coalesce(p_snp_type,'')) LIKE '%INSTITUTION%' OR upper(coalesce(p_snp_type,''))='I-SNP' THEN 'I-SNP'
  ELSE 'SNP' END
$$;

-- The enrolled agent that answered an inbound call (answered_agent_id is the
-- roster slug), or null.
CREATE FUNCTION public.gold_call_agent(p_tenant uuid,p_slug text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT e.id FROM public.tenant_agents a JOIN public.enrolled_agents e ON e.tenant_id=a.tenant_id AND e.clerk_user_id=a.clerk_user_id
 WHERE a.tenant_id=p_tenant AND a.agent_slug=p_slug ORDER BY e.id LIMIT 1
$$;

-- Earliest ready to sell date for the plan year, from carrier_rts.effective_date
-- on rows with a ready status (the same statuses 182 treats as active). cert_date
-- is never parsed.
CREATE FUNCTION public.gold_agent_rts_date(p_tenant uuid,p_agent uuid,p_year integer) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT min(r.effective_date) FROM public.carrier_rts r
 JOIN public.tenant_agents a ON a.id=r.agent_id AND a.tenant_id=r.tenant_id
 JOIN public.enrolled_agents e ON e.clerk_user_id=a.clerk_user_id AND e.tenant_id=a.tenant_id
 WHERE r.tenant_id=p_tenant AND e.id=p_agent AND r.effective_date IS NOT NULL
  AND extract(year FROM r.effective_date)=p_year AND lower(btrim(coalesce(r.status,''))) IN ('active','rts','complete')
$$;

-- The originating inbound call of an enrollment: earliest inbound row bound to
-- the intake's call record.
CREATE FUNCTION public.gold_origin_call(p_tenant uuid,p_call uuid)
RETURNS TABLE(inbound_id uuid,call_sid text,source_id uuid,sub_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT i.id,i.twilio_call_sid,i.lead_source_id,
  (SELECT d.publisher_sub_id FROM public.ping_decisions d WHERE d.matched_call_sid=i.twilio_call_sid AND d.tenant_id=p_tenant
    AND d.engine IN ('generic','exchange') ORDER BY d.received_at,d.id LIMIT 1)
 FROM public.inbound_calls i WHERE i.tenant_id=p_tenant AND i.call_record_id=p_call ORDER BY i.created_at,i.id LIMIT 1
$$;

-- 1. Attribution, one row per qualifying (latest) enrollment.
CREATE FUNCTION public.enrollment_attribution(p_tenant uuid)
RETURNS TABLE(enrollment_intake_id uuid,tenant_id uuid,agent_id uuid,carrier text,product_line text,plan_type text,snp_type text,
  lead_source_id uuid,sub_id text,inbound_call_id uuid,call_record_id uuid,submitted_date date,effective_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('GOLD_STANDARDS_METRICS_ENABLED') THEN
  RAISE EXCEPTION 'Gold Standards metrics disabled' USING ERRCODE='42501'; END IF;
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'Tenant required' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT g.id,g.tenant_id,g.agent_id,g.carrier,g.coverage,g.plan_type,public.gold_snp_label(g.category,g.snp_type),
  o.source_id,o.sub_id,o.inbound_id,g.call_id,(g.submitted_at AT TIME ZONE public.ping_tenant_zone(g.tenant_id))::date,g.effective_date
 FROM public.gold_enrollments(p_tenant) g LEFT JOIN LATERAL public.gold_origin_call(g.tenant_id,g.call_id) o ON true
 WHERE g.latest ORDER BY g.submitted_at,g.id;
END $$;

-- 2. Facts for the metric math. Private.
CREATE FUNCTION public.gold_facts(p_tenants uuid[],p_from date,p_to date,p_plan_year integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH agents AS (
  SELECT e.id agent,e.tenant_id tenant,public.gold_agent_rts_date(e.tenant_id,e.id,p_plan_year) rts_date
  FROM public.enrolled_agents e WHERE e.tenant_id=ANY(p_tenants)
 ), enr AS (
  SELECT g.*,(g.submitted_at AT TIME ZONE public.ping_tenant_zone(g.tenant_id))::date submitted,o.source_id,o.sub_id
  FROM unnest(p_tenants) t(id) CROSS JOIN LATERAL public.gold_enrollments(t.id) g
  LEFT JOIN LATERAL public.gold_origin_call(g.tenant_id,g.call_id) o ON true
  WHERE g.latest
 ), calls AS (
  SELECT i.tenant_id,i.lead_source_id,i.twilio_call_sid,(i.created_at AT TIME ZONE public.ping_tenant_zone(i.tenant_id))::date AS call_day,
   public.gold_call_agent(i.tenant_id,i.answered_agent_id) agent
  FROM public.inbound_calls i WHERE i.tenant_id=ANY(p_tenants)
   AND i.created_at>=(p_from::timestamp AT TIME ZONE 'UTC')-interval '1 day' AND i.created_at<(p_to::timestamp AT TIME ZONE 'UTC')+interval '1 day'
 )
 SELECT jsonb_build_object(
  'enrollments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'tenant',e.tenant_id,'member',coalesce(e.mbi_match_key,'intake:'||e.id::text),
    'coverage',e.coverage,'carrier',e.carrier,'agent',e.agent_id,
    'cohort_month',CASE WHEN e.agent_id IS NULL THEN NULL ELSE coalesce((SELECT to_char(a.rts_date,'YYYY-MM') FROM agents a WHERE a.agent=e.agent_id),'unknown') END,
    'source',e.source_id,'sub_id',e.sub_id,'snp_type',public.gold_snp_label(e.category,e.snp_type),'submitted',e.submitted,'effective',e.effective_date,
    'as_of',(SELECT max(f.file_as_of) FROM public.member_status_import_files f WHERE f.tenant_id=e.tenant_id AND f.kind='member_status' AND upper(f.carrier)=upper(e.carrier)),
    'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('type',m.event_type,'date',m.event_effective_date,'seq',m.seq) ORDER BY m.seq),'[]')
      FROM public.member_status_events m WHERE m.enrollment_intake_id=e.id AND m.tenant_id=e.tenant_id),
    'ctms',(SELECT coalesce(jsonb_agg(c.received_date ORDER BY c.received_date),'[]') FROM public.ctm_records c WHERE c.enrollment_intake_id=e.id AND c.tenant_id=e.tenant_id),
    'activation_completed',EXISTS(SELECT 1 FROM public.activation_tasks t WHERE t.enrollment_intake_id=e.id AND t.tenant_id=e.tenant_id AND t.status='completed'))
    ORDER BY e.tenant_id,e.id) FROM enr e WHERE e.submitted>=p_from AND e.submitted<p_to),'[]'),
  'calls',coalesce((SELECT jsonb_agg(jsonb_build_object('tenant',c.tenant_id,'source',c.lead_source_id,
    'sub_id',(SELECT d.publisher_sub_id FROM public.ping_decisions d WHERE d.matched_call_sid=c.twilio_call_sid AND d.tenant_id=c.tenant_id AND d.engine IN ('generic','exchange') ORDER BY d.received_at,d.id LIMIT 1),
    'agent',c.agent,'cohort_month',CASE WHEN c.agent IS NULL THEN NULL ELSE coalesce((SELECT to_char(a.rts_date,'YYYY-MM') FROM agents a WHERE a.agent=c.agent),'unknown') END,
    'date',c.call_day,
    'cost',(SELECT CASE WHEN b.finalized_at IS NULL THEN NULL WHEN b.billable_seconds>=b.billable_threshold_seconds THEN b.rate ELSE 0 END
      FROM public.ping_call_billing b WHERE b.parent_call_sid=c.twilio_call_sid AND b.tenant_id=c.tenant_id))
    ORDER BY c.tenant_id,c.twilio_call_sid) FROM calls c WHERE c.call_day>=p_from AND c.call_day<p_to),'[]'),
  'agents',coalesce((SELECT jsonb_agg(jsonb_build_object('agent',a.agent,'tenant',a.tenant,'rts_date',a.rts_date) ORDER BY a.tenant,a.agent) FROM agents a),'[]'))
$$;

-- Rounds a float8 the way PostgreSQL casts it (15 significant digits), then
-- to p_places half away from zero.
CREATE FUNCTION public.gold_round(p_value double precision,p_places integer) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT round(p_value::numeric,p_places) $$;

-- Point estimate and Wilson score interval (z = 1.96) for x of n, where
-- n = p_num / p_den exactly (p_den is 30.4375 for member-months), scaled by
-- p_scale (1, or 1000 for per thousand rates). n <= 0 or null gives nulls.
-- The interval is null when x > n (a rate that is not a proportion).
CREATE FUNCTION public.gold_wilson(p_x numeric,p_num numeric,p_den numeric DEFAULT 1,p_scale numeric DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n double precision; p double precision; z double precision:=1.96; z2 double precision; denom double precision;
  center double precision; half double precision; lo double precision; hi double precision;
BEGIN
 IF p_num IS NULL OR p_x IS NULL OR p_num<=0 THEN RETURN jsonb_build_object('rate',NULL,'lo',NULL,'hi',NULL); END IF;
 IF p_x*p_den>p_num THEN RETURN jsonb_build_object('rate',round(p_scale*p_x*p_den/p_num,6),'lo',NULL,'hi',NULL); END IF;
 n:=p_num::double precision/p_den::double precision; p:=p_x::double precision/n; z2:=z*z;
 denom:=1+z2/n;
 center:=(p+z2/(2*n))/denom;
 half:=z*sqrt(p*(1-p)/n+z2/(4*n*n))/denom;
 lo:=greatest(0::double precision,center-half); hi:=least(1::double precision,center+half);
 RETURN jsonb_build_object('rate',round(p_scale*p_x*p_den/p_num,6),'lo',public.gold_round(p_scale::double precision*lo,6),'hi',public.gold_round(p_scale::double precision*hi,6));
END $$;

-- Metric rows for one grouping. Private.
CREATE FUNCTION public.gold_metric_rows(p_facts jsonb,p_from date,p_to date,p_group text[])
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH e0 AS (
  SELECT x.* FROM jsonb_to_recordset(coalesce(p_facts->'enrollments','[]')) AS x(id text,tenant text,member text,coverage text,carrier text,agent text,
   cohort_month text,source text,sub_id text,snp_type text,submitted date,effective date,as_of date,events jsonb,ctms jsonb,activation_completed boolean)
  WHERE x.submitted>=p_from AND x.submitted<p_to
 ), e AS (
  SELECT * FROM (SELECT e0.*,row_number() OVER (PARTITION BY e0.member,coalesce(e0.coverage,'') ORDER BY e0.submitted DESC,e0.id COLLATE "C" DESC) rn FROM e0) r WHERE rn=1
 ), d AS (
  SELECT e.*,s.effectuated,s.eff,s.first_loss,(s.eff+interval '3 months')::date period_end,
   (SELECT count(*) FROM jsonb_array_elements_text(coalesce(e.ctms,'[]')) c WHERE c.value::date<p_to) ctm_count
  FROM e CROSS JOIN LATERAL (
   SELECT coalesce(bool_or(v.type='effectuated'),false) effectuated,
    coalesce(e.effective,min(v.date) FILTER (WHERE v.type='effectuated')) eff,
    (SELECT min(l.date) FROM jsonb_to_recordset(coalesce(e.events,'[]')) l(type text,date date,seq bigint)
      WHERE l.type IN ('disenrolled','terminated_by_carrier') AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(coalesce(e.events,'[]')) r(type text,date date,seq bigint)
       WHERE r.type='reinstated' AND r.seq>l.seq AND r.date<=l.date)) first_loss
   FROM jsonb_to_recordset(coalesce(e.events,'[]')) v(type text,date date,seq bigint)) s
 ), m AS (
  SELECT d.*,
   d.effectuated AND d.eff IS NOT NULL AND d.period_end<=p_to AND d.as_of IS NOT NULL AND d.period_end<=d.as_of AS matured,
   d.first_loss IS NULL OR d.first_loss>=d.period_end AS kept,
   CASE WHEN d.effectuated AND d.eff IS NOT NULL THEN greatest(0,least(coalesce(d.first_loss,p_to),p_to)-d.eff) ELSE 0 END AS days
  FROM d
 ), keyed AS (
  SELECT m.*,
   CASE WHEN 'source'=ANY(p_group) THEN m.source END k_source,CASE WHEN 'sub_id'=ANY(p_group) THEN m.sub_id END k_sub,
   CASE WHEN 'agent'=ANY(p_group) THEN m.agent END k_agent,CASE WHEN 'carrier'=ANY(p_group) THEN m.carrier END k_carrier,
   CASE WHEN 'agency'=ANY(p_group) THEN m.tenant END k_agency,CASE WHEN 'product_line'=ANY(p_group) THEN m.coverage END k_product,
   CASE WHEN 'snp_type'=ANY(p_group) THEN m.snp_type END k_snp,CASE WHEN 'agent_cohort_month'=ANY(p_group) THEN m.cohort_month END k_cohort,
   CASE WHEN 'effective_month'=ANY(p_group) THEN to_char(m.eff,'YYYY-MM') END k_month
  FROM m
 ), eg AS (
  SELECT k_source,k_sub,k_agent,k_carrier,k_agency,k_product,k_snp,k_cohort,k_month,
   count(*) apps,count(*) FILTER (WHERE effectuated) eff_n,count(*) FILTER (WHERE matured) matured_n,
   count(*) FILTER (WHERE effectuated AND NOT matured) pending_n,count(*) FILTER (WHERE matured AND kept) retained_n,
   coalesce(sum(days),0) days_n,coalesce(sum(ctm_count),0) ctm_n,count(*) FILTER (WHERE effectuated AND snp_type='D-SNP') dsnp_n,
   count(*) FILTER (WHERE matured AND activation_completed) act_m,count(*) FILTER (WHERE matured AND kept AND activation_completed) act_r,
   count(*) FILTER (WHERE matured AND NOT coalesce(activation_completed,false)) noact_m,count(*) FILTER (WHERE matured AND kept AND NOT coalesce(activation_completed,false)) noact_r
  FROM keyed GROUP BY 1,2,3,4,5,6,7,8,9
 ), c0 AS (
  SELECT x.* FROM jsonb_to_recordset(coalesce(p_facts->'calls','[]')) AS x(tenant text,source text,sub_id text,agent text,cohort_month text,date date,cost numeric)
  WHERE x.date>=p_from AND x.date<p_to AND p_group<@ARRAY['source','sub_id','agency','agent','agent_cohort_month']
 ), cg AS (
  SELECT CASE WHEN 'source'=ANY(p_group) THEN source END k_source,CASE WHEN 'sub_id'=ANY(p_group) THEN sub_id END k_sub,
   CASE WHEN 'agent'=ANY(p_group) THEN agent END k_agent,NULL::text k_carrier,CASE WHEN 'agency'=ANY(p_group) THEN tenant END k_agency,
   NULL::text k_product,NULL::text k_snp,CASE WHEN 'agent_cohort_month'=ANY(p_group) THEN cohort_month END k_cohort,NULL::text k_month,
   count(*) calls_n,count(*) FILTER (WHERE (date+interval '6 months')::date<=p_to) calls_m,
   sum(cost) cost_all,sum(cost) FILTER (WHERE (date+interval '6 months')::date<=p_to) cost_m
  FROM c0 GROUP BY 1,2,3,4,5,6,7,8,9
 ), j AS (
  SELECT coalesce(eg.k_source,cg.k_source) k_source,coalesce(eg.k_sub,cg.k_sub) k_sub,coalesce(eg.k_agent,cg.k_agent) k_agent,
   coalesce(eg.k_carrier,cg.k_carrier) k_carrier,coalesce(eg.k_agency,cg.k_agency) k_agency,coalesce(eg.k_product,cg.k_product) k_product,
   coalesce(eg.k_snp,cg.k_snp) k_snp,coalesce(eg.k_cohort,cg.k_cohort) k_cohort,coalesce(eg.k_month,cg.k_month) k_month,
   coalesce(eg.apps,0) apps,coalesce(eg.eff_n,0) eff_n,coalesce(eg.matured_n,0) matured_n,coalesce(eg.pending_n,0) pending_n,
   coalesce(eg.retained_n,0) retained_n,coalesce(eg.days_n,0) days_n,coalesce(eg.ctm_n,0) ctm_n,coalesce(eg.dsnp_n,0) dsnp_n,
   coalesce(eg.act_m,0) act_m,coalesce(eg.act_r,0) act_r,coalesce(eg.noact_m,0) noact_m,coalesce(eg.noact_r,0) noact_r,
   CASE WHEN p_group<@ARRAY['source','sub_id','agency','agent','agent_cohort_month'] THEN coalesce(cg.calls_n,0) END calls_n,
   CASE WHEN p_group<@ARRAY['source','sub_id','agency','agent','agent_cohort_month'] THEN coalesce(cg.calls_m,0) END calls_m,
   cg.cost_all,cg.cost_m
  -- jsonb equality treats null keys as equal and is hash joinable.
  FROM eg FULL JOIN cg ON jsonb_build_array(eg.k_source,eg.k_sub,eg.k_agent,eg.k_carrier,eg.k_agency,eg.k_product,eg.k_snp,eg.k_cohort,eg.k_month)
   =jsonb_build_array(cg.k_source,cg.k_sub,cg.k_agent,cg.k_carrier,cg.k_agency,cg.k_product,cg.k_snp,cg.k_cohort,cg.k_month)
 )
 SELECT jsonb_build_object(
  'key',(SELECT coalesce(jsonb_object_agg(k,CASE k WHEN 'source' THEN to_jsonb(j.k_source) WHEN 'sub_id' THEN to_jsonb(j.k_sub) WHEN 'agent' THEN to_jsonb(j.k_agent)
     WHEN 'carrier' THEN to_jsonb(j.k_carrier) WHEN 'agency' THEN to_jsonb(j.k_agency) WHEN 'product_line' THEN to_jsonb(j.k_product)
     WHEN 'snp_type' THEN to_jsonb(j.k_snp) WHEN 'agent_cohort_month' THEN to_jsonb(j.k_cohort) ELSE to_jsonb(j.k_month) END),'{}') FROM unnest(p_group) k),
  'calls',j.calls_n,'calls_matured',j.calls_m,'applications',j.apps,'effectuated',j.eff_n,
  'effectuation_per_call',public.gold_wilson(j.eff_n,j.calls_n),
  'matured',j.matured_n,'pending',j.pending_n,'retained',j.retained_n,
  'r_rdp',public.gold_wilson(j.retained_n,j.matured_n),
  'below_threshold',CASE WHEN j.matured_n>0 THEN j.retained_n::numeric/j.matured_n<0.70 END,
  'retained_per_1000_calls',public.gold_wilson(j.retained_n,j.calls_m,1,1000),
  'member_months',round(j.days_n::numeric/30.4375,4),'ctms',j.ctm_n,
  'ctm_rate_per_1000_mm',public.gold_wilson(j.ctm_n,j.days_n,30.4375,1000),
  'cost',j.cost_all,'cost_per_retained',CASE WHEN j.cost_m IS NOT NULL AND j.retained_n>0 THEN round(j.cost_m/j.retained_n,2) END,
  'dsnp_share',public.gold_wilson(j.dsnp_n,j.eff_n),
  'activation',jsonb_build_object(
    'completed',jsonb_build_object('matured',j.act_m,'retained',j.act_r)||public.gold_wilson(j.act_r,j.act_m),
    'not_completed',jsonb_build_object('matured',j.noact_m,'retained',j.noact_r)||public.gold_wilson(j.noact_r,j.noact_m)))
 FROM j ORDER BY j.k_source COLLATE "C" NULLS LAST,j.k_sub COLLATE "C" NULLS LAST,j.k_agent COLLATE "C" NULLS LAST,
  j.k_carrier COLLATE "C" NULLS LAST,j.k_agency COLLATE "C" NULLS LAST,j.k_product COLLATE "C" NULLS LAST,j.k_snp COLLATE "C" NULLS LAST,
  j.k_cohort COLLATE "C" NULLS LAST,j.k_month COLLATE "C" NULLS LAST
$$;

-- 3. The whole result for one grouping: groups, totals, censoring, the
-- unattributed share, cross agency moves, mix and the agent cohort table.
CREATE FUNCTION public.gold_standard_compute(p_facts jsonb,p_from date,p_to date,p_group text[],p_network boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE g text[]:=coalesce(p_group,'{}'); dims text[]:=ARRAY['source','sub_id','agent','carrier','agency','product_line','snp_type','agent_cohort_month','effective_month'];
  totals jsonb; groups jsonb; apps bigint; unattributed bigint; moves bigint; mix jsonb; cohort jsonb; check_dims text[];
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(g) x WHERE x IS NULL OR NOT x=ANY(dims)) OR cardinality(g)<>(SELECT count(DISTINCT x) FROM unnest(g) x) THEN
  RAISE EXCEPTION 'Unknown Gold Standards group' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(r),'[]') INTO groups FROM public.gold_metric_rows(p_facts,p_from,p_to,g) r;
 SELECT r INTO totals FROM public.gold_metric_rows(p_facts,p_from,p_to,'{}') r;
 check_dims:=CASE WHEN cardinality(g)=0 THEN ARRAY['source'] ELSE g END;
 WITH e0 AS (
  SELECT x.* FROM jsonb_to_recordset(coalesce(p_facts->'enrollments','[]')) AS x(id text,tenant text,member text,coverage text,carrier text,agent text,
   cohort_month text,source text,sub_id text,snp_type text,submitted date,effective date,events jsonb)
  WHERE x.submitted>=p_from AND x.submitted<p_to
 ), e AS (
  SELECT * FROM (SELECT e0.*,row_number() OVER (PARTITION BY e0.member,coalesce(e0.coverage,'') ORDER BY e0.submitted DESC,e0.id COLLATE "C" DESC) rn FROM e0) r WHERE rn=1
 ), f AS (
  SELECT e.*,coalesce((SELECT bool_or(v.type='effectuated') FROM jsonb_to_recordset(coalesce(e.events,'[]')) v(type text)),false) effectuated,
   coalesce(e.effective,(SELECT min(v.date) FROM jsonb_to_recordset(coalesce(e.events,'[]')) v(type text,date date) WHERE v.type='effectuated')) eff
  FROM e
 )
 SELECT count(*),
  count(*) FILTER (WHERE EXISTS(SELECT 1 FROM unnest(check_dims) k WHERE CASE k WHEN 'source' THEN f.source WHEN 'sub_id' THEN f.sub_id WHEN 'agent' THEN f.agent
   WHEN 'carrier' THEN f.carrier WHEN 'agency' THEN f.tenant WHEN 'product_line' THEN f.coverage WHEN 'snp_type' THEN f.snp_type
   WHEN 'agent_cohort_month' THEN f.cohort_month ELSE to_char(f.eff,'YYYY-MM') END IS NULL)),
  (SELECT count(*) FROM (SELECT x.member FROM e0 x WHERE x.member NOT LIKE 'intake:%' GROUP BY x.member,coalesce(x.coverage,'') HAVING count(DISTINCT x.tenant)>1) mv),
  jsonb_build_object(
   'product_line',(SELECT coalesce(jsonb_object_agg(k,n),'{}') FROM (SELECT coalesce(f2.coverage,'unknown') k,count(*) n FROM f f2 WHERE f2.effectuated GROUP BY 1) a),
   'snp_type',(SELECT coalesce(jsonb_object_agg(k,n),'{}') FROM (SELECT coalesce(f2.snp_type,'unknown') k,count(*) n FROM f f2 WHERE f2.effectuated GROUP BY 1) a)),
  CASE WHEN p_network THEN
   (SELECT coalesce(jsonb_agg(jsonb_build_object('cohort_month',c.cohort_month,'agents',c.agents,'agents_effectuated',c.with_first,
     'mean_days_to_first_effectuated',CASE WHEN c.with_first>0 THEN round(c.days_sum::numeric/c.with_first,2) END) ORDER BY c.cohort_month COLLATE "C"),'[]')
    FROM (SELECT coalesce(to_char(a.rts_date,'YYYY-MM'),'unknown') cohort_month,count(*) agents,count(fe.first_eff) FILTER (WHERE a.rts_date IS NOT NULL) with_first,
      sum(fe.first_eff-a.rts_date) FILTER (WHERE a.rts_date IS NOT NULL) days_sum
     FROM jsonb_to_recordset(coalesce(p_facts->'agents','[]')) a(agent text,tenant text,rts_date date)
     LEFT JOIN LATERAL (SELECT min(f3.eff) first_eff FROM f f3 WHERE f3.agent=a.agent AND f3.effectuated) fe ON true GROUP BY 1) c)
  ELSE
   (SELECT coalesce(jsonb_agg(jsonb_build_object('agent',a.agent,'cohort_month',coalesce(to_char(a.rts_date,'YYYY-MM'),'unknown'),'rts_date',a.rts_date,
     'first_effectuated',fe.first_eff,'days_to_first_effectuated',fe.first_eff-a.rts_date) ORDER BY coalesce(to_char(a.rts_date,'YYYY-MM'),'unknown') COLLATE "C",a.agent COLLATE "C"),'[]')
    FROM jsonb_to_recordset(coalesce(p_facts->'agents','[]')) a(agent text,tenant text,rts_date date)
    LEFT JOIN LATERAL (SELECT min(f3.eff) first_eff FROM f f3 WHERE f3.agent=a.agent AND f3.effectuated) fe ON true)
  END
 INTO apps,unattributed,moves,mix,cohort FROM f;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'group_by',to_jsonb(g),'groups',groups,
  'totals',coalesce(totals,jsonb_build_object('applications',0)),
  'matured',coalesce((totals->>'matured')::bigint,0),'pending',coalesce((totals->>'pending')::bigint,0),
  'unattributed',unattributed,'unattributed_share',CASE WHEN apps>0 THEN round(unattributed::numeric/apps,6) END,
  'cross_agency_moves',moves,'mix',mix,'cohort',cohort,'threshold',0.70);
END $$;

-- 4. One agency (buyer and agency admin views). The tenant comes from the
-- verified identity in the handler, never from input.
CREATE FUNCTION public.gold_standard_scorecard(p_tenant uuid,p_from date,p_to date,p_group_by text[],p_plan_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('GOLD_STANDARDS_METRICS_ENABLED') THEN
  RAISE EXCEPTION 'Gold Standards metrics disabled' USING ERRCODE='42501'; END IF;
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'Tenant required' USING ERRCODE='22023'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>1100 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 result:=public.gold_standard_compute(public.gold_facts(ARRAY[p_tenant],p_from,p_to,coalesce(p_plan_year,extract(year FROM p_from)::integer)),p_from,p_to,p_group_by,false);
 -- Agent labels for the agency's own view only.
 RETURN result||jsonb_build_object('scope','agency','agent_names',coalesce((SELECT jsonb_object_agg(e.id,a.name) FROM public.enrolled_agents e
  JOIN public.tenant_agents a ON a.tenant_id=e.tenant_id AND a.clerk_user_id=e.clerk_user_id WHERE e.tenant_id=p_tenant),'{}'));
END $$;

-- The operator view across every tenant: aggregates only. A member is counted
-- once across the network by the matching key; the latest enrollment wins.
CREATE FUNCTION public.gold_standard_network_scorecard(p_from date,p_to date,p_group_by text[],p_plan_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('GOLD_STANDARDS_METRICS_ENABLED') THEN
  RAISE EXCEPTION 'Gold Standards metrics disabled' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>1100 THEN RAISE EXCEPTION 'Invalid window' USING ERRCODE='22023'; END IF;
 result:=public.gold_standard_compute(public.gold_facts((SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM public.tenants),p_from,p_to,
  coalesce(p_plan_year,extract(year FROM p_from)::integer)),p_from,p_to,p_group_by,true);
 RETURN result||jsonb_build_object('scope','network','agency_names',coalesce((SELECT jsonb_object_agg(t.id,t.name) FROM public.tenants t),'{}'));
END $$;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
  'gold_snp_label','gold_call_agent','gold_agent_rts_date','gold_origin_call','enrollment_attribution','gold_facts','gold_round','gold_wilson',
  'gold_metric_rows','gold_standard_compute','gold_standard_scorecard','gold_standard_network_scorecard') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.enrollment_attribution(uuid),public.gold_standard_scorecard(uuid,date,date,text[],integer),
  public.gold_standard_network_scorecard(date,date,text[],integer) TO service_role;
COMMIT;
