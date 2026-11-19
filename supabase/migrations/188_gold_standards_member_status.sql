-- UNAPPLIED: isolated pilot only
-- Gold Standards: member status and CTM ingestion, the MBI match key and the
-- benefit activation workflow (docs/feature-gold-standards.md, items 1, 2, 5).
-- 1. The enrollment record is enrollment_intakes. Only completed, submitted,
--    non-test intakes take part (the re-shop source rules in 170).
-- 2. MBI key: a peppered HMAC of the normalized MBI. The pepper is a Vault
--    secret referenced from member_match_secrets, provisioned once, exactly as
--    ping_phone_pepper in 176 but never the same secret. save_enrollment_intake
--    stores the key for new and edited intakes once the pepper exists. No
--    existing intake is backfilled here; the raw MBI is never stored in any
--    table this migration adds.
-- 3. member_status_import (effectuation, disenrollment, reinstatement and
--    carrier termination files) and the same routine for CTM files. A file
--    hash imports once per tenant and kind. Rows match deterministically, in
--    order: confirmation (enrollmentId or sunfireCode), carrier member id
--    (member_carrier_ids), then MBI key plus carrier plus effective date. A key
--    must identify exactly one intake. Anything else is queued for an admin.
-- 4. member_status_events are immutable. Unmatched rows never become events
--    until an admin links them; every link is written to admin_action_log.
-- 5. ctm_records hold no narrative text. A matched open CTM flags the contact
--    through the existing retention_flag_complaint, so the existing complaint
--    hold applies. Only resolve_ctm, through retention_resolve_complaint,
--    clears it. A carrier file can report a resolution; it never resolves.
-- 6. activation_tasks open only when a matched effectuated event arrives, for
--    MA, MAPD, PDP and Medicare Supplement. Items are recorded by a person in
--    the append only activation_item_records. No outbound action exists.
-- 7. Lifecycle events for the consumer file, each behind its own flag.
-- Flags: MEMBER_STATUS_IMPORT_ENABLED, CTM_IMPORT_ENABLED,
-- BENEFIT_ACTIVATION_ENABLED. Service role only. Forward only. Never touches
-- production data.
BEGIN;
SET LOCAL lock_timeout='5s';

