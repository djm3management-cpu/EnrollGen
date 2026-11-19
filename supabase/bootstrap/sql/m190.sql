-- UNAPPLIED: isolated pilot only
-- Publisher quality attestations (spec v5 section 6; docs/feature-gold-standards.md item 6).
-- 1. lead_sources gains onshore_operation, no_resale, consent_language_reviewed,
--    attestation_document_ref, attested_by, attested_at and
--    attestation_expires_at. Changes go through the operator portal, which
--    writes admin_action_log first; the existing lead_sources operator trigger
--    (161) also records every change.
-- 2. ping_campaigns.require_source_attestations, default false.
-- 3. New closed reason code source_attestation_missing, evaluated immediately
--    after source_paused, for call pings (ping_decide_campaign) and lead pings
--    (lead_campaign_eval), only when SOURCE_ATTESTATIONS_ENABLED is on and the
--    campaign requires attestations. The publisher's attestations are current
--    when all three are true, a document reference and attestation time are
--    recorded and the expiry is later than the decision time.
-- With the flag off or the setting false nothing is read and nothing is
-- traced, so every decision is identical to 187. The routines are rewritten
-- in place from their installed definitions; a missing anchor aborts.
-- Forward only. Never alters paragon_* objects and never touches production data.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.lead_sources
  ADD COLUMN onshore_operation boolean,
  ADD COLUMN no_resale boolean,
  ADD COLUMN consent_language_reviewed boolean,
  ADD COLUMN attestation_document_ref text CHECK (attestation_document_ref IS NULL OR length(btrim(attestation_document_ref)) BETWEEN 1 AND 200),
  ADD COLUMN attested_by text CHECK (attested_by IS NULL OR length(attested_by) BETWEEN 1 AND 200),
  ADD COLUMN attested_at timestamptz,
  ADD COLUMN attestation_expires_at timestamptz,
  ADD CONSTRAINT lead_sources_attestation_window CHECK (attestation_expires_at IS NULL OR attested_at IS NULL OR attestation_expires_at>attested_at);

ALTER TABLE public.ping_campaigns ADD COLUMN require_source_attestations boolean NOT NULL DEFAULT false;

ALTER TABLE public.ping_decisions DROP CONSTRAINT ping_decisions_reason_check;
ALTER TABLE public.ping_decisions ADD CONSTRAINT ping_decisions_reason_check CHECK (reason IN (
  'routing_disabled','invalid_payload','source_paused','source_attestation_missing','campaign_inactive',
  'outside_staffed_hours','state_not_allowed','county_not_served','missing_call_identity',
  'existing_client_retention','cooldown_same_source','cooldown_any_source',
  'repeat_shopper','daily_budget_reached','no_eligible_agent','all_eligible_busy',
  'accepted_full','accepted_partial','accepted_retention_owner','error_rejected',
  'exchange_no_buyer','buyer_cap_reached',
  'lead_window_expired','duplicate_lead','consent_missing','low_intent'));

ALTER TABLE public.lead_pings DROP CONSTRAINT lead_pings_reason_check;
ALTER TABLE public.lead_pings ADD CONSTRAINT lead_pings_reason_check CHECK (reason IN ('invalid_payload','source_paused',
  'source_attestation_missing','outside_staffed_hours','campaign_inactive','state_not_allowed','county_not_served',
  'consent_missing','low_intent','daily_budget_reached','buyer_cap_reached','exchange_no_buyer','accepted_full','error_rejected'));

-- True when the publisher's attestations are complete and unexpired at p_at.
CREATE FUNCTION public.ping_source_attested(p_source uuid,p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT s.onshore_operation AND s.no_resale AND s.consent_language_reviewed
      AND nullif(btrim(s.attestation_document_ref),'') IS NOT NULL AND s.attested_at IS NOT NULL
      AND s.attestation_expires_at IS NOT NULL AND s.attestation_expires_at>p_at
    FROM lead_sources s WHERE s.id=p_source),false);
