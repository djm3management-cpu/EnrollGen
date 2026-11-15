BEGIN;
CREATE TABLE public.admission_counters (
 key_hash text NOT NULL, window_start bigint NOT NULL, window_seconds integer NOT NULL,
 used integer NOT NULL CHECK(used>=0), expires_at timestamptz NOT NULL,
 PRIMARY KEY(key_hash,window_start,window_seconds)
);
CREATE INDEX admission_counter_expiry ON public.admission_counters(expires_at);
ALTER TABLE public.admission_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_counters FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.admission_counters TO service_role;
CREATE FUNCTION public.consume_admission(p_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; k text; s integer; cap integer; w bigint; n integer; retry integer:=0;
 t bigint:=floor(extract(epoch FROM clock_timestamp()));
BEGIN
 IF jsonb_typeof(p_rules)<>'array' OR jsonb_array_length(p_rules) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid admission rules'; END IF;
 -- Lock all keys in a stable order BEFORE reading. Shared daily budgets serialize
 -- requests from different function instances. No read/count then insert race.
 FOR k IN SELECT DISTINCT encode(sha256(convert_to(value->>'key','UTF8')),'hex') FROM jsonb_array_elements(p_rules) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('admission:'||k,0));
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
  IF r->>'key' IS NULL OR length(r->>'key') NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'Invalid admission key'; END IF;
  s:=(r->>'seconds')::integer;cap:=(r->>'limit')::integer;
  IF s IS NULL OR cap IS NULL OR s NOT IN (60,300,86400) OR cap NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Invalid admission limit'; END IF;
  k:=encode(sha256(convert_to(r->>'key','UTF8')),'hex');w:=(t/s)*s;
  SELECT used INTO n FROM admission_counters WHERE key_hash=k AND window_start=w AND window_seconds=s;
  IF coalesce(n,0)>=cap THEN retry:=greatest(retry,(w+s-t)::integer); END IF;
 END LOOP;
 IF retry>0 THEN RETURN jsonb_build_object('allowed',false,'retry_after',retry); END IF;
 FOR r IN SELECT DISTINCT value FROM jsonb_array_elements(p_rules) LOOP
  s:=(r->>'seconds')::integer;k:=encode(sha256(convert_to(r->>'key','UTF8')),'hex');w:=(t/s)*s;
  INSERT INTO admission_counters VALUES(k,w,s,1,to_timestamp(w+s))
  ON CONFLICT(key_hash,window_start,window_seconds) DO UPDATE SET used=admission_counters.used+1;
 END LOOP;
 RETURN jsonb_build_object('allowed',true,'retry_after',0);
END $$;
REVOKE ALL ON FUNCTION public.consume_admission(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admission(jsonb) TO service_role;
-- Bounded operator/worker maintenance. Do not retain subject identifiers.
CREATE FUNCTION public.prune_admission_counters() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n bigint; BEGIN
 DELETE FROM admission_counters WHERE ctid IN (SELECT ctid FROM admission_counters WHERE expires_at<clock_timestamp()-interval '1 day' LIMIT 10000);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.prune_admission_counters() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_admission_counters() TO service_role;
CREATE FUNCTION public.admit_vendor(p_key_hash text,p_route text,p_limit integer DEFAULT 600) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_route NOT IN ('vendorPing','availability') THEN RAISE EXCEPTION 'Invalid vendor route'; END IF;
 IF NOT EXISTS(SELECT 1 FROM availability_consumers WHERE key_hash=p_key_hash AND active)
 AND NOT (p_route='vendorPing' AND EXISTS(SELECT 1 FROM lead_sources WHERE ping_key_hash=p_key_hash AND active AND name=deployment_vendor_name() AND type='publisher'))
 THEN RETURN jsonb_build_object('authorized',false); END IF;
 result:=consume_admission(jsonb_build_array(jsonb_build_object('key','vendor:'||p_route||':'||p_key_hash,'seconds',60,'limit',p_limit)));
 RETURN result||jsonb_build_object('authorized',true);
END $$;
REVOKE ALL ON FUNCTION public.admit_vendor(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_vendor(text,text,integer) TO service_role;
-- Keep migration 055's sliding-window advisory serialization. The richer
-- service response distinguishes denial from a wrong credential without relying
-- on a spoofable x-forwarded-for header.
CREATE FUNCTION public.authorize_paragon_report_limited(p_hash text,p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ip_key text:=left(coalesce(nullif(p_ip,''),'unknown'),128);limited boolean;source uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('paragon-report:'||ip_key,0));
 SELECT count(*)>=30 INTO limited FROM paragon_report_access WHERE ip=ip_key AND attempted_at>clock_timestamp()-interval '5 minutes';
 source:=authorize_paragon_report(p_hash,ip_key);
 RETURN jsonb_build_object('source_id',source,'limited',limited,'retry_after',CASE WHEN limited THEN 300 ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.authorize_paragon_report_limited(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_paragon_report_limited(text,text) TO service_role;
COMMIT;
