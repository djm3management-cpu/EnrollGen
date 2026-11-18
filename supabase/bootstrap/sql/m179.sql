-- UNAPPLIED: isolated pilot only
-- Scorecards, usage summary and invoice preview (spec sections 5, 9 and 11; session S5).
-- Read only reporting, fenced by PING_SCORECARD_ENABLED. Service role only.
--
-- ping_scorecard(p_tenant,p_from,p_to,p_group) for one buyer tenant and
-- ping_operator_scorecard(p_from,p_to,p_group) across all tenants return one
-- jsonb row per group. p_group is any subset of source, sub_id, campaign,
-- state and day (the operator may also group by buyer_tenant); any other value
-- raises. An empty group returns one total row; no decisions return no rows.
-- Window: ping_decisions.received_at in [p_from,p_to). Every metric is
-- attributed to its originating decision, so a call, app or return is counted
-- in the group and day of the ping that produced it. The buyer scorecard reads
-- only rows whose tenant_id is p_tenant (ping_decisions.tenant_id is always the
-- campaign's own tenant, 175). No row carries a caller phone, ZIP, contact or
-- another tenant's id.
--
-- Group keys (all from ping_decisions d):
--   source d.source_id; sub_id d.publisher_sub_id; campaign d.campaign_id;
--   state d.caller_state; buyer_tenant d.tenant_id; day the local date of
--   d.received_at in the tenant's own IANA zone, vendor_controls.staffed_hours
--   ->>'timezone' of d.tenant_id (as exchange_cap_window in 176), else UTC.
-- Metrics:
--   pings              count of d with engine 'generic' or 'exchange_eval'
--                      (every evaluation, accepted, rejected or lost; shadow
--                      and the winner's second 'exchange' row are not pings).
--   accepts            pings with d.available.
--   accept_rate        accepts/pings, 4 places, null when pings is 0.
--   rejects_by_reason  {d.reason: count} over pings with NOT d.available.
--   exchange_wins      d.engine='exchange' AND d.available, not a
--                      commitment_replay in d.rule_trace.
--   arrivals           d.engine in ('generic','exchange') with d.matched_call_sid
--                      set by ping_claim_arrival (174, 176).
--   connects           arrivals whose inbound_calls row (twilio_call_sid =
--                      d.matched_call_sid, same tenant) has answered_agent_id
--                      (045, answered by an agent).
--   billable_calls     ping_call_billing b (b.decision_id=d.id) with
--                      b.finalized_at set and b.billable_seconds >=
--                      b.billable_threshold_seconds.
--   cost               sum of b.rate on billable calls: the rate snapshot taken
--                      at claim (174, 176), never ping_campaigns.rate. Gross of
--                      returns.
--   apps               arrivals whose call_records row (inbound_calls
--                      .call_record_id, same tenant) has app_written.
--   enrollments        arrivals whose call_records.call_outcome='enrolled' and
--                      is_test_enrollment is not true.
--   cost_per_app       cost/apps, 2 places, null when apps is 0.
--   cost_per_enrollment cost/enrollments, 2 places, null when enrollments is 0.
--   returns_open       ping_returns rows for b.parent_call_sid with status
--                      'open' or 'submitted' (not yet resolved).
--   returns_credited   ping_returns rows for b.parent_call_sid with status 'credited'.
--   retention_hits     pings whose d.rule_trace records existing_client_retention
--                      with result 'hit' (178), in either retention mode.
--
-- platform_invoice_lines(p_tenant,p_month) and platform_usage_summary(p_tenant,
-- p_month) read only platform_usage_events snapshots (quantity, unit_price) in
-- the UTC calendar month containing p_month, the same month
-- platform_record_usage (175) counts the allowance in. One invoice line per
-- kind with events. An event at unit_price 0 is inside the allowance (or free);
-- above 0 it is charged. Amounts are rounded to cents per line, never per
-- event, and the total is the sum of the rounded lines.
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

-- The tenant's own IANA zone from its staffed hours, else UTC.
CREATE FUNCTION public.ping_tenant_zone(p_tenant uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE zone text;
BEGIN
 SELECT v.staffed_hours->>'timezone' INTO zone FROM vendor_controls v WHERE v.tenant_id=p_tenant;
 IF zone IS NULL OR zone !~ '^[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2}$' THEN RETURN 'UTC'; END IF;
 -- An unknown zone raises here and the handler falls back to UTC.
 PERFORM clock_timestamp() AT TIME ZONE zone;
 RETURN zone;
EXCEPTION WHEN OTHERS THEN RETURN 'UTC';
END $$;

-- Shared body of both scorecards. p_tenant null with p_operator reads every tenant.
CREATE FUNCTION public.ping_scorecard_rows(p_tenant uuid,p_from timestamptz,p_to timestamptz,p_group text[],p_operator boolean)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g text[]:=coalesce(p_group,'{}'::text[]);
  allowed text[]:=ARRAY['source','sub_id','campaign','state','day'];
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCORECARD_ENABLED') THEN RAISE EXCEPTION 'Ping scorecard disabled'; END IF;
 IF p_operator THEN allowed:=allowed||ARRAY['buyer_tenant'];
 ELSIF p_tenant IS NULL THEN RAISE EXCEPTION 'Scorecard tenant required'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Invalid scorecard window'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(g) x WHERE x IS NULL OR NOT x=ANY(allowed)) THEN
  RAISE EXCEPTION 'Unknown scorecard group'; END IF;
 RETURN QUERY
 WITH base AS (
   SELECT d.id,d.tenant_id,d.source_id,d.campaign_id,d.received_at,d.caller_state,d.publisher_sub_id,
     d.available,d.reason,d.rule_trace,d.engine,d.matched_call_sid
   FROM ping_decisions d
   WHERE (p_operator AND p_tenant IS NULL OR d.tenant_id=p_tenant)
     AND d.received_at>=p_from AND d.received_at<p_to
     AND d.engine IN ('generic','exchange_eval','exchange')
 ), zones AS (
   SELECT t.tenant_id,public.ping_tenant_zone(t.tenant_id) AS zone FROM (SELECT DISTINCT tenant_id FROM base) t
 ), facts AS (
   SELECT
     CASE WHEN 'buyer_tenant'=ANY(g) THEN b.tenant_id END AS k_tenant,
     CASE WHEN 'source'=ANY(g) THEN b.source_id END AS k_source,
     CASE WHEN 'sub_id'=ANY(g) THEN b.publisher_sub_id END AS k_sub,
     CASE WHEN 'campaign'=ANY(g) THEN b.campaign_id END AS k_campaign,
     CASE WHEN 'state'=ANY(g) THEN b.caller_state END AS k_state,
     CASE WHEN 'day'=ANY(g) THEN (b.received_at AT TIME ZONE z.zone)::date END AS k_day,
     b.engine IN ('generic','exchange_eval') AS is_ping,
     b.available,b.reason,
     b.engine='exchange' AND b.available AND NOT b.rule_trace @> '[{"rule":"commitment_replay"}]'::jsonb AS is_win,
     b.engine IN ('generic','exchange_eval')
       AND b.rule_trace @> '[{"rule":"existing_client_retention","result":"hit"}]'::jsonb AS is_retention,
     b.engine IN ('generic','exchange') AND b.matched_call_sid IS NOT NULL AS is_arrival,
     i.answered_agent_id IS NOT NULL AS is_connect,
     coalesce(bill.finalized_at IS NOT NULL AND bill.billable_seconds>=bill.billable_threshold_seconds,false) AS is_billable,
     coalesce(r.app_written,false) AS is_app,
     coalesce(r.call_outcome='enrolled' AND r.is_test_enrollment IS NOT TRUE,false) AS is_enrolled,
     bill.rate,rt.open_returns,rt.credited_returns
   FROM base b JOIN zones z ON z.tenant_id=b.tenant_id
   LEFT JOIN ping_call_billing bill ON b.engine IN ('generic','exchange') AND b.matched_call_sid IS NOT NULL
     AND bill.decision_id=b.id AND bill.tenant_id=b.tenant_id
   LEFT JOIN LATERAL (SELECT x.answered_agent_id,x.call_record_id FROM inbound_calls x
     WHERE b.engine IN ('generic','exchange') AND b.matched_call_sid IS NOT NULL
       AND x.twilio_call_sid=b.matched_call_sid AND x.tenant_id=b.tenant_id
     ORDER BY x.created_at,x.id LIMIT 1) i ON true
   LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=b.tenant_id
   LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE x.status IN ('open','submitted')) AS open_returns,
       count(*) FILTER (WHERE x.status='credited') AS credited_returns
     FROM ping_returns x WHERE x.billing_parent_call_sid=bill.parent_call_sid AND x.tenant_id=b.tenant_id) rt ON true
 ), agg AS (
   SELECT k_tenant,k_source,k_sub,k_campaign,k_state,k_day,
     count(*) FILTER (WHERE is_ping) AS pings,
     count(*) FILTER (WHERE is_ping AND available) AS accepts,
     count(*) FILTER (WHERE is_win) AS wins,
     count(*) FILTER (WHERE is_arrival) AS arrivals,
     count(*) FILTER (WHERE is_arrival AND is_connect) AS connects,
     count(*) FILTER (WHERE is_arrival AND is_billable) AS billable,
     coalesce(sum(rate) FILTER (WHERE is_arrival AND is_billable),0)::numeric AS cost,
     count(*) FILTER (WHERE is_arrival AND is_app) AS apps,
     count(*) FILTER (WHERE is_arrival AND is_enrolled) AS enrollments,
     coalesce(sum(open_returns) FILTER (WHERE is_arrival),0)::bigint AS returns_open,
     coalesce(sum(credited_returns) FILTER (WHERE is_arrival),0)::bigint AS returns_credited,
     count(*) FILTER (WHERE is_retention) AS retention_hits
   FROM facts GROUP BY k_tenant,k_source,k_sub,k_campaign,k_state,k_day
 ), rej AS (
   SELECT k_tenant,k_source,k_sub,k_campaign,k_state,k_day,jsonb_object_agg(reason,n) AS obj
   FROM (SELECT k_tenant,k_source,k_sub,k_campaign,k_state,k_day,reason,count(*) AS n FROM facts
     WHERE is_ping AND NOT available GROUP BY k_tenant,k_source,k_sub,k_campaign,k_state,k_day,reason) x
   GROUP BY k_tenant,k_source,k_sub,k_campaign,k_state,k_day
 )
 SELECT
   CASE WHEN 'buyer_tenant'=ANY(g) THEN jsonb_build_object('buyer_tenant',a.k_tenant) ELSE '{}'::jsonb END
   ||CASE WHEN 'source'=ANY(g) THEN jsonb_build_object('source',a.k_source) ELSE '{}'::jsonb END
   ||CASE WHEN 'sub_id'=ANY(g) THEN jsonb_build_object('sub_id',a.k_sub) ELSE '{}'::jsonb END
   ||CASE WHEN 'campaign'=ANY(g) THEN jsonb_build_object('campaign',a.k_campaign) ELSE '{}'::jsonb END
   ||CASE WHEN 'state'=ANY(g) THEN jsonb_build_object('state',a.k_state) ELSE '{}'::jsonb END
   ||CASE WHEN 'day'=ANY(g) THEN jsonb_build_object('day',a.k_day) ELSE '{}'::jsonb END
   ||jsonb_build_object('pings',a.pings,'accepts',a.accepts,
     'accept_rate',CASE WHEN a.pings>0 THEN round(a.accepts::numeric/a.pings,4) END,
     'rejects_by_reason',coalesce(rj.obj,'{}'::jsonb),'exchange_wins',a.wins,
     'arrivals',a.arrivals,'connects',a.connects,'billable_calls',a.billable,'cost',a.cost,
     'apps',a.apps,'enrollments',a.enrollments,
     'cost_per_app',CASE WHEN a.apps>0 THEN round(a.cost/a.apps,2) END,
     'cost_per_enrollment',CASE WHEN a.enrollments>0 THEN round(a.cost/a.enrollments,2) END,
     'returns_open',a.returns_open,'returns_credited',a.returns_credited,'retention_hits',a.retention_hits)
 FROM agg a LEFT JOIN rej rj ON rj.k_tenant IS NOT DISTINCT FROM a.k_tenant AND rj.k_source IS NOT DISTINCT FROM a.k_source
   AND rj.k_sub IS NOT DISTINCT FROM a.k_sub AND rj.k_campaign IS NOT DISTINCT FROM a.k_campaign
   AND rj.k_state IS NOT DISTINCT FROM a.k_state AND rj.k_day IS NOT DISTINCT FROM a.k_day
 ORDER BY a.k_tenant::text,a.k_source::text,a.k_sub,a.k_campaign::text,a.k_state,a.k_day;
END $$;

-- Buyer scorecard: the tenant's own rows only.
CREATE FUNCTION public.ping_scorecard(p_tenant uuid,p_from timestamptz,p_to timestamptz,p_group text[])
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_tenant IS NULL THEN RAISE EXCEPTION 'Scorecard tenant required'; END IF;
 RETURN QUERY SELECT * FROM public.ping_scorecard_rows(p_tenant,p_from,p_to,p_group,false);
END $$;

-- Operator scorecard: every tenant, with buyer_tenant as an extra group.
CREATE FUNCTION public.ping_operator_scorecard(p_from timestamptz,p_to timestamptz,p_group text[])
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY SELECT * FROM public.ping_scorecard_rows(NULL,p_from,p_to,p_group,true);
END $$;

-- One line per usage kind with events in the UTC month containing p_month.
CREATE FUNCTION public.platform_invoice_lines(p_tenant uuid,p_month date)
RETURNS TABLE(line_no integer,kind text,description text,quantity numeric,included_quantity numeric,
  charged_quantity numeric,amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE month_start date;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCORECARD_ENABLED') THEN RAISE EXCEPTION 'Ping scorecard disabled'; END IF;
 IF p_tenant IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'Invalid usage period'; END IF;
 month_start:=date_trunc('month',p_month)::date;
 RETURN QUERY
 SELECT k.n,k.kind,k.description,sum(e.quantity),
   coalesce(sum(e.quantity) FILTER (WHERE e.unit_price=0),0),
   coalesce(sum(e.quantity) FILTER (WHERE e.unit_price>0),0),
   round(sum(e.quantity*e.unit_price),2)
 FROM (VALUES (1,'ping','Pings evaluated'),(2,'routed_call','Routed calls'),
   (3,'screener_minute','Screener minutes'),(4,'screened_qualified','Screened qualified results')) k(n,kind,description)
 JOIN platform_usage_events e ON e.kind=k.kind AND e.tenant_id=p_tenant
   AND e.occurred_at>=month_start::timestamp AT TIME ZONE 'UTC'
   AND e.occurred_at<(month_start+interval '1 month')::timestamp AT TIME ZONE 'UTC'
 GROUP BY k.n,k.kind,k.description
 ORDER BY k.n;
END $$;

-- Usage summary and invoice preview built from the invoice lines.
CREATE FUNCTION public.platform_usage_summary(p_tenant uuid,p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE month_start date; result jsonb;
BEGIN
 IF NOT public.deployment_feature_enabled('PING_SCORECARD_ENABLED') THEN RAISE EXCEPTION 'Ping scorecard disabled'; END IF;
 IF p_tenant IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'Invalid usage period'; END IF;
 month_start:=date_trunc('month',p_month)::date;
 SELECT jsonb_build_object('tenant_id',p_tenant,'month',month_start,
   'period_start',month_start::timestamp AT TIME ZONE 'UTC',
   'period_end',(month_start+interval '1 month')::timestamp AT TIME ZONE 'UTC',
   'by_kind',coalesce(jsonb_object_agg(l.kind,jsonb_build_object('quantity',l.quantity,'amount',l.amount))
     FILTER (WHERE l.kind IS NOT NULL),'{}'::jsonb),
   'pings',coalesce(sum(l.quantity) FILTER (WHERE l.kind='ping'),0),
   'pings_inside_allowance',coalesce(sum(l.included_quantity) FILTER (WHERE l.kind='ping'),0),
   'overage_pings',coalesce(sum(l.charged_quantity) FILTER (WHERE l.kind='ping'),0),
   'overage_amount',coalesce(sum(l.amount) FILTER (WHERE l.kind='ping'),0),
   'routed_calls',coalesce(sum(l.quantity) FILTER (WHERE l.kind='routed_call'),0),
   'routed_calls_amount',coalesce(sum(l.amount) FILTER (WHERE l.kind='routed_call'),0),
   'screener_minutes',coalesce(sum(l.quantity) FILTER (WHERE l.kind='screener_minute'),0),
   'screener_minutes_amount',coalesce(sum(l.amount) FILTER (WHERE l.kind='screener_minute'),0),
   'screened_qualified',coalesce(sum(l.quantity) FILTER (WHERE l.kind='screened_qualified'),0),
   'screened_qualified_amount',coalesce(sum(l.amount) FILTER (WHERE l.kind='screened_qualified'),0),
   'screener_amount',coalesce(sum(l.amount) FILTER (WHERE l.kind IN ('screener_minute','screened_qualified')),0),
   'total',coalesce(sum(l.amount),0))
 INTO result FROM public.platform_invoice_lines(p_tenant,month_start) l;
 RETURN result;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('ping_tenant_zone','ping_scorecard_rows','ping_scorecard','ping_operator_scorecard',
   'platform_invoice_lines','platform_usage_summary') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ping_scorecard(uuid,timestamptz,timestamptz,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.ping_operator_scorecard(timestamptz,timestamptz,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_invoice_lines(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_usage_summary(uuid,date) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