-- 2. MBI pepper, Vault backed, provisioned once.
CREATE TABLE public.member_match_secrets (
  name text PRIMARY KEY CHECK (name IN ('mbi_pepper')),
  vault_secret_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION public.member_mbi_pepper() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pepper text;
BEGIN
 SELECT ds.decrypted_secret INTO pepper FROM member_match_secrets s
  JOIN vault.decrypted_secrets ds ON ds.id=s.vault_secret_id WHERE s.name='mbi_pepper';
 RETURN CASE WHEN length(pepper)>=32 THEN pepper END;
END $$;

-- Rotating the pepper would orphan every stored key, so a second call is refused.
CREATE FUNCTION public.provision_member_mbi_pepper(p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.deployment_feature_enabled('MEMBER_STATUS_IMPORT_ENABLED') THEN RAISE EXCEPTION 'Member status import disabled'; END IF;
 IF p_secret IS NULL OR length(p_secret)<32 THEN RAISE EXCEPTION 'MBI pepper must be at least 32 characters'; END IF;
 IF EXISTS(SELECT 1 FROM member_match_secrets WHERE name='mbi_pepper') THEN RAISE EXCEPTION 'MBI pepper is already provisioned'; END IF;
 IF p_secret=(SELECT ds.decrypted_secret FROM ping_platform_secrets s JOIN vault.decrypted_secrets ds ON ds.id=s.vault_secret_id WHERE s.name='phone_pepper') THEN
  RAISE EXCEPTION 'MBI pepper must differ from the phone pepper'; END IF;
 INSERT INTO member_match_secrets(name,vault_secret_id)
 VALUES('mbi_pepper',vault.create_secret(p_secret,'member_mbi_pepper','EnrollGen member match MBI pepper'));
END $$;

-- The CMS MBI format, after removing spaces and dashes and uppercasing. Any
-- other value has no key; nothing is guessed.
CREATE FUNCTION public.member_mbi_normalize(p_mbi text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN v ~ '^[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9][0-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9][0-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y][0-9][0-9]$' THEN v END
 FROM (SELECT upper(regexp_replace(coalesce(p_mbi,''),'[\s-]','','g')) v) x
$$;

-- Hex HMAC-SHA256, or null when the MBI is invalid or the pepper is absent.
CREATE FUNCTION public.member_mbi_key(p_mbi text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v text:=public.member_mbi_normalize(p_mbi); pepper text;
BEGIN
 IF v IS NULL THEN RETURN NULL; END IF;
 pepper:=public.member_mbi_pepper();
 IF pepper IS NULL THEN RETURN NULL; END IF;
 RETURN encode(extensions.hmac(convert_to(v,'UTF8'),convert_to(pepper,'UTF8'),'sha256'),'hex');
END $$;

ALTER TABLE public.enrollment_intakes ADD COLUMN mbi_match_key text CHECK (mbi_match_key IS NULL OR mbi_match_key ~ '^[0-9a-f]{64}$');
CREATE INDEX enrollment_intake_mbi_key ON public.enrollment_intakes(tenant_id,mbi_match_key) WHERE mbi_match_key IS NOT NULL;

-- The key is written in the same statement sequence as the intake, from the
-- caller's MBI, which the routine already encrypts. Without a pepper it stays null.
DO $$ DECLARE r record; d text; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='save_enrollment_intake' LOOP
  d:=pg_get_functiondef(r.oid);
  IF strpos(d,'RETURNING id INTO result;')=0 THEN RAISE EXCEPTION 'save_enrollment_intake anchor missing'; END IF;
  d:=replace(d,'RETURNING id INTO result;','RETURNING id INTO result;
 UPDATE enrollment_intakes SET mbi_match_key=public.member_mbi_key(p_data->>''mbi'') WHERE id=result AND tenant_id=p_tenant AND mbi_match_key IS DISTINCT FROM public.member_mbi_key(p_data->>''mbi'');');
  EXECUTE d;
 END LOOP;
END $$;

-- Date from an intake text field, or null.
CREATE FUNCTION public.gold_date(p_value text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL OR p_value !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
 RETURN p_value::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;

-- Confirmation numbers compare after uppercasing and removing whitespace only.
CREATE FUNCTION public.gold_confirmation(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT nullif(upper(regexp_replace(coalesce(p_value,''),'\s','','g')),'')
$$;

-- The landscape row for one plan year, contract, plan and segment.
CREATE FUNCTION public.gold_landscape_plan(p_year integer,p_contract text,p_plan text,p_segment text)
RETURNS TABLE(category text,plan_type text,snp_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE relation regclass;
BEGIN
 IF p_year IS NULL OR p_year<1900 OR p_year>3000 OR p_contract IS NULL OR p_plan IS NULL THEN RETURN; END IF;
 relation:=to_regclass(format('public.cms_plans_py%s',p_year));
 IF relation IS NULL THEN RETURN; END IF;
 RETURN QUERY EXECUTE format('SELECT category,plan_type,snp_type FROM %s WHERE plan_year=$1 AND contract_id=$2 AND lpad(plan_id,3,''0'')=$3 AND lpad(segment_id,3,''0'')=$4 ORDER BY category,plan_type,snp_type LIMIT 1',relation)
  USING p_year,p_contract,p_plan,coalesce(p_segment,'000');
END $$;

-- Product line: Medicare Supplement from the intake coverage type, an
-- S-contract is PDP, otherwise the landscape category. Unknown stays null.
CREATE FUNCTION public.gold_coverage(p_plan_type text,p_contract text,p_category text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE
  WHEN upper(btrim(coalesce(p_plan_type,''))) IN ('MS','MEDSUPP','MED SUPP','MEDICARE SUPPLEMENT') THEN 'MS'
  WHEN upper(coalesce(p_contract,'')) LIKE 'S%' THEN 'PDP'
  WHEN p_category='MA' THEN 'MA' WHEN p_category IN ('MA-PD','SNP') THEN 'MAPD' WHEN p_category='PDP' THEN 'PDP' END
$$;

-- Qualifying enrollments: completed, submitted, non-test intakes with their
-- structured facts. latest marks the re-shop selection (most recent per
-- contact and coverage). The writer follows the re-shop rules; an unresolved
-- writer stays null and the enrollment still counts.
CREATE FUNCTION public.gold_enrollments(p_tenant uuid)
RETURNS TABLE(id uuid,tenant_id uuid,contact_id uuid,call_id uuid,submitted_at timestamptz,effective_date date,
  carrier text,confirmation text,sunfire text,mbi_match_key text,contract_id text,plan_id text,segment_id text,
  category text,plan_type text,snp_type text,coverage text,agent_id uuid,latest boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH base AS (
  SELECT e.*,upper(btrim(e.data->>'contractId')) k_contract,
   CASE WHEN e.data->>'planId' ~ '^\d{1,3}$' THEN lpad(e.data->>'planId',3,'0') END k_plan,
   CASE WHEN e.data->>'segmentId' ~ '^\d{1,3}$' THEN lpad(e.data->>'segmentId',3,'0') ELSE '000' END k_segment,
   public.gold_date(e.data->>'effectiveDate') k_effective
  FROM public.enrollment_intakes e
  WHERE e.tenant_id=p_tenant AND e.completed_at IS NOT NULL AND e.submitted_at IS NOT NULL AND NOT e.is_test_enrollment
 ), facts AS (
  SELECT b.*,l.category l_category,l.plan_type l_plan_type,l.snp_type l_snp_type,
   public.gold_coverage(b.data->>'planType',b.k_contract,l.category) k_coverage
  FROM base b LEFT JOIN LATERAL public.gold_landscape_plan(extract(year FROM b.k_effective)::integer,b.k_contract,b.k_plan,b.k_segment) l ON true
 )
 SELECT f.id,f.tenant_id,f.contact_id,f.call_id,f.submitted_at,f.k_effective,
  nullif(btrim(coalesce(nullif(f.data->>'newCarrier',''),f.carrier_key)),''),
  public.gold_confirmation(f.data->>'enrollmentId'),public.gold_confirmation(f.data->>'sunfireCode'),f.mbi_match_key,
  f.k_contract,f.k_plan,f.k_segment,f.l_category,f.l_plan_type,f.l_snp_type,f.k_coverage,w.agent_id,
  row_number() OVER (PARTITION BY f.contact_id,coalesce(f.k_coverage,public.reshop_coverage(f.data->>'planType',f.data->>'contractId'))
   ORDER BY f.submitted_at DESC,f.completed_at DESC,f.id DESC)=1
 FROM facts f
 LEFT JOIN LATERAL (
  SELECT ea.id agent_id FROM public.call_records cr
  JOIN public.enrolled_agents ca ON ca.id=cr.agent_id AND ca.tenant_id=f.tenant_id
  JOIN public.tenant_agents a ON a.tenant_id=f.tenant_id AND
   CASE WHEN nullif(f.data->>'writingAgentId','') IS NOT NULL THEN a.id::text=f.data->>'writingAgentId'
    WHEN nullif(f.data->>'writingAgentSlug','') IS NOT NULL THEN a.agent_slug=f.data->>'writingAgentSlug'
    WHEN nullif(f.data->>'aor','') IS NOT NULL THEN a.agent_slug=lower(replace(f.data->>'aor',' ','_'))
    ELSE a.clerk_user_id=ca.clerk_user_id END
  JOIN public.enrolled_agents ea ON ea.clerk_user_id=a.clerk_user_id AND ea.tenant_id=f.tenant_id
  WHERE cr.id=f.call_id AND cr.tenant_id=f.tenant_id ORDER BY ea.id LIMIT 1) w ON true
$$;

-- 3. Per carrier column mappings: configuration, not code.
CREATE TABLE public.member_status_column_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind text NOT NULL CHECK (kind IN ('member_status','ctm')),
  carrier text NOT NULL CHECK (length(btrim(carrier)) BETWEEN 1 AND 100),
  mapping jsonb NOT NULL CHECK (jsonb_typeof(mapping)='object' AND jsonb_typeof(mapping->'columns')='object'),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,kind,carrier)
);

CREATE TABLE public.member_status_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind text NOT NULL CHECK (kind IN ('member_status','ctm')),
  carrier text NOT NULL CHECK (length(btrim(carrier)) BETWEEN 1 AND 100),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_as_of date NOT NULL,
  row_count integer NOT NULL CHECK (row_count>=0),
  matched_count integer NOT NULL DEFAULT 0 CHECK (matched_count>=0),
  queued_count integer NOT NULL DEFAULT 0 CHECK (queued_count>=0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count>=0),
  dropped_columns text[] NOT NULL DEFAULT '{}',
  uploaded_by text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,kind,file_sha256)
);
CREATE INDEX member_status_file_as_of ON public.member_status_import_files(tenant_id,kind,carrier,file_as_of DESC);

CREATE TABLE public.member_carrier_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  enrollment_intake_id uuid NOT NULL REFERENCES public.enrollment_intakes(id),
  carrier text NOT NULL,
  carrier_member_id text NOT NULL CHECK (length(carrier_member_id) BETWEEN 1 AND 64),
  first_seen_file_id uuid NOT NULL REFERENCES public.member_status_import_files(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,carrier,carrier_member_id)
);
CREATE INDEX member_carrier_ids_intake ON public.member_carrier_ids(tenant_id,enrollment_intake_id);

CREATE TABLE public.member_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  enrollment_intake_id uuid NOT NULL REFERENCES public.enrollment_intakes(id),
  carrier text NOT NULL,
  product_line text CHECK (product_line IS NULL OR product_line IN ('MA','MAPD','PDP','MS')),
  event_type text NOT NULL CHECK (event_type IN ('effectuated','disenrolled','reinstated','terminated_by_carrier')),
  event_effective_date date NOT NULL,
  disenroll_reason_code text CHECK (disenroll_reason_code IS NULL OR length(disenroll_reason_code) BETWEEN 1 AND 40),
  source_file_id uuid NOT NULL REFERENCES public.member_status_import_files(id),
  source_row_number integer NOT NULL CHECK (source_row_number>=1),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  matched_by text NOT NULL CHECK (matched_by IN ('confirmation','carrier_member_id','mbi_key','manual')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_file_id,source_row_number)
);
CREATE INDEX member_status_events_intake ON public.member_status_events(tenant_id,enrollment_intake_id,seq);

CREATE TABLE public.ctm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  carrier text NOT NULL,
  cms_complaint_id text NOT NULL CHECK (length(cms_complaint_id) BETWEEN 1 AND 64),
  received_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('enrollment_disenrollment','marketing','benefits_access','pricing_premium',
    'pharmacy','provider_network','customer_service','plan_administration','other')),
  enrollment_intake_id uuid REFERENCES public.enrollment_intakes(id),
  contact_id uuid REFERENCES public.contacts(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  carrier_reported_status text CHECK (carrier_reported_status IS NULL OR carrier_reported_status IN ('open','resolved')),
  resolution_code text CHECK (resolution_code IS NULL OR resolution_code ~ '^[A-Za-z0-9_-]{1,40}$'),
  resolved_at timestamptz,
  resolved_by text,
  matched_by text CHECK (matched_by IS NULL OR matched_by IN ('confirmation','carrier_member_id','mbi_key','manual')),
  source_file_id uuid NOT NULL REFERENCES public.member_status_import_files(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id,carrier,cms_complaint_id),
  CHECK ((status='open' AND resolved_at IS NULL AND resolved_by IS NULL) OR (status='resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)),
  CHECK ((enrollment_intake_id IS NULL)=(matched_by IS NULL))
);
CREATE INDEX ctm_records_contact ON public.ctm_records(tenant_id,contact_id,status);
CREATE INDEX ctm_records_intake ON public.ctm_records(tenant_id,enrollment_intake_id);

-- Unmatched rows wait for an admin. No raw MBI: only its key.
CREATE TABLE public.member_unmatched_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  kind text NOT NULL CHECK (kind IN ('member_status','ctm')),
  source_file_id uuid NOT NULL REFERENCES public.member_status_import_files(id),
  source_row_number integer NOT NULL CHECK (source_row_number>=1),
  carrier text NOT NULL,
  confirmation text,
  carrier_member_id text CHECK (carrier_member_id IS NULL OR length(carrier_member_id) BETWEEN 1 AND 64),
  mbi_match_key text CHECK (mbi_match_key IS NULL OR mbi_match_key ~ '^[0-9a-f]{64}$'),
  effective_date date,
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='object'),
  ctm_id uuid REFERENCES public.ctm_records(id),
  reason text NOT NULL CHECK (reason IN ('no_match','ambiguous')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','linked','dismissed')),
  linked_intake_id uuid REFERENCES public.enrollment_intakes(id),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_file_id,source_row_number)
);
CREATE INDEX member_unmatched_open ON public.member_unmatched_rows(tenant_id,kind,created_at) WHERE status='open';

-- 6. Benefit activation.
CREATE TABLE public.activation_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
  due_days integer NOT NULL DEFAULT 30 CHECK (due_days BETWEEN 7 AND 90),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.activation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  enrollment_intake_id uuid NOT NULL UNIQUE REFERENCES public.enrollment_intakes(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  member_status_event_id uuid NOT NULL REFERENCES public.member_status_events(id),
  product_line text NOT NULL CHECK (product_line IN ('MA','MAPD','PDP','MS')),
  carrier text NOT NULL,
  assigned_agent_id uuid REFERENCES public.enrolled_agents(id),
  assigned_role text NOT NULL CHECK (assigned_role IN ('agent','service')),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','unreachable','cancelled')),
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='open' AND completed_at IS NULL AND completed_by IS NULL) OR (status<>'open' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CHECK ((assigned_role='agent')=(assigned_agent_id IS NOT NULL))
);
CREATE INDEX activation_tasks_open ON public.activation_tasks(tenant_id,status,due_date);

CREATE TABLE public.activation_task_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  task_id uuid NOT NULL REFERENCES public.activation_tasks(id),
  kind text NOT NULL CHECK (kind IN ('member_card','pcp','pharmacy','supplemental_benefit','member_reachable')),
  benefit_label text CHECK (benefit_label IS NULL OR length(btrim(benefit_label)) BETWEEN 1 AND 60),
  position integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind='supplemental_benefit')=(benefit_label IS NOT NULL)),
  UNIQUE (task_id,position)
);
CREATE UNIQUE INDEX activation_item_kind ON public.activation_task_items(task_id,kind) WHERE kind<>'supplemental_benefit';
CREATE UNIQUE INDEX activation_item_benefit ON public.activation_task_items(task_id,lower(btrim(benefit_label))) WHERE kind='supplemental_benefit';

