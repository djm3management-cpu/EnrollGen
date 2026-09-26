BEGIN;

-- Recreate with an exact Paragon source filter and configurable billing rate.
DROP FUNCTION IF EXISTS public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz);
CREATE FUNCTION public.paragon_weekly_reconciliation(
  p_tenant_id uuid, p_start timestamptz, p_end timestamptz, p_rate numeric DEFAULT 33
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH source AS (
   SELECT id FROM lead_sources WHERE tenant_id=p_tenant_id AND name='Paragon Media' AND type='publisher' AND active LIMIT 1
 ), calls AS (
   SELECT i.duration_seconds duration, r.call_duration_seconds, r.app_written, coalesce(r.metadata->>'state','unknown') state
   FROM inbound_calls i JOIN source s ON s.id=i.lead_source_id
   LEFT JOIN call_records r ON r.id=i.call_record_id
   WHERE i.tenant_id=p_tenant_id AND i.created_at>=p_start AND i.created_at<p_end
 ), totals AS (
   SELECT count(*) total_calls,
     count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90) billable_calls,
     count(*) FILTER (WHERE app_written) apps_written FROM calls
 ), states AS (
   SELECT jsonb_object_agg(state,cost) cost_by_state FROM (
     SELECT state, CASE WHEN count(*) FILTER (WHERE app_written)>0
       THEN round(count(*) FILTER (WHERE coalesce(duration,call_duration_seconds,0)>=90)*p_rate/count(*) FILTER (WHERE app_written),2)
       ELSE null END cost FROM calls GROUP BY state
   ) s
 )
 SELECT jsonb_build_object('total_calls',total_calls,'billable_calls',billable_calls,
   'expected_invoice',billable_calls*p_rate,'apps_written',apps_written,
   'cost_per_app_by_state',coalesce(cost_by_state,'{}'::jsonb)) FROM totals,states;
$$;

-- Shared-DID fallback: the telephony service sets caller_classification='new'
-- after a CRM/prior-call miss, and this trigger attaches the exact Paragon source.
CREATE OR REPLACE FUNCTION public.tag_inbound_lead_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source lead_sources; pub lead_sources; ping lead_source_pings; pubkey text; extid text;
BEGIN
  SELECT * INTO source FROM lead_sources WHERE tenant_id=NEW.tenant_id AND active AND twilio_number=NEW.to_number LIMIT 1;
  IF source.id IS NULL AND NEW.caller_classification='new' AND NEW.source_kind='publisher' THEN
    SELECT * INTO source FROM lead_sources WHERE tenant_id=NEW.tenant_id AND active AND type='publisher' AND name='Paragon Media' LIMIT 1;
  END IF;
  IF source.id IS NULL THEN RETURN NEW; END IF;
  NEW.lead_source_id:=source.id; NEW.source_kind:=source.type;
  IF source.type <> 'aggregator' THEN RETURN NEW; END IF;
  NEW.aggregator_source_id:=source.id;
  pubkey:=nullif(NEW.vendor_metadata->>'publisher',''); extid:=nullif(NEW.vendor_metadata->>'aggregator_call_id','');
  SELECT * INTO ping FROM lead_source_pings WHERE source_id=source.id AND caller_phone=NEW.from_number AND matched_call_sid IS NULL
    AND received_at>=clock_timestamp()-interval '5 minutes' AND received_at<=clock_timestamp() ORDER BY received_at DESC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF ping.id IS NOT NULL THEN pubkey:=coalesce(pubkey,ping.publisher); extid:=coalesce(extid,ping.aggregator_call_id); UPDATE lead_source_pings SET matched_call_sid=NEW.twilio_call_sid WHERE id=ping.id; END IF;
  NEW.aggregator_call_id:=CASE WHEN extid ~ '^[A-Za-z0-9_.:@+ -]{1,128}$' THEN extid ELSE NULL END;
  SELECT * INTO pub FROM lead_sources WHERE tenant_id=NEW.tenant_id AND active AND type='publisher' AND parent_source_id=source.id AND (external_id=pubkey OR name=pubkey) ORDER BY (external_id=pubkey) DESC NULLS LAST LIMIT 1;
  IF pub.id IS NOT NULL THEN NEW.lead_source_id:=pub.id; NEW.source_kind:='publisher'; NEW.publisher:=coalesce(pub.external_id,pub.name); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'integration_source_tag_failed'; NEW.lead_source_id:=NULL; NEW.aggregator_source_id:=NULL; NEW.publisher:=NULL; NEW.aggregator_call_id:=NULL; NEW.source_kind:='direct'; RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.availability_snapshot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_vendor_pause(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paragon_weekly_reconciliation(uuid,timestamptz,timestamptz,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.availability_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_vendor_pause(uuid,boolean,text) TO service_role;

COMMIT;
