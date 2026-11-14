-- Source statement 1
BEGIN;

-- Source statement 2
SET LOCAL lock_timeout='5s';

-- Source statement 3
CREATE TABLE public.deployment_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
 public_profile jsonb NOT NULL,
 CHECK(public_profile->>'tenantId'=tenant_id::text)
);

-- Source statement 4
ALTER TABLE public.deployment_settings ENABLE ROW LEVEL SECURITY;

-- Source statement 5
REVOKE ALL ON public.deployment_settings FROM PUBLIC,anon,authenticated;

-- Source statement 6
GRANT ALL ON public.deployment_settings TO service_role;

-- Source statement 7
CREATE FUNCTION public.deployment_timezone() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE zone text;
BEGIN
 SELECT public_profile->>'timezone' INTO zone FROM deployment_settings WHERE singleton;
 IF zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Deployment timezone has not been provisioned'; END IF;
 RETURN zone;
END $$;

-- Source statement 8
REVOKE ALL ON FUNCTION public.deployment_timezone() FROM PUBLIC,anon;

-- Source statement 9
GRANT EXECUTE ON FUNCTION public.deployment_timezone() TO authenticated,service_role;

-- Source statement 10
ALTER TABLE public.tenant_agents ADD COLUMN IF NOT EXISTS identity_aliases jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS licensed_states jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS team text,
 ADD COLUMN IF NOT EXISTS sunfire_agent_id text,
 ADD COLUMN IF NOT EXISTS ams_producer_id text;

-- Source statement 11
CREATE UNIQUE INDEX deployment_roster_subject ON public.tenant_agents(tenant_id,clerk_user_id) WHERE is_active;

-- Source statement 12
CREATE UNIQUE INDEX deployment_roster_slug ON public.tenant_agents(tenant_id,agent_slug) WHERE is_active;

-- Source statement 13
CREATE UNIQUE INDEX deployment_roster_npn ON public.tenant_agents(tenant_id,npn) WHERE is_active;

-- Source statement 14
CREATE UNIQUE INDEX deployment_roster_name ON public.tenant_agents(tenant_id,name) WHERE is_active;

-- Source statement 15
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.tenant_agents FROM PUBLIC,anon,authenticated;

-- Source statement 16
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_agents' LOOP
 EXECUTE format('REVOKE INSERT (%I),UPDATE (%I),REFERENCES (%I) ON public.tenant_agents FROM PUBLIC,anon,authenticated',c.column_name,c.column_name,c.column_name);
 END LOOP;
END $$;