-- Append only: the latest record is an item's current outcome.
CREATE TABLE public.activation_item_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  item_id uuid NOT NULL REFERENCES public.activation_task_items(id),
  outcome text NOT NULL CHECK (outcome IN ('done','not_applicable','member_declined','unreachable')),
  note text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 200),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX activation_item_records_item ON public.activation_item_records(item_id,seq DESC);

-- Immutable rows: no UPDATE ever; DELETE only for the retention job.
CREATE FUNCTION public.gold_reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' AND public.deployment_feature_enabled('RETENTION_PURGE_ENABLED') THEN RETURN OLD; END IF;
 -- An import file's own summary counts are written once, by its importer.
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='member_status_import_files' THEN
  IF (to_jsonb(OLD)->>'matched_count')::integer=0 AND (to_jsonb(OLD)->>'queued_count')::integer=0 AND (to_jsonb(OLD)->>'rejected_count')::integer=0
   AND to_jsonb(NEW)-ARRAY['matched_count','queued_count','rejected_count']=to_jsonb(OLD)-ARRAY['matched_count','queued_count','rejected_count'] THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION '% rows are immutable',TG_TABLE_NAME USING ERRCODE='42501';
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['member_status_events','member_carrier_ids','activation_item_records','member_status_import_files'] LOOP
  EXECUTE format('CREATE TRIGGER gold_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gold_reject_mutation()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['member_status_import_files','member_carrier_ids','member_status_events','ctm_records','member_unmatched_rows',
   'activation_tasks','activation_task_items','activation_item_records'] LOOP
  EXECUTE format('CREATE TRIGGER retention_anchor_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.retention_anchor_immutable()',t);
 END LOOP;
END $$;

