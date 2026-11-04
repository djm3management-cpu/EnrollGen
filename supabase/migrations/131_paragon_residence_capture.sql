-- Additive schema only: new tables, indexes, functions and one view. No existing
-- columns/functions/triggers are altered, and no existing rows are backfilled.
BEGIN;
CREATE TABLE public.paragon_residence_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO public.paragon_residence_settings DEFAULT VALUES;
CREATE TABLE public.paragon_contact_zip_origin(
 contact_id uuid PRIMARY KEY REFERENCES public.contacts(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 zip text NOT NULL CHECK(zip ~ '^[0-9]{5}$'),contact_version timestamptz NOT NULL,
 metadata jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.paragon_residence_jobs(
 inbound_call_id uuid PRIMARY KEY REFERENCES public.inbound_calls(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 capture jsonb NOT NULL DEFAULT '{}',metadata jsonb NOT NULL DEFAULT '{}',
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),lease_token uuid,lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,last_error text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX paragon_residence_due ON public.paragon_residence_jobs(available_at,lease_until);
CREATE TABLE public.paragon_residence_sep_inputs(
 inbound_call_id uuid PRIMARY KEY REFERENCES public.inbound_calls(id),tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 zip text NOT NULL CHECK(zip ~ '^[0-9]{5}$'),state text NOT NULL CHECK(state ~ '^[A-Z]{2}$'),
 county_fips text,observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),metadata jsonb NOT NULL
);
ALTER TABLE public.paragon_residence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_contact_zip_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_residence_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paragon_residence_sep_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paragon_residence_settings,public.paragon_contact_zip_origin,public.paragon_residence_jobs,public.paragon_residence_sep_inputs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.paragon_residence_settings,public.paragon_contact_zip_origin,public.paragon_residence_jobs,public.paragon_residence_sep_inputs TO service_role;

-- Used only by the explicit CRM ZIP field edit, never contact prefill/autosave.
-- The endpoint authenticates tenant/assignment before invoking this service RPC.
CREATE FUNCTION public.save_paragon_contact_zip(p_contact uuid,p_tenant uuid,p_zip text,p_user text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c contacts;
BEGIN
 IF p_zip IS NOT NULL AND p_zip !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'Invalid ZIP'; END IF;
 UPDATE contacts SET zip=p_zip WHERE id=p_contact AND tenant_id=p_tenant RETURNING * INTO c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contact unavailable'; END IF;
 IF p_zip IS NULL THEN DELETE FROM paragon_contact_zip_origin WHERE contact_id=c.id;
 ELSE
 INSERT INTO paragon_contact_zip_origin(contact_id,tenant_id,zip,contact_version,metadata)
 VALUES(c.id,c.tenant_id,c.zip,c.updated_at,jsonb_build_object('source','agent_entered','clerk_user_id',p_user))
 ON CONFLICT(contact_id) DO UPDATE SET zip=excluded.zip,contact_version=excluded.contact_version,metadata=excluded.metadata,recorded_at=clock_timestamp();
 END IF;
 RETURN jsonb_build_object('saved',true);
END; $$;

CREATE FUNCTION public.enqueue_paragon_sep_residence(p_call uuid,p_tenant uuid,p_agent text,p_sid text,p_zip text,p_state text,p_county text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c inbound_calls;
BEGIN
 SELECT i.* INTO c FROM inbound_calls i JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE i.id=p_call AND i.tenant_id=p_tenant AND i.routed_agent_id=p_agent AND i.twilio_call_sid=p_sid
 AND s.name='Paragon Media' AND s.type='publisher' AND i.source_kind='publisher'
 AND EXISTS(SELECT 1 FROM telephony_call_attempts a WHERE a.inbound_call_id=i.id AND a.answered_at IS NOT NULL AND a.ended_at IS NULL);
 IF NOT FOUND THEN RAISE EXCEPTION 'Active owned Paragon call required'; END IF;
 IF p_zip !~ '^[0-9]{5}$' OR p_state !~ '^[A-Z]{2}$' OR NOT EXISTS(
 SELECT 1 FROM zip_county_crosswalk WHERE zip=p_zip AND state_code=p_state AND (p_county IS NULL OR county_fips=p_county OR lower(county_name)=lower(p_county))) THEN RAISE EXCEPTION 'Invalid lookup area'; END IF;
 INSERT INTO paragon_residence_sep_inputs(inbound_call_id,tenant_id,zip,state,county_fips,metadata)
 VALUES(c.id,c.tenant_id,p_zip,p_state,(SELECT min(county_fips) FROM zip_county_crosswalk WHERE zip=p_zip AND state_code=p_state AND (county_fips=p_county OR lower(county_name)=lower(p_county))),jsonb_build_object('source','sep_lookup','agent_id',p_agent,'entry','agent_typed'))
 ON CONFLICT(inbound_call_id) DO UPDATE SET zip=excluded.zip,state=excluded.state,county_fips=excluded.county_fips,metadata=excluded.metadata,observed_at=clock_timestamp();
 INSERT INTO paragon_residence_jobs(inbound_call_id,tenant_id) VALUES(c.id,c.tenant_id)
 ON CONFLICT(inbound_call_id) DO UPDATE SET available_at=clock_timestamp();
 RETURN jsonb_build_object('queued',true);
END; $$;

CREATE FUNCTION public.claim_paragon_residence_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j paragon_residence_jobs;c inbound_calls;segs jsonb;cp jsonb;sp jsonb; token uuid;
BEGIN
 -- Discovery is separate from call ingress: no new trigger can delay routing.
 INSERT INTO paragon_residence_jobs(inbound_call_id,tenant_id)
 SELECT i.id,i.tenant_id FROM inbound_calls i JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 WHERE s.name='Paragon Media' AND s.type='publisher' AND i.source_kind='publisher'
 AND i.created_at>=(SELECT enabled_at FROM paragon_residence_settings WHERE singleton)
 ON CONFLICT DO NOTHING;
 FOR j IN SELECT * FROM paragon_residence_jobs WHERE available_at<=clock_timestamp()
 AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY available_at LIMIT least(greatest(p_limit,1),20) FOR UPDATE SKIP LOCKED
 LOOP
  token:=gen_random_uuid();
  UPDATE paragon_residence_jobs SET lease_token=token,lease_until=clock_timestamp()+interval '45 seconds' WHERE inbound_call_id=j.inbound_call_id;
  SELECT * INTO c FROM inbound_calls WHERE id=j.inbound_call_id AND tenant_id=j.tenant_id;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.captured_at,t.id),'[]') INTO segs FROM (
   SELECT x.id,x.speaker,x.text,x.captured_at FROM telephony_transcript_segments x
   JOIN telephony_call_attempts a ON a.id=x.attempt_id
   WHERE a.inbound_call_id=c.id AND a.tenant_id=c.tenant_id
   ORDER BY x.captured_at DESC,x.id DESC LIMIT 200
  ) t;
  -- Positive per-value provenance is mandatory. An fmo/manual label is insufficient:
  -- vendor lead intake can fill missing ZIPs on previously manual contacts.
  SELECT jsonb_build_object('zip',ct.zip,'state',NULL,'observed_at',o.recorded_at) INTO cp
   FROM contacts ct JOIN paragon_contact_zip_origin o ON o.contact_id=ct.id AND o.tenant_id=ct.tenant_id
   WHERE ct.id=c.contact_id AND ct.tenant_id=c.tenant_id AND o.zip=ct.zip AND o.contact_version=ct.updated_at AND o.metadata->>'source'='agent_entered';
  SELECT jsonb_build_object('zip',zip,'state',state,'county_fips',county_fips,'observed_at',observed_at) INTO sp
   FROM paragon_residence_sep_inputs WHERE inbound_call_id=c.id AND tenant_id=c.tenant_id;
  RETURN NEXT jsonb_build_object('inbound_call_id',c.id,'lease_token',token,'capture',j.capture,'metadata',j.metadata,'segments',segs,'contact',cp,'sep',sp);
 END LOOP;
END; $$;

CREATE FUNCTION public.finish_paragon_residence_job(p_call uuid,p_token uuid,p_candidate jsonb,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j paragon_residence_jobs;c inbound_calls; chosen jsonb; ranks jsonb:='{"transcript":3,"sep_lookup":2,"contact_record":1}';result jsonb; ended timestamptz;
BEGIN
 SELECT * INTO STRICT j FROM paragon_residence_jobs WHERE inbound_call_id=p_call AND lease_token=p_token AND lease_until>clock_timestamp() FOR UPDATE;
 SELECT * INTO STRICT c FROM inbound_calls WHERE id=p_call AND tenant_id=j.tenant_id FOR UPDATE;
 chosen:=j.capture;
 IF p_candidate->>'source' IN ('transcript','sep_lookup','contact_record')
 AND coalesce((ranks->>(p_candidate->>'source'))::int,0)>=coalesce((ranks->>(j.capture->>'source'))::int,0)
 AND ((ranks->>(p_candidate->>'source'))::int>coalesce((ranks->>(j.capture->>'source'))::int,0)
 OR coalesce((p_candidate->>'observed_at')::timestamptz,'epoch')>=coalesce((j.capture->>'observed_at')::timestamptz,'epoch')) THEN
  IF (p_candidate->>'zip',p_candidate->>'state') IS DISTINCT FROM (j.capture->>'zip',j.capture->>'state') THEN
   result:=confirm_paragon_call_state(c.id,c.tenant_id,c.routed_agent_id,p_candidate->>'zip',p_candidate->>'state');
  END IF;
  IF p_candidate IS DISTINCT FROM (j.capture-'captured_at') THEN chosen:=p_candidate||jsonb_build_object('captured_at',clock_timestamp()); END IF;
 END IF;
 IF chosen<>'{}'::jsonb THEN
  UPDATE inbound_calls SET vendor_metadata=jsonb_set(coalesce(vendor_metadata,'{}'),'{paragon_residence}',chosen||jsonb_build_object('ambiguous',coalesce((p_metadata->>'ambiguous')::boolean,false) OR coalesce((j.metadata->>'ambiguous')::boolean,false)),true)
   WHERE id=c.id AND tenant_id=c.tenant_id AND vendor_metadata->'paragon_residence' IS DISTINCT FROM chosen||jsonb_build_object('ambiguous',coalesce((p_metadata->>'ambiguous')::boolean,false) OR coalesce((j.metadata->>'ambiguous')::boolean,false));
 END IF;
 SELECT max(ended_at) INTO ended FROM telephony_call_attempts WHERE inbound_call_id=c.id AND tenant_id=c.tenant_id;
 UPDATE paragon_residence_jobs SET capture=chosen,metadata=metadata||p_metadata||jsonb_build_object('ambiguous',coalesce((p_metadata->>'ambiguous')::boolean,false) OR coalesce((metadata->>'ambiguous')::boolean,false)),
 lease_token=NULL,lease_until=NULL,last_error=NULL,attempts=0,updated_at=clock_timestamp(),
 available_at=CASE WHEN c.status IN ('completed','declined','canceled','failed','no-answer','busy','voicemail','rejected') AND coalesce(ended,c.created_at)<clock_timestamp()-interval '5 minutes'
 THEN 'infinity'::timestamptz ELSE clock_timestamp()+interval '3 seconds' END
 WHERE inbound_call_id=c.id;
 RETURN coalesce(result,jsonb_build_object('captured',chosen<>'{}'::jsonb));
END; $$;

CREATE FUNCTION public.fail_paragon_residence_job(p_call uuid,p_token uuid,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE paragon_residence_jobs SET attempts=attempts+1,last_error=left(p_error,64),lease_token=NULL,lease_until=NULL,
 available_at=clock_timestamp()+make_interval(secs=>least(300,power(2,least(attempts,8))::int)),updated_at=clock_timestamp()
 WHERE inbound_call_id=p_call AND lease_token=p_token;
END; $$;

CREATE VIEW public.v_paragon_residence_review WITH(security_invoker=true) AS
 SELECT j.inbound_call_id,i.call_record_id,j.tenant_id,i.twilio_call_sid,i.created_at,i.status AS call_status,j.capture,j.metadata,j.attempts,j.last_error,
 CASE WHEN coalesce((j.metadata->>'ambiguous')::boolean,false) THEN 'ambiguous_residence'
 WHEN j.capture='{}'::jsonb THEN 'no_valid_residence' ELSE 'capture_retry' END AS review_reason
 FROM paragon_residence_jobs j JOIN inbound_calls i ON i.id=j.inbound_call_id AND i.tenant_id=j.tenant_id
 WHERE i.status IN ('completed','declined','canceled','failed','no-answer','busy','voicemail','rejected')
 AND (j.capture='{}'::jsonb OR coalesce((j.metadata->>'ambiguous')::boolean,false) OR j.last_error IS NOT NULL);
REVOKE ALL ON public.v_paragon_residence_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_paragon_residence_review TO service_role;
REVOKE ALL ON FUNCTION public.save_paragon_contact_zip(uuid,uuid,text,text),public.enqueue_paragon_sep_residence(uuid,uuid,text,text,text,text,text),
 public.claim_paragon_residence_jobs(integer),public.finish_paragon_residence_job(uuid,uuid,jsonb,jsonb),public.fail_paragon_residence_job(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_paragon_contact_zip(uuid,uuid,text,text),public.enqueue_paragon_sep_residence(uuid,uuid,text,text,text,text,text),
 public.claim_paragon_residence_jobs(integer),public.finish_paragon_residence_job(uuid,uuid,jsonb,jsonb),public.fail_paragon_residence_job(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