-- Source statement 17
CREATE FUNCTION public.provision_deployment_roster(p_profile jsonb,p_agents jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tenant uuid:=(p_profile->>'tenantId')::uuid; item jsonb; agent_uuid uuid; former_slugs text[]; zone text:=p_profile->>'timezone';
BEGIN
 IF jsonb_typeof(p_agents)<>'array' OR jsonb_array_length(p_agents)=0 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Invalid deployment provisioning input'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_agents) a WHERE nullif(a->>'clerk_user_id','') IS NULL OR nullif(a->>'agent_slug','') IS NULL OR nullif(a->>'npn','') IS NULL OR nullif(a->>'name','') IS NULL) THEN RAISE EXCEPTION 'Stable roster binding required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('deployment-roster',0));
 IF EXISTS(SELECT 1 FROM deployment_settings WHERE tenant_id<>tenant) THEN RAISE EXCEPTION 'Deployment tenant cannot be replaced'; END IF;
 INSERT INTO tenants(id,name,clerk_org_id,agency_display_name) VALUES(tenant,p_profile->>'agencyName',p_profile->>'organizationId',p_profile->>'agencyName')
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,clerk_org_id=excluded.clerk_org_id,agency_display_name=excluded.agency_display_name;
 INSERT INTO deployment_settings(singleton,tenant_id,public_profile) VALUES(true,tenant,p_profile) ON CONFLICT(singleton) DO UPDATE SET public_profile=excluded.public_profile;
 SELECT array_agg(agent_slug) INTO former_slugs FROM tenant_agents WHERE tenant_id=tenant;
 -- A full reviewed roster is applied atomically, including revocation in protected mappings.
 UPDATE tenant_agents SET is_active=false WHERE tenant_id=tenant;
 UPDATE enrolled_agents SET is_active=false WHERE tenant_id=tenant;
 UPDATE availability_agent_subjects SET is_active=false WHERE tenant_id=tenant;
 DELETE FROM recording_agent_subjects WHERE tenant_id=tenant;
 FOR item IN SELECT * FROM jsonb_array_elements(p_agents) LOOP
  IF (item->>'is_active')::boolean IS NOT TRUE THEN CONTINUE; END IF;
  agent_uuid:=(item->>'id')::uuid;
  IF EXISTS(SELECT 1 FROM tenant_agents WHERE id=agent_uuid AND tenant_id<>tenant) THEN RAISE EXCEPTION 'Foreign roster ID'; END IF;
  INSERT INTO tenant_agents(id,tenant_id,name,npn,clerk_user_id,agent_slug,ghl_user_id,is_active,identity_aliases,licensed_states,team,sunfire_agent_id,ams_producer_id)
  VALUES(agent_uuid,tenant,item->>'name',item->>'npn',item->>'clerk_user_id',item->>'agent_slug',item->>'ghl_user_id',true,item->'identity_aliases',item->'licensed_states',item->>'team',item->>'sunfire_agent_id',item->>'ams_producer_id')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,npn=excluded.npn,clerk_user_id=excluded.clerk_user_id,agent_slug=excluded.agent_slug,ghl_user_id=excluded.ghl_user_id,is_active=true,identity_aliases=excluded.identity_aliases,licensed_states=excluded.licensed_states,team=excluded.team,sunfire_agent_id=excluded.sunfire_agent_id,ams_producer_id=excluded.ams_producer_id;
  -- Roles deliberately are NOT copied from the roster payload.
  INSERT INTO enrolled_agents(tenant_id,clerk_user_id,name,npn,role,is_active) VALUES(tenant,item->>'clerk_user_id',item->>'name',item->>'npn','agent',true)
  ON CONFLICT(clerk_user_id) DO UPDATE SET name=excluded.name,npn=excluded.npn,is_active=true WHERE enrolled_agents.tenant_id=tenant;
  INSERT INTO agent_availability(agent_id,agent_name,available,status,toggled_at) VALUES(item->>'agent_slug',item->>'name',false,'offline',now())
  ON CONFLICT(agent_id) DO UPDATE SET agent_name=excluded.agent_name;
  INSERT INTO availability_agent_subjects(agent_slug,tenant_id,clerk_org_id,clerk_user_id,is_active) VALUES(item->>'agent_slug',tenant,p_profile->>'organizationId',item->>'clerk_user_id',true)
  ON CONFLICT(agent_slug) DO UPDATE SET clerk_org_id=excluded.clerk_org_id,clerk_user_id=excluded.clerk_user_id,is_active=true WHERE availability_agent_subjects.tenant_id=tenant;
  INSERT INTO recording_agent_subjects(tenant_id,agent_slug,clerk_user_id) VALUES(tenant,item->>'agent_slug',item->>'clerk_user_id');
 END LOOP;
 UPDATE agent_availability SET available=false,status='offline',toggled_at=now() WHERE agent_id=ANY(former_slugs) AND NOT EXISTS(SELECT 1 FROM tenant_agents t WHERE t.tenant_id=tenant AND t.is_active AND t.agent_slug=agent_availability.agent_id);
 RETURN (SELECT count(*)::integer FROM tenant_agents WHERE tenant_id=tenant AND is_active);
END $$;