-- Note text is short and must not carry identifiers: no digit runs of five or
-- more and nothing shaped like an MBI.
CREATE FUNCTION public.gold_note_ok(p_note text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT p_note IS NULL OR (length(p_note) BETWEEN 1 AND 200 AND p_note !~ '\d{5,}' AND p_note !~ '\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d'
  AND NOT EXISTS(SELECT 1 FROM regexp_matches(upper(p_note),'[0-9A-Z-]{11,13}','g') m WHERE public.member_mbi_normalize(m[1]) IS NOT NULL))
$$;

-- One admin_action_log row, in the caller's transaction.
CREATE FUNCTION public.gold_audit(p_actor text,p_tenant uuid,p_action text,p_target_type text,p_target uuid,p_after jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.admin_action_log(request_id,actor_id,tenant_id,action,target_type,target_id,result,before_summary,after_summary)
 VALUES(gen_random_uuid(),p_actor,p_tenant,p_action,p_target_type,coalesce(p_target::text,'collection'),'succeeded','{}',coalesce(p_after,'{}'));
END $$;

-- Operator backfill for intakes saved before the pepper existed, in batches
-- after a cursor. Decryption happens inside the database with the existing
-- decrypt_pii_value; only the key is written and no plaintext is returned.
-- Run only by scripts/gold/backfill-mbi-keys.mjs with explicit opt-in.
CREATE FUNCTION public.member_backfill_mbi_keys(p_after uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; k text; processed integer:=0; keyed integer:=0; last uuid; tenants jsonb:='{}';
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled('MEMBER_STATUS_IMPORT_ENABLED') THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 IF public.member_mbi_pepper() IS NULL THEN RAISE EXCEPTION 'MBI pepper is not provisioned'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT e.id,e.tenant_id,e.pii_encrypted->'mbi' mbi FROM enrollment_intakes e
  WHERE (p_after IS NULL OR e.id>p_after) AND e.mbi_match_key IS NULL AND e.completed_at IS NOT NULL AND NOT e.is_test_enrollment
  ORDER BY e.id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  processed:=processed+1; last:=r.id;
  k:=public.member_mbi_key(public.decrypt_pii_value(r.mbi));
  IF k IS NOT NULL THEN
   UPDATE enrollment_intakes SET mbi_match_key=k WHERE id=r.id; keyed:=keyed+1;
   tenants:=jsonb_set(tenants,ARRAY[r.tenant_id::text],to_jsonb(coalesce((tenants->>r.tenant_id::text)::integer,0)+1));
  END IF;
 END LOOP;
 FOR r IN SELECT key,value FROM jsonb_each(tenants) LOOP
  PERFORM public.gold_audit('service:mbi_key_backfill',r.key::uuid,'mbi_key_backfill','enrollment_intakes',NULL,jsonb_build_object('op','backfill','keyed',r.value));
 END LOOP;
 RETURN jsonb_build_object('processed',processed,'keyed',keyed,'last',last);
END $$;

-- Protected identity for one service call; raises unless the flag is on.
CREATE FUNCTION public.gold_subject(p_actor text,p_org text,p_flag text,p_admin boolean)
RETURNS TABLE(tenant_id uuid,agent_id uuid,authority text,team_agent_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i record;
BEGIN
 IF current_setting('role',true)<>'service_role' OR NOT public.deployment_feature_enabled(p_flag) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.resolve_deployment_subject(p_actor,p_org);
 IF i.tenant_id IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;
 IF p_admin AND i.authority<>'admin' THEN RAISE EXCEPTION 'Protected admin required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT i.tenant_id,i.agent_id,i.authority,i.team_agent_ids;
END $$;

-- 4. Deterministic match. Returns the single intake and its key, or the reason.
CREATE FUNCTION public.member_match(p_tenant uuid,p_carrier text,p_confirmation text,p_member_id text,p_mbi_key text,p_effective date)
RETURNS TABLE(intake_id uuid,matched_by text,reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[]; conf text:=public.gold_confirmation(p_confirmation);
BEGIN
 IF conf IS NOT NULL THEN
  SELECT array_agg(DISTINCT g.id) INTO ids FROM public.gold_enrollments(p_tenant) g WHERE g.confirmation=conf OR g.sunfire=conf;
  IF cardinality(ids)=1 THEN RETURN QUERY SELECT ids[1],'confirmation'::text,NULL::text; RETURN; END IF;
  IF cardinality(ids)>1 THEN RETURN QUERY SELECT NULL::uuid,NULL::text,'ambiguous'::text; RETURN; END IF;
 END IF;
 IF nullif(btrim(p_member_id),'') IS NOT NULL THEN
  SELECT array_agg(m.enrollment_intake_id) INTO ids FROM public.member_carrier_ids m
   WHERE m.tenant_id=p_tenant AND m.carrier=p_carrier AND m.carrier_member_id=btrim(p_member_id);
  IF cardinality(ids)=1 THEN RETURN QUERY SELECT ids[1],'carrier_member_id'::text,NULL::text; RETURN; END IF;
 END IF;
 IF p_mbi_key IS NOT NULL AND p_effective IS NOT NULL THEN
  SELECT array_agg(DISTINCT g.id) INTO ids FROM public.gold_enrollments(p_tenant) g
   WHERE g.mbi_match_key=p_mbi_key AND g.effective_date=p_effective AND upper(g.carrier)=upper(btrim(p_carrier));
  IF cardinality(ids)=1 THEN RETURN QUERY SELECT ids[1],'mbi_key'::text,NULL::text; RETURN; END IF;
  IF cardinality(ids)>1 THEN RETURN QUERY SELECT NULL::uuid,NULL::text,'ambiguous'::text; RETURN; END IF;
 END IF;
 RETURN QUERY SELECT NULL::uuid,NULL::text,'no_match'::text;
END $$;

-- Opens the activation task for a matched effectuation, once per enrollment.
CREATE FUNCTION public.activation_open_task(p_actor text,p_tenant uuid,p_intake uuid,p_event uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g record; ev public.member_status_events; task uuid; days integer; pos integer:=0; k text;
BEGIN
 IF NOT public.deployment_feature_enabled('BENEFIT_ACTIVATION_ENABLED') THEN RETURN NULL; END IF;
 SELECT * INTO ev FROM public.member_status_events WHERE id=p_event AND tenant_id=p_tenant AND event_type='effectuated';
 IF ev.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.gold_enrollments(p_tenant) x WHERE x.id=p_intake;
 IF g.id IS NULL OR g.coverage IS NULL OR g.coverage NOT IN ('MA','MAPD','PDP','MS') THEN RETURN NULL; END IF;
 SELECT due_days INTO days FROM public.activation_settings WHERE tenant_id=p_tenant;
 INSERT INTO public.activation_tasks(tenant_id,enrollment_intake_id,contact_id,member_status_event_id,product_line,carrier,assigned_agent_id,assigned_role,due_date)
 VALUES(p_tenant,p_intake,g.contact_id,ev.id,g.coverage,coalesce(g.carrier,ev.carrier),g.agent_id,CASE WHEN g.agent_id IS NULL THEN 'service' ELSE 'agent' END,
  coalesce(g.effective_date,ev.event_effective_date)+coalesce(days,30))
 ON CONFLICT (enrollment_intake_id) DO NOTHING RETURNING id INTO task;
 IF task IS NULL THEN RETURN NULL; END IF;
 FOREACH k IN ARRAY ARRAY['member_card','pcp','pharmacy','member_reachable'] LOOP
  CONTINUE WHEN k='pcp' AND NOT (g.coverage IN ('MA','MAPD') AND upper(btrim(coalesce(g.plan_type,''))) IN ('HMO','HMO-POS'));
  CONTINUE WHEN k='pharmacy' AND g.coverage NOT IN ('MAPD','PDP');
  pos:=pos+1;
  INSERT INTO public.activation_task_items(tenant_id,task_id,kind,position,created_by) VALUES(p_tenant,task,k,pos,p_actor);
 END LOOP;
 PERFORM public.gold_audit(p_actor,p_tenant,'activation_task','activation_task',task,jsonb_build_object('op','opened','items',pos));
 RETURN task;
END $$;

-- Applies one matched member status row.
CREATE FUNCTION public.member_status_apply(p_actor text,p_tenant uuid,p_file uuid,p_carrier text,p_row jsonb,p_intake uuid,p_by text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g record; ev uuid; member text:=nullif(btrim(p_row->>'carrier_member_id'),'');
BEGIN
 SELECT * INTO g FROM public.gold_enrollments(p_tenant) x WHERE x.id=p_intake;
 IF g.id IS NULL THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.member_status_events(tenant_id,enrollment_intake_id,carrier,product_line,event_type,event_effective_date,disenroll_reason_code,source_file_id,source_row_number,matched_by)
 VALUES(p_tenant,p_intake,p_carrier,g.coverage,p_row->>'event_type',(p_row->>'event_effective_date')::date,nullif(left(btrim(p_row->>'disenroll_reason_code'),40),''),p_file,(p_row->>'row_number')::integer,p_by)
 RETURNING id INTO ev;
 -- Learned only from a match by confirmation or MBI key (owner decision 3).
 IF member IS NOT NULL AND p_by IN ('confirmation','mbi_key') THEN
  INSERT INTO public.member_carrier_ids(tenant_id,enrollment_intake_id,carrier,carrier_member_id,first_seen_file_id)
  VALUES(p_tenant,p_intake,p_carrier,member,p_file) ON CONFLICT (tenant_id,carrier,carrier_member_id) DO NOTHING;
 END IF;
 IF p_row->>'event_type'='effectuated' THEN PERFORM public.activation_open_task(p_actor,p_tenant,p_intake,ev); END IF;
 RETURN ev;
END $$;

-- Links one CTM to its enrollment and flags the contact through the existing
-- complaint path when the CTM is open.
CREATE FUNCTION public.ctm_link(p_actor text,p_org text,p_tenant uuid,p_ctm uuid,p_intake uuid,p_by text,p_file uuid,p_member text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g record; c public.ctm_records;
BEGIN
 SELECT * INTO g FROM public.gold_enrollments(p_tenant) x WHERE x.id=p_intake;
 IF g.id IS NULL THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='22023'; END IF;
 UPDATE public.ctm_records SET enrollment_intake_id=p_intake,contact_id=g.contact_id,matched_by=p_by
  WHERE id=p_ctm AND tenant_id=p_tenant AND enrollment_intake_id IS NULL RETURNING * INTO c;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint already linked' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(p_member),'') IS NOT NULL AND p_by IN ('confirmation','mbi_key') THEN
  INSERT INTO public.member_carrier_ids(tenant_id,enrollment_intake_id,carrier,carrier_member_id,first_seen_file_id)
  VALUES(p_tenant,p_intake,c.carrier,btrim(p_member),p_file) ON CONFLICT (tenant_id,carrier,carrier_member_id) DO NOTHING;
 END IF;
 IF c.status='open' AND NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=g.contact_id AND tenant_id=p_tenant AND complaint_open) THEN
  PERFORM public.retention_flag_complaint(p_actor,p_org,g.contact_id,'CMS complaint (CTM) recorded');
 END IF;
END $$;

-- 3 and 2.2. One file of already mapped rows. The raw MBI in a row is used
-- only to compute its key here and is never written anywhere.
CREATE FUNCTION public.member_status_import(p_actor text,p_org text,p_kind text,p_carrier text,p_file_hash text,p_as_of date,p_rows jsonb,p_dropped text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; file public.member_status_import_files; r jsonb; m record; v_carrier text:=btrim(p_carrier);
  matched integer:=0; queued integer:=0; rejected jsonb:='[]'; keys jsonb:='{"confirmation":0,"carrier_member_id":0,"mbi_key":0}';
  n integer; key text; eff date; ev_date date; ctm public.ctm_records; problem text; cat text; st text; existing uuid;
BEGIN
 IF p_kind NOT IN ('member_status','ctm') THEN RAISE EXCEPTION 'Unknown import kind' USING ERRCODE='22023'; END IF;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE p_kind WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 IF v_carrier IS NULL OR length(v_carrier) NOT BETWEEN 1 AND 100 OR p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$' OR p_as_of IS NULL
  OR p_as_of>current_date+1 OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>3000
  OR cardinality(coalesce(p_dropped,'{}'))>100 OR EXISTS(SELECT 1 FROM unnest(coalesce(p_dropped,'{}')) d WHERE d IS NULL OR length(d)>200) THEN
  RAISE EXCEPTION 'Invalid import' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gold-import:'||who.tenant_id::text||':'||p_kind||':'||p_file_hash,0));
 SELECT * INTO file FROM public.member_status_import_files WHERE tenant_id=who.tenant_id AND kind=p_kind AND file_sha256=p_file_hash;
 IF file.id IS NOT NULL THEN
  RETURN jsonb_build_object('duplicate',true,'file_id',file.id,'rows',file.row_count,'matched',file.matched_count,'queued',file.queued_count,'rejected',file.rejected_count);
 END IF;
 n:=jsonb_array_length(p_rows);
 INSERT INTO public.member_status_import_files(tenant_id,kind,carrier,file_sha256,file_as_of,row_count,dropped_columns,uploaded_by)
 VALUES(who.tenant_id,p_kind,v_carrier,p_file_hash,p_as_of,n,coalesce(p_dropped,'{}'),p_actor) RETURNING * INTO file;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  problem:=NULL;
  IF jsonb_typeof(r)<>'object' OR coalesce(r->>'row_number','') !~ '^[1-9][0-9]{0,6}$' THEN problem:='row_number';
  ELSIF r ? 'narrative' OR r ? 'complaint_text' THEN problem:='narrative';
  ELSIF nullif(r->>'effective_date','') IS NOT NULL AND public.gold_date(r->>'effective_date') IS NULL THEN problem:='effective_date';
  ELSIF p_kind='member_status' AND coalesce(r->>'event_type','') NOT IN ('effectuated','disenrolled','reinstated','terminated_by_carrier') THEN problem:='event_type';
  ELSIF p_kind='member_status' AND public.gold_date(r->>'event_effective_date') IS NULL THEN problem:='event_effective_date';
  ELSIF p_kind='ctm' AND coalesce(r->>'cms_complaint_id','') !~ '^[A-Za-z0-9_-]{1,64}$' THEN problem:='cms_complaint_id';
  ELSIF p_kind='ctm' AND public.gold_date(r->>'received_date') IS NULL THEN problem:='received_date';
  ELSIF nullif(r->>'carrier_member_id','') IS NOT NULL AND length(btrim(r->>'carrier_member_id')) NOT BETWEEN 1 AND 64 THEN problem:='carrier_member_id';
  ELSIF p_kind='ctm' AND nullif(r->>'resolution_code','') IS NOT NULL AND r->>'resolution_code' !~ '^[A-Za-z0-9_-]{1,40}$' THEN problem:='resolution_code';
  END IF;
  IF problem IS NOT NULL THEN
   rejected:=rejected||jsonb_build_array(jsonb_build_object('row',CASE WHEN coalesce(r->>'row_number','') ~ '^[1-9][0-9]{0,6}$' THEN (r->>'row_number')::integer END,'field',problem));
   CONTINUE;
  END IF;
  ev_date:=public.gold_date(r->>'event_effective_date');
  eff:=coalesce(public.gold_date(r->>'effective_date'),CASE WHEN r->>'event_type'='effectuated' THEN ev_date END);
  key:=public.member_mbi_key(r->>'mbi');
  SELECT * INTO m FROM public.member_match(who.tenant_id,v_carrier,r->>'confirmation',r->>'carrier_member_id',key,eff);
  IF p_kind='member_status' THEN
   IF m.intake_id IS NOT NULL THEN
    PERFORM public.member_status_apply(p_actor,who.tenant_id,file.id,v_carrier,r,m.intake_id,m.matched_by);
   END IF;
  ELSE
   cat:=coalesce(nullif(r->>'category',''),'other');
   IF cat NOT IN ('enrollment_disenrollment','marketing','benefits_access','pricing_premium','pharmacy','provider_network','customer_service','plan_administration') THEN cat:='other'; END IF;
   st:=CASE WHEN r->>'status'='resolved' THEN 'resolved' WHEN r->>'status'='open' THEN 'open' END;
   SELECT * INTO ctm FROM public.ctm_records x WHERE x.tenant_id=who.tenant_id AND x.carrier=v_carrier AND x.cms_complaint_id=r->>'cms_complaint_id' FOR UPDATE;
   IF ctm.id IS NOT NULL THEN
    -- A later file can only report the carrier's status; resolution stays protected.
    UPDATE public.ctm_records SET carrier_reported_status=coalesce(st,carrier_reported_status),
     resolution_code=CASE WHEN st='resolved' THEN coalesce(nullif(r->>'resolution_code',''),resolution_code) ELSE resolution_code END
     WHERE id=ctm.id;
    matched:=matched+CASE WHEN ctm.enrollment_intake_id IS NOT NULL THEN 1 ELSE 0 END;
    CONTINUE;
   END IF;
   INSERT INTO public.ctm_records(tenant_id,carrier,cms_complaint_id,received_date,category,carrier_reported_status,resolution_code,source_file_id)
   VALUES(who.tenant_id,v_carrier,r->>'cms_complaint_id',public.gold_date(r->>'received_date'),cat,st,
    CASE WHEN st='resolved' THEN nullif(r->>'resolution_code','') END,file.id) RETURNING * INTO ctm;
   IF m.intake_id IS NOT NULL THEN
    PERFORM public.ctm_link(p_actor,p_org,who.tenant_id,ctm.id,m.intake_id,m.matched_by,file.id,r->>'carrier_member_id');
   END IF;
  END IF;
  IF m.intake_id IS NOT NULL THEN
   matched:=matched+1; keys:=jsonb_set(keys,ARRAY[m.matched_by],to_jsonb((keys->>m.matched_by)::integer+1));
  ELSE
   queued:=queued+1;
   INSERT INTO public.member_unmatched_rows(tenant_id,kind,source_file_id,source_row_number,carrier,confirmation,carrier_member_id,mbi_match_key,effective_date,facts,ctm_id,reason)
   VALUES(who.tenant_id,p_kind,file.id,(r->>'row_number')::integer,v_carrier,public.gold_confirmation(r->>'confirmation'),nullif(btrim(r->>'carrier_member_id'),''),key,eff,
    CASE WHEN p_kind='member_status' THEN jsonb_strip_nulls(jsonb_build_object('event_type',r->>'event_type','event_effective_date',ev_date,'disenroll_reason_code',nullif(left(btrim(r->>'disenroll_reason_code'),40),'')))
     ELSE jsonb_build_object('cms_complaint_id',r->>'cms_complaint_id') END,
    CASE WHEN p_kind='ctm' THEN ctm.id END,m.reason);
  END IF;
 END LOOP;
 UPDATE public.member_status_import_files SET matched_count=matched,queued_count=queued,rejected_count=jsonb_array_length(rejected) WHERE id=file.id;
 PERFORM public.gold_audit(p_actor,who.tenant_id,'gold_standards_import',p_kind,file.id,
  jsonb_build_object('op','import','carrier',v_carrier,'rows',n,'matched',matched,'by_key',keys,'queued',queued,'rejected',jsonb_array_length(rejected),'dropped_columns',to_jsonb(coalesce(p_dropped,'{}'))));
 RETURN jsonb_build_object('duplicate',false,'file_id',file.id,'rows',n,'matched',matched,'by_key',keys,'queued',queued,'rejected',jsonb_array_length(rejected),'rejected_rows',rejected,'dropped_columns',to_jsonb(coalesce(p_dropped,'{}')));
END $$;

-- The admin's unmatched queue. Identifiers the carrier sent are shown to the
-- admin to find the enrollment; the MBI is never shown, only whether a key exists.
CREATE FUNCTION public.read_member_unmatched(p_actor text,p_org text,p_kind text,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record;
BEGIN
 IF p_kind NOT IN ('member_status','ctm') OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE p_kind WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'file_id',u.source_file_id,'row',u.source_row_number,'carrier',u.carrier,
   'confirmation',u.confirmation,'carrier_member_id',u.carrier_member_id,'has_mbi_key',u.mbi_match_key IS NOT NULL,'effective_date',u.effective_date,
   'facts',u.facts,'reason',u.reason,'created_at',u.created_at) ORDER BY u.created_at,u.source_row_number)
  FROM (SELECT * FROM public.member_unmatched_rows x WHERE x.tenant_id=who.tenant_id AND x.kind=p_kind AND x.status='open' ORDER BY x.created_at,x.source_row_number LIMIT p_limit) u),'[]'),
  'open',(SELECT count(*) FROM public.member_unmatched_rows x WHERE x.tenant_id=who.tenant_id AND x.kind=p_kind AND x.status='open'));
END $$;

-- Manual link by an admin, audited.
CREATE FUNCTION public.member_link_unmatched(p_actor text,p_org text,p_row uuid,p_intake uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; u public.member_unmatched_rows; ev uuid; k text;
BEGIN
 SELECT kind INTO k FROM public.member_unmatched_rows WHERE id=p_row;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE k WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 SELECT * INTO u FROM public.member_unmatched_rows WHERE id=p_row AND tenant_id=who.tenant_id AND status='open' FOR UPDATE;
 IF u.id IS NULL THEN RAISE EXCEPTION 'Row unavailable' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gold_enrollments(who.tenant_id) g WHERE g.id=p_intake) THEN RAISE EXCEPTION 'Enrollment unavailable' USING ERRCODE='22023'; END IF;
 IF u.kind='member_status' THEN
  ev:=public.member_status_apply(p_actor,who.tenant_id,u.source_file_id,u.carrier,
   u.facts||jsonb_build_object('row_number',u.source_row_number,'carrier_member_id',u.carrier_member_id),p_intake,'manual');
 ELSE
  PERFORM public.ctm_link(p_actor,p_org,who.tenant_id,u.ctm_id,p_intake,'manual',u.source_file_id,u.carrier_member_id);
 END IF;
 UPDATE public.member_unmatched_rows SET status='linked',linked_intake_id=p_intake,resolved_by=p_actor,resolved_at=clock_timestamp() WHERE id=u.id;
 PERFORM public.gold_audit(p_actor,who.tenant_id,'gold_standards_link',u.kind,u.id,jsonb_build_object('op','manual_link','enrollment_intake_id',p_intake,'reason',left(btrim(p_reason),500)));
 RETURN jsonb_build_object('id',u.id,'status','linked','event_id',ev);
END $$;

CREATE FUNCTION public.member_dismiss_unmatched(p_actor text,p_org text,p_row uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; k text; done uuid;
BEGIN
 SELECT kind INTO k FROM public.member_unmatched_rows WHERE id=p_row;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE k WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 UPDATE public.member_unmatched_rows SET status='dismissed',resolved_by=p_actor,resolved_at=clock_timestamp()
  WHERE id=p_row AND tenant_id=who.tenant_id AND status='open' RETURNING id INTO done;
 IF done IS NULL THEN RAISE EXCEPTION 'Row unavailable' USING ERRCODE='22023'; END IF;
 PERFORM public.gold_audit(p_actor,who.tenant_id,'gold_standards_link',k,done,jsonb_build_object('op','dismiss','reason',left(btrim(p_reason),500)));
 RETURN jsonb_build_object('id',done,'status','dismissed');
END $$;

-- 2.3. The only CTM resolution. When no other open CTM remains on the
-- contact, the existing protected complaint resolution clears the hold.
CREATE FUNCTION public.resolve_ctm(p_actor text,p_org text,p_ctm uuid,p_code text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; c public.ctm_records; cleared boolean:=false;
BEGIN
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,'CTM_IMPORT_ENABLED',true);
 IF p_code IS NULL OR p_code !~ '^[A-Za-z0-9_-]{1,40}$' OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'Resolution code and reason required' USING ERRCODE='22023'; END IF;
 UPDATE public.ctm_records SET status='resolved',resolution_code=p_code,resolved_at=clock_timestamp(),resolved_by=p_actor
  WHERE id=p_ctm AND tenant_id=who.tenant_id AND status='open' RETURNING * INTO c;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint unavailable' USING ERRCODE='22023'; END IF;
 IF c.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ctm_records x WHERE x.tenant_id=who.tenant_id AND x.contact_id=c.contact_id AND x.status='open')
  AND EXISTS(SELECT 1 FROM public.contacts WHERE id=c.contact_id AND tenant_id=who.tenant_id AND complaint_open) THEN
  PERFORM public.retention_resolve_complaint(p_actor,p_org,c.contact_id,p_reason); cleared:=true;
 END IF;
 PERFORM public.gold_audit(p_actor,who.tenant_id,'ctm_resolve','ctm_record',c.id,jsonb_build_object('op','resolve','resolution_code',p_code,'complaint_cleared',cleared));
 RETURN jsonb_build_object('id',c.id,'status','resolved','complaint_cleared',cleared);
END $$;

CREATE FUNCTION public.read_ctm_records(p_actor text,p_org text,p_status text DEFAULT 'open',p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record;
BEGIN
 IF p_status NOT IN ('open','resolved') OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,'CTM_IMPORT_ENABLED',true);
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'carrier',c.carrier,'cms_complaint_id',c.cms_complaint_id,
   'received_date',c.received_date,'category',c.category,'status',c.status,'carrier_reported_status',c.carrier_reported_status,
   'resolution_code',c.resolution_code,'resolved_at',c.resolved_at,'linked',c.enrollment_intake_id IS NOT NULL,'contact_id',c.contact_id,'matched_by',c.matched_by)
   ORDER BY c.received_date,c.id)
  FROM (SELECT * FROM public.ctm_records x WHERE x.tenant_id=who.tenant_id AND x.status=p_status ORDER BY x.received_date,x.id LIMIT p_limit) c),'[]'));