$$;
REVOKE ALL ON FUNCTION public.ping_source_attested(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ping_source_attested(uuid,timestamptz) TO service_role;

DO $$ DECLARE d text; anchor text; gate text; n integer; BEGIN
 -- Call pings.
 SELECT pg_get_functiondef('public.ping_decide_campaign(uuid,uuid,jsonb,text)'::regprocedure) INTO d;
 anchor:='        ELSE trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_paused'',''result'',''pass'')); END IF;';
 n:=(length(d)-length(replace(d,anchor,'')))/length(anchor);
 IF n<>1 THEN RAISE EXCEPTION 'ping_decide_campaign source_paused anchor found % times',n; END IF;
 gate:='        ELSE trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_paused'',''result'',''pass''));
          -- 190: publisher attestations, only when the flag is on and the campaign requires them.
          IF camp.id IS NOT NULL AND camp.require_source_attestations AND public.deployment_feature_enabled(''SOURCE_ATTESTATIONS_ENABLED'') THEN
            IF public.ping_source_attested(src.id,clock_timestamp()) THEN
              trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_attestation_missing'',''result'',''pass''));
            ELSE decision:=''source_attestation_missing''; END IF;
          END IF;
        END IF;';
 EXECUTE replace(d,anchor,gate);

 -- Lead pings: the evaluation learns the publisher through its fields.
 SELECT pg_get_functiondef('public.lead_campaign_eval(uuid,jsonb,timestamptz,jsonb)'::regprocedure) INTO d;
 anchor:=' ELSE trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_paused'',''result'',''pass'')); END IF;';
 n:=(length(d)-length(replace(d,anchor,'')))/length(anchor);
 IF n<>1 THEN RAISE EXCEPTION 'lead_campaign_eval source_paused anchor found % times',n; END IF;
 gate:=' ELSE trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_paused'',''result'',''pass''));
  -- 190: publisher attestations, only when the flag is on and the campaign requires them.
  IF camp.id IS NOT NULL AND camp.require_source_attestations AND public.deployment_feature_enabled(''SOURCE_ATTESTATIONS_ENABLED'') THEN
   IF public.ping_source_attested(nullif(p_fields->>''publisher_source_id'','''')::uuid,p_at) THEN
    trace:=trace||jsonb_build_array(jsonb_build_object(''rule'',''source_attestation_missing'',''result'',''pass''));
   ELSE decision:=''source_attestation_missing''; END IF;
  END IF;
 END IF;';
 EXECUTE replace(d,anchor,gate);

 SELECT pg_get_functiondef('public.lead_ping_decide(text,text,jsonb,jsonb)'::regprocedure) INTO d;
 n:=(length(d)-length(regexp_replace(d,'lead_campaign_eval\(camp\.id,f,','','g')))/length('lead_campaign_eval(camp.id,f,');
 IF n<>1 THEN RAISE EXCEPTION 'lead_ping_decide anchor found % times',n; END IF;
 EXECUTE replace(d,'lead_campaign_eval(camp.id,f,','lead_campaign_eval(camp.id,f||jsonb_build_object(''publisher_source_id'',src.id),');

 SELECT pg_get_functiondef('public.exchange_lead_ping(text,jsonb,jsonb)'::regprocedure) INTO d;
 IF strpos(d,'lead_campaign_eval(r.campaign_id,f,')=0 OR strpos(d,'lead_campaign_eval(pick,f,')=0 THEN RAISE EXCEPTION 'exchange_lead_ping anchors missing'; END IF;
 d:=replace(d,'lead_campaign_eval(r.campaign_id,f,','lead_campaign_eval(r.campaign_id,f||jsonb_build_object(''publisher_source_id'',src.id),');
 d:=replace(d,'lead_campaign_eval(pick,f,','lead_campaign_eval(pick,f||jsonb_build_object(''publisher_source_id'',src.id),');
 EXECUTE d;
END $$;
COMMIT;