-- Source statement 18
REVOKE ALL ON FUNCTION public.provision_deployment_roster(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

-- Source statement 19
GRANT EXECUTE ON FUNCTION public.provision_deployment_roster(jsonb,jsonb) TO service_role;

-- Source statement 20
CREATE TABLE public.deployment_vendor_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),source_name text NOT NULL);

-- Source statement 21
ALTER TABLE public.deployment_vendor_settings ENABLE ROW LEVEL SECURITY;

-- Source statement 22
REVOKE ALL ON public.deployment_vendor_settings FROM PUBLIC,anon,authenticated;

-- Source statement 23
GRANT ALL ON public.deployment_vendor_settings TO service_role;

-- Source statement 24
CREATE FUNCTION public.deployment_vendor_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT source_name FROM deployment_vendor_settings WHERE singleton;
$$;

-- Source statement 25
REVOKE ALL ON FUNCTION public.deployment_vendor_name() FROM PUBLIC,anon,authenticated;

-- Source statement 26
GRANT EXECUTE ON FUNCTION public.deployment_vendor_name() TO service_role;

-- Source statement 27
DO $vendor_names$ DECLARE routine record; BEGIN
 FOR routine IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND l.lanname IN('sql','plpgsql') AND position('Paragon Media' IN p.prosrc)>0 LOOP
  EXECUTE replace(pg_get_functiondef(routine.oid),quote_literal('Paragon Media'),'public.deployment_vendor_name()');
 END LOOP;
END $vendor_names$;