END $$;

-- Column mapping configuration, admin only and audited.
CREATE FUNCTION public.save_member_column_map(p_actor text,p_org text,p_kind text,p_carrier text,p_mapping jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; saved public.member_status_column_maps;
BEGIN
 IF p_kind NOT IN ('member_status','ctm') THEN RAISE EXCEPTION 'Unknown import kind' USING ERRCODE='22023'; END IF;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE p_kind WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 IF jsonb_typeof(p_mapping)<>'object' OR jsonb_typeof(p_mapping->'columns')<>'object' OR length(p_mapping::text)>20000 THEN RAISE EXCEPTION 'Invalid mapping' USING ERRCODE='22023'; END IF;
 INSERT INTO public.member_status_column_maps(tenant_id,kind,carrier,mapping,updated_by) VALUES(who.tenant_id,p_kind,btrim(p_carrier),p_mapping,p_actor)
 ON CONFLICT (tenant_id,kind,carrier) DO UPDATE SET mapping=excluded.mapping,updated_by=excluded.updated_by,updated_at=clock_timestamp() RETURNING * INTO saved;
 PERFORM public.gold_audit(p_actor,who.tenant_id,'gold_standards_mapping',p_kind,saved.id,jsonb_build_object('op','save_mapping','carrier',saved.carrier,'fields',(SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(p_mapping->'columns') k)));
 RETURN jsonb_build_object('id',saved.id,'kind',saved.kind,'carrier',saved.carrier,'mapping',saved.mapping,'updated_at',saved.updated_at);
END $$;

CREATE FUNCTION public.read_member_column_maps(p_actor text,p_org text,p_kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record;
BEGIN
 IF p_kind NOT IN ('member_status','ctm') THEN RAISE EXCEPTION 'Unknown import kind' USING ERRCODE='22023'; END IF;
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,CASE p_kind WHEN 'ctm' THEN 'CTM_IMPORT_ENABLED' ELSE 'MEMBER_STATUS_IMPORT_ENABLED' END,true);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'carrier',m.carrier,'mapping',m.mapping,'updated_at',m.updated_at) ORDER BY m.carrier)
  FROM public.member_status_column_maps m WHERE m.tenant_id=who.tenant_id AND m.kind=p_kind),'[]');
END $$;

-- 5.4. Tasks in scope: own for an agent, team for a manager, agency for an admin.
CREATE FUNCTION public.read_activation_tasks(p_actor text,p_org text,p_filters jsonb DEFAULT '{}',p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; f jsonb:=coalesce(p_filters,'{}'); today date:=current_date;
BEGIN
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,'BENEFIT_ACTIVATION_ENABLED',false);
 IF jsonb_typeof(f)<>'object' OR p_limit NOT BETWEEN 1 AND 200 OR p_offset NOT BETWEEN 0 AND 100000
  OR (f ? 'status' AND f->>'status' NOT IN ('open','completed','unreachable','cancelled'))
  OR (f ? 'assignee' AND f->>'assignee' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  OR (f ? 'overdue' AND jsonb_typeof(f->'overdue')<>'boolean') OR length(coalesce(f->>'carrier',''))>100 THEN
  RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023'; END IF;
 RETURN (WITH scoped AS (
   SELECT t.* FROM public.activation_tasks t WHERE t.tenant_id=who.tenant_id
    AND (who.authority='admin' OR who.authority='agent' AND t.assigned_agent_id=who.agent_id OR who.authority='manager' AND t.assigned_agent_id=ANY(who.team_agent_ids))
  ), filtered AS (
   SELECT t.* FROM scoped t WHERE (NOT f ? 'status' OR t.status=f->>'status')
    AND (NOT f ? 'assignee' OR t.assigned_agent_id=(f->>'assignee')::uuid)
    AND (NOT f ? 'carrier' OR t.carrier=f->>'carrier')
    AND (NOT f ? 'overdue' OR ((t.status='open' AND t.due_date<today)=(f->>'overdue')::boolean))
  ), page AS (SELECT * FROM filtered ORDER BY due_date,created_at,id LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'contact_id',p.contact_id,
    'enrollment_intake_id',p.enrollment_intake_id,'product_line',p.product_line,'carrier',p.carrier,'assigned_agent_id',p.assigned_agent_id,
    'assigned_role',p.assigned_role,'assignee',(SELECT a.name FROM public.enrolled_agents e JOIN public.tenant_agents a ON a.tenant_id=e.tenant_id AND a.clerk_user_id=e.clerk_user_id WHERE e.id=p.assigned_agent_id LIMIT 1),
    'due_date',p.due_date,'status',p.status,'overdue',p.status='open' AND p.due_date<today,'completed_at',p.completed_at,'created_at',p.created_at,
    'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'benefit',i.benefit_label,'outcome',r.outcome,'note',r.note,'recorded_at',r.recorded_at) ORDER BY i.position),'[]')
      FROM public.activation_task_items i LEFT JOIN LATERAL (SELECT x.outcome,x.note,x.recorded_at FROM public.activation_item_records x WHERE x.item_id=i.id ORDER BY x.seq DESC LIMIT 1) r ON true WHERE i.task_id=p.id))
    ORDER BY p.due_date,p.created_at,p.id) FROM page p),'[]'),
   'summary',CASE WHEN who.authority IN ('admin','manager') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('assigned_agent_id',s.assigned_agent_id,'tasks',s.tasks,'completed',s.completed,
     'closed',s.closed,'overdue',s.overdue,'completion_rate',CASE WHEN s.closed>0 THEN round(s.completed::numeric/s.closed,4) END) ORDER BY s.assigned_agent_id NULLS LAST)
    FROM (SELECT assigned_agent_id,count(*) tasks,count(*) FILTER (WHERE status='completed') completed,count(*) FILTER (WHERE status<>'open') closed,
     count(*) FILTER (WHERE status='open' AND due_date<today) overdue FROM scoped GROUP BY assigned_agent_id) s),'[]') END));