-- Source statement 28
DO $rewrite$ DECLARE routine record; definition text; BEGIN
 FOR routine IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND l.lanname IN('sql','plpgsql') AND p.prosrc LIKE '%America/New_York%' LOOP
  definition:=replace(pg_get_functiondef(routine.oid),quote_literal('America/New_York'),'public.deployment_timezone()');
  EXECUTE definition;
 END LOOP;
 FOR routine IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' LOOP
  definition:=pg_get_viewdef(routine.oid,true);
  IF position('America/New_York' IN definition)>0 THEN
   EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker=true) AS %s',routine.relname,replace(definition,quote_literal('America/New_York')||'::text','public.deployment_timezone()'));
  END IF;
 END LOOP;
 -- Replace the unsafe display-name-derived owner in the current save routine.
 FOR routine IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='save_enrollment_intake' LOOP
  definition:=pg_get_functiondef(routine.oid);
  IF position('owner_slug:=lower(replace' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected intake routine; review roster patch'; END IF;
  definition:=replace(definition,'owner_slug:=lower(replace(p_data->>''aor'','' '',''_''));',
   'SELECT agent_slug INTO STRICT owner_slug FROM tenant_agents WHERE id=(p_data->>''writingAgentId'')::uuid AND tenant_id=p_tenant AND is_active AND name=p_data->>''aor'';');
  EXECUTE definition;
 END LOOP;
END $rewrite$;

-- Source statement 29
CREATE FUNCTION public.configure_deployment_vendor(p_vendor jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deployment deployment_settings; source uuid; item jsonb; required text[]; critical text[]; states text[];
BEGIN
 SELECT * INTO STRICT deployment FROM deployment_settings WHERE singleton;
 INSERT INTO deployment_vendor_settings(singleton,source_name) VALUES(true,p_vendor->>'sourceName') ON CONFLICT(singleton) DO UPDATE SET source_name=excluded.source_name;
 SELECT array_agg(value) INTO states FROM jsonb_array_elements_text(p_vendor->'states');
 SELECT array_agg(value) INTO required FROM jsonb_array_elements_text(p_vendor->'requiredCarriers');
 SELECT array_agg(value) INTO critical FROM jsonb_array_elements_text(p_vendor->'criticalCarriers');
 INSERT INTO lead_sources(tenant_id,name,type,ping_key_hash,postback_url,postback_secret,report_emails,active)
 VALUES(deployment.tenant_id,p_vendor->>'sourceName','publisher',p_vendor->>'pingKeyHash',p_vendor->>'postbackUrl',p_vendor->>'postbackSecret',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_vendor->'reportRecipients','[]'))),true)
 ON CONFLICT(tenant_id,name) DO UPDATE SET ping_key_hash=excluded.ping_key_hash,postback_url=excluded.postback_url,postback_secret=excluded.postback_secret,report_emails=excluded.report_emails,active=true RETURNING id INTO source;
 INSERT INTO availability_consumers(name,key_hash,active,push_url,push_secret,push_enabled)
 VALUES(p_vendor->>'sourceName',p_vendor->>'availabilityKeyHash',true,p_vendor->>'pushUrl',p_vendor->>'pushSecret',true)
 ON CONFLICT(name) DO UPDATE SET key_hash=excluded.key_hash,active=true,push_url=excluded.push_url,push_secret=excluded.push_secret,push_enabled=true;
 INSERT INTO vendor_routing_config(source_id,allowed_states,required_carriers,critical_carriers,plan_year,reservation_ttl_seconds)
 VALUES(source,states,required,critical,(p_vendor->>'planYear')::integer,(p_vendor->>'reservationTtlSeconds')::integer)
 ON CONFLICT(source_id) DO UPDATE SET allowed_states=excluded.allowed_states,required_carriers=excluded.required_carriers,critical_carriers=excluded.critical_carriers,plan_year=excluded.plan_year,reservation_ttl_seconds=excluded.reservation_ttl_seconds;
 INSERT INTO vendor_controls(tenant_id,vendor_pause,staffed_hours,paragon_daily_cap,paragon_cap_mode,paragon_rate,updated_by)
 VALUES(deployment.tenant_id,true,jsonb_build_object('timezone',deployment.public_profile->>'timezone','days',deployment.public_profile->'staffedHours'),(p_vendor->>'dailyCap')::integer,p_vendor->>'capMode',(p_vendor->>'rate')::numeric,'deployment-operator')
 ON CONFLICT(tenant_id) DO UPDATE SET staffed_hours=excluded.staffed_hours,paragon_daily_cap=excluded.paragon_daily_cap,paragon_cap_mode=excluded.paragon_cap_mode,paragon_rate=excluded.paragon_rate,updated_by=excluded.updated_by;
 INSERT INTO paragon_report_tokens(source_id,token_hash,updated_by) VALUES(source,p_vendor->>'reportTokenHash','deployment-operator')
 ON CONFLICT(source_id) DO UPDATE SET token_hash=excluded.token_hash,updated_by=excluded.updated_by;
 DELETE FROM vendor_agent_state_eligibility WHERE source_id=source;
 FOR item IN SELECT * FROM jsonb_array_elements(p_vendor->'eligibility') LOOP
  IF NOT EXISTS(SELECT 1 FROM tenant_agents WHERE tenant_id=deployment.tenant_id AND id=(item->>'agentId')::uuid AND is_active AND licensed_states ? (item->>'state')) THEN RAISE EXCEPTION 'Vendor matrix requires an active licensed roster binding'; END IF;
  INSERT INTO vendor_agent_state_eligibility(source_id,plan_year,agent_id,state,aetna,humana,uhc,wellcare,devoted,healthspring,updated_by)
  VALUES(source,(p_vendor->>'planYear')::integer,(item->>'agentId')::uuid,item->>'state',(item->'carriers')?'aetna',(item->'carriers')?'humana',(item->'carriers')?'uhc',(item->'carriers')?'wellcare',(item->'carriers')?'devoted',(item->'carriers')?'healthspring','deployment-operator');
 END LOOP;
 RETURN source;
END $$;

-- Source statement 30
REVOKE ALL ON FUNCTION public.configure_deployment_vendor(jsonb) FROM PUBLIC,anon,authenticated;

-- Source statement 31
GRANT EXECUTE ON FUNCTION public.configure_deployment_vendor(jsonb) TO service_role;

-- Source statement 32
NOTIFY pgrst,'reload schema';

-- Source statement 33
COMMIT;