END $$;

-- The task the actor may change, locked.
CREATE FUNCTION public.activation_task_for(p_actor text,p_org text,p_task uuid)
RETURNS public.activation_tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record; t public.activation_tasks;
BEGIN
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,'BENEFIT_ACTIVATION_ENABLED',false);
 SELECT * INTO t FROM public.activation_tasks x WHERE x.id=p_task AND x.tenant_id=who.tenant_id
  AND (who.authority='admin' OR who.authority='agent' AND x.assigned_agent_id=who.agent_id OR who.authority='manager' AND x.assigned_agent_id=ANY(who.team_agent_ids)) FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Task unavailable' USING ERRCODE='42501'; END IF;
 IF t.status<>'open' THEN RAISE EXCEPTION 'Task closed' USING ERRCODE='22023'; END IF;
 RETURN t;
END $$;

CREATE FUNCTION public.activation_record_item(p_actor text,p_org text,p_item uuid,p_outcome text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.activation_task_items; t public.activation_tasks; rec uuid; note text:=nullif(btrim(p_note),'');
BEGIN
 SELECT * INTO i FROM public.activation_task_items WHERE id=p_item;
 t:=public.activation_task_for(p_actor,p_org,i.task_id);
 IF p_outcome NOT IN ('done','not_applicable','member_declined','unreachable') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 IF NOT public.gold_note_ok(note) THEN RAISE EXCEPTION 'Notes are short and carry no identifiers' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activation_item_records(tenant_id,item_id,outcome,note,recorded_by) VALUES(t.tenant_id,i.id,p_outcome,note,p_actor) RETURNING id INTO rec;
 PERFORM public.gold_audit(p_actor,t.tenant_id,'activation_task','activation_task_item',i.id,jsonb_build_object('op','item_recorded','kind',i.kind,'outcome',p_outcome));
 RETURN jsonb_build_object('item_id',i.id,'record_id',rec,'outcome',p_outcome);
END $$;

-- 5.3. A supplemental benefit item exists only because the agent recorded it.
CREATE FUNCTION public.activation_add_benefit(p_actor text,p_org text,p_task uuid,p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.activation_tasks; item uuid; label text:=btrim(p_label);
BEGIN
 t:=public.activation_task_for(p_actor,p_org,p_task);
 IF label IS NULL OR length(label) NOT BETWEEN 1 AND 60 OR NOT public.gold_note_ok(label) THEN RAISE EXCEPTION 'Invalid benefit' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activation_task_items(tenant_id,task_id,kind,benefit_label,position,created_by)
 VALUES(t.tenant_id,t.id,'supplemental_benefit',label,(SELECT coalesce(max(position),0)+1 FROM public.activation_task_items WHERE task_id=t.id),p_actor)
 ON CONFLICT DO NOTHING RETURNING id INTO item;
 IF item IS NULL THEN RAISE EXCEPTION 'Benefit already recorded' USING ERRCODE='22023'; END IF;
 PERFORM public.gold_audit(p_actor,t.tenant_id,'activation_task','activation_task_item',item,jsonb_build_object('op','benefit_added'));
 RETURN jsonb_build_object('item_id',item);
END $$;

-- Completion needs an outcome on every item. Unreachable and cancelled close as is.
CREATE FUNCTION public.activation_close_task(p_actor text,p_org text,p_task uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.activation_tasks;
BEGIN
 t:=public.activation_task_for(p_actor,p_org,p_task);
 IF p_status NOT IN ('completed','unreachable','cancelled') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF p_status='completed' AND EXISTS(SELECT 1 FROM public.activation_task_items i WHERE i.task_id=t.id AND NOT EXISTS(SELECT 1 FROM public.activation_item_records r WHERE r.item_id=i.id)) THEN
  RAISE EXCEPTION 'Record every item first' USING ERRCODE='22023'; END IF;
 UPDATE public.activation_tasks SET status=p_status,completed_at=clock_timestamp(),completed_by=p_actor WHERE id=t.id;
 PERFORM public.gold_audit(p_actor,t.tenant_id,'activation_task','activation_task',t.id,jsonb_build_object('op','closed','status',p_status));
 RETURN jsonb_build_object('id',t.id,'status',p_status);
END $$;

CREATE FUNCTION public.activation_set_due_days(p_actor text,p_org text,p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE who record;
BEGIN
 SELECT * INTO who FROM public.gold_subject(p_actor,p_org,'BENEFIT_ACTIVATION_ENABLED',true);
 IF p_days IS NULL OR p_days NOT BETWEEN 7 AND 90 THEN RAISE EXCEPTION 'Due days must be 7 to 90' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activation_settings(tenant_id,due_days,updated_by) VALUES(who.tenant_id,p_days,p_actor)
 ON CONFLICT (tenant_id) DO UPDATE SET due_days=excluded.due_days,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 PERFORM public.gold_audit(p_actor,who.tenant_id,'activation_settings','tenant',who.tenant_id,jsonb_build_object('op','due_days','due_days',p_days));
 RETURN jsonb_build_object('due_days',p_days);
END $$;

-- 7. Lifecycle events and the retention purge marker.
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.consumer_lifecycle_rows(uuid,uuid)'::regprocedure) INTO d;
 IF strpos(d,'WITH reshop_events AS (')=0 OR strpos(d,'SELECT * FROM reshop_events UNION ALL')=0 THEN RAISE EXCEPTION 'consumer_lifecycle_rows anchor missing'; END IF;
 d:=replace(d,'WITH reshop_events AS (','WITH gold_events AS ('
  ||'SELECT ''member_status_events:''||m.id::text||'':''||(''member_''||m.event_type) key,(''member_''||m.event_type)::text type,m.received_at "time",NULL::text staff,m.event_type::text status,'
  ||'CASE m.event_type WHEN ''effectuated'' THEN ''Member effectuated'' WHEN ''disenrolled'' THEN ''Member disenrolled'' WHEN ''reinstated'' THEN ''Member reinstated'' ELSE ''Member terminated by carrier'' END::text summary,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''member_status_events'',''id'',m.id,''time'',m.received_at)) evidence,'
  ||'jsonb_build_object(''carrier'',m.carrier,''effectiveDate'',m.event_effective_date,''reasonCode'',m.disenroll_reason_code,''matchedBy'',m.matched_by,''enrollmentId'',m.enrollment_intake_id) details '
  ||'FROM public.member_status_events m JOIN public.enrollment_intakes e ON e.id=m.enrollment_intake_id AND e.tenant_id=m.tenant_id '
  ||'WHERE e.contact_id=p_contact AND m.tenant_id=p_tenant AND public.deployment_feature_enabled(''MEMBER_STATUS_IMPORT_ENABLED'') '
  ||'UNION ALL SELECT ''ctm_records:''||c.id::text||'':complaint_recorded'',''complaint_recorded''::text,c.created_at,NULL::text,c.status::text,''CMS complaint recorded''::text,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''ctm_records'',''id'',c.id,''time'',c.created_at)),jsonb_build_object(''carrier'',c.carrier,''category'',c.category,''receivedDate'',c.received_date) '
  ||'FROM public.ctm_records c WHERE c.contact_id=p_contact AND c.tenant_id=p_tenant AND public.deployment_feature_enabled(''CTM_IMPORT_ENABLED'') '
  ||'UNION ALL SELECT ''ctm_records:''||c.id::text||'':complaint_resolved'',''complaint_resolved''::text,c.resolved_at,c.resolved_by,''resolved''::text,''CMS complaint resolved''::text,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''ctm_records'',''id'',c.id,''time'',c.resolved_at)),jsonb_build_object(''carrier'',c.carrier,''resolutionCode'',c.resolution_code) '
  ||'FROM public.ctm_records c WHERE c.contact_id=p_contact AND c.tenant_id=p_tenant AND c.status=''resolved'' AND public.deployment_feature_enabled(''CTM_IMPORT_ENABLED'') '
  ||'UNION ALL SELECT ''activation_tasks:''||t.id::text||'':activation_task_opened'',''activation_task_opened''::text,t.created_at,NULL::text,''open''::text,''Benefit activation task opened''::text,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''activation_tasks'',''id'',t.id,''time'',t.created_at)),jsonb_build_object(''dueDate'',t.due_date,''productLine'',t.product_line) '
  ||'FROM public.activation_tasks t WHERE t.contact_id=p_contact AND t.tenant_id=p_tenant AND public.deployment_feature_enabled(''BENEFIT_ACTIVATION_ENABLED'') '
  ||'UNION ALL SELECT ''activation_item_records:''||r.id::text||'':activation_item_recorded'',''activation_item_recorded''::text,r.recorded_at,r.recorded_by,r.outcome::text,''Benefit activation item recorded''::text,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''activation_item_records'',''id'',r.id,''time'',r.recorded_at)),jsonb_build_object(''item'',i.kind,''outcome'',r.outcome) '
  ||'FROM public.activation_item_records r JOIN public.activation_task_items i ON i.id=r.item_id JOIN public.activation_tasks t ON t.id=i.task_id '
  ||'WHERE t.contact_id=p_contact AND t.tenant_id=p_tenant AND r.tenant_id=p_tenant AND public.deployment_feature_enabled(''BENEFIT_ACTIVATION_ENABLED'') '
  ||'UNION ALL SELECT ''activation_tasks:''||t.id::text||'':activation_task_closed'',''activation_task_closed''::text,t.completed_at,t.completed_by,t.status::text,''Benefit activation task closed''::text,'
  ||'jsonb_build_array(jsonb_build_object(''table'',''activation_tasks'',''id'',t.id,''time'',t.completed_at)),jsonb_build_object(''status'',t.status) '
  ||'FROM public.activation_tasks t WHERE t.contact_id=p_contact AND t.tenant_id=p_tenant AND t.status<>''open'' AND public.deployment_feature_enabled(''BENEFIT_ACTIVATION_ENABLED'')'
  ||'), reshop_events AS (');
 d:=replace(d,'SELECT * FROM reshop_events UNION ALL','SELECT * FROM gold_events UNION ALL SELECT * FROM reshop_events UNION ALL');
 EXECUTE d;
END $$;

-- Operator provisioning records every FEATURE_NAMES switch. Accept the five
-- default-off Gold Standards switches, as 170 and 171 did for theirs.
DO $$ DECLARE d text; extended text; BEGIN
 SELECT pg_get_functiondef('public.configure_operational_profile(jsonb)'::regprocedure) INTO d;
 extended:=replace(d,'''feature_conference_calling_enabled''','''feature_gold_standards_metrics_enabled'',''feature_member_status_import_enabled'',''feature_ctm_import_enabled'',''feature_benefit_activation_enabled'',''feature_source_attestations_enabled'',''feature_conference_calling_enabled''');
 IF extended=d THEN RAISE EXCEPTION 'Cannot extend operational profile switches'; END IF;
 EXECUTE extended;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['member_match_secrets','member_status_column_maps','member_status_import_files','member_carrier_ids','member_status_events',
   'ctm_records','member_unmatched_rows','activation_settings','activation_tasks','activation_task_items','activation_item_records'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
-- Read access for the retention planner; deletion only through the retention job.
GRANT SELECT ON public.member_status_import_files,public.member_carrier_ids,public.member_status_events,public.ctm_records,
  public.member_unmatched_rows,public.activation_tasks,public.activation_task_items,public.activation_item_records,
  public.member_status_column_maps,public.activation_settings TO service_role;
GRANT DELETE ON public.member_status_import_files,public.member_carrier_ids,public.member_status_events,public.ctm_records,
  public.member_unmatched_rows,public.activation_tasks,public.activation_task_items,public.activation_item_records TO service_role;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
  'member_mbi_pepper','provision_member_mbi_pepper','member_backfill_mbi_keys','member_mbi_normalize','member_mbi_key','gold_date','gold_confirmation','gold_landscape_plan',
  'gold_coverage','gold_enrollments','gold_reject_mutation','gold_note_ok','gold_audit','gold_subject','member_match','activation_open_task',
  'member_status_apply','ctm_link','member_status_import','read_member_unmatched','member_link_unmatched','member_dismiss_unmatched','resolve_ctm',
  'read_ctm_records','save_member_column_map','read_member_column_maps','read_activation_tasks','activation_task_for','activation_record_item',
  'activation_add_benefit','activation_close_task','activation_set_due_days') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.provision_member_mbi_pepper(text),public.member_backfill_mbi_keys(uuid,integer),
  public.member_status_import(text,text,text,text,text,date,jsonb,text[]),public.read_member_unmatched(text,text,text,integer),
  public.member_link_unmatched(text,text,uuid,uuid,text),public.member_dismiss_unmatched(text,text,uuid,text),
  public.resolve_ctm(text,text,uuid,text,text),public.read_ctm_records(text,text,text,integer),
  public.save_member_column_map(text,text,text,text,jsonb),public.read_member_column_maps(text,text,text),
  public.read_activation_tasks(text,text,jsonb,integer,integer),public.activation_record_item(text,text,uuid,text,text),
  public.activation_add_benefit(text,text,uuid,text),public.activation_close_task(text,text,uuid,text),
  public.activation_set_due_days(text,text,integer) TO service_role;
COMMIT;
