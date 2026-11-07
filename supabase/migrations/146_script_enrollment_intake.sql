BEGIN;
-- Historical notes are drafts, never new enrollments or outbound deliveries.
ALTER TABLE public.enrollment_intakes ALTER COLUMN completed_at DROP NOT NULL;
ALTER TABLE public.enrollment_intakes ALTER COLUMN contact_id DROP NOT NULL;
DO $$
DECLARE c record; source jsonb; mapped jsonb; sensitive jsonb; target uuid; legacy jsonb;
BEGIN
 FOR c IN SELECT * FROM public.call_records WHERE upper(product_type)='MA' LOOP
  source:=to_jsonb(c);
  mapped:='{}'; sensitive:='{}';
  SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO mapped FROM jsonb_each(jsonb_build_object(
   'firstName',source->>'customer_first_name','lastName',source->>'customer_last_name',
   'phone',source->>'customer_phone','email',source->>'customer_email',
   'state',coalesce(source->>'customer_state',source->>'state_code'),'zip',source->>'zip_code',
   'newCarrier',source->>'carrier_name','planName',source->>'plan_name','planId',source->>'plan_id',
   'effectiveDate',source->>'effective_date','enrollmentId',coalesce(nullif(source->>'enrollment_confirmation_number',''),nullif(source->>'application_id',''),source->>'enrollment_code'),
   'enrollCode',source->>'enrollment_code','premium',source->>'premium','sunfireCode',source->>'sunfire_code',
   'sixtyDayDate',source->>'sixty_day_date','medicaid',source->>'medicaid','medicaidNum',NULL,
   'prevCarrier',source->>'previous_carrier','sep',source->>'sep','agency',source->>'agency',
   'aor',coalesce(nullif(source->>'writing_agent',''),source->>'agent_name'),'hra',source->>'hra','hraDate',source->>'hra_date',
   'contractId',source#>>'{metadata,contract_id}','segmentId',source#>>'{metadata,segment_id}',
   'planType',coalesce(source#>>'{metadata,plan_type}','MA/MAPD/PDP')
  )) WHERE value<>'null'::jsonb AND value<>'""'::jsonb;
  -- A plan/application value distinguishes step 7 notes from contact-only calls.
  IF NOT (mapped ?| ARRAY['newCarrier','planName','planId','effectiveDate','enrollmentId','sunfireCode']) THEN CONTINUE; END IF;
  sensitive:=jsonb_build_object('dob',encrypt_pii_value(source->>'customer_dob'),
    'mbi',encrypt_pii_value(source->>'customer_mbi'),'medicaidNum',encrypt_pii_value(source->>'medicaid_number'));
  -- Preserve distinct legacy IDs even if a newer native intake has different values.
  legacy:=jsonb_strip_nulls(jsonb_build_object('carrierName',source->>'carrier_name','planName',source->>'plan_name',
    'planId',source->>'plan_id','effectiveDate',source->>'effective_date','applicationId',source->>'application_id',
    'enrollmentCode',source->>'enrollment_code','enrollmentConfirmationNumber',source->>'enrollment_confirmation_number'));
  SELECT id INTO target FROM enrollment_intakes WHERE call_id=c.id AND tenant_id=c.tenant_id
    AND contact_id IS NOT DISTINCT FROM c.contact_id ORDER BY submitted_at,id LIMIT 1;
  IF target IS NULL THEN
   INSERT INTO enrollment_intakes(tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,completed_at)
   VALUES(c.tenant_id,c.id,c.contact_id,mapped||jsonb_build_object('legacyStep7',legacy),sensitive,'',NULL);
  ELSE
   UPDATE enrollment_intakes i SET data=mapped||
     (SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(i.data) WHERE value NOT IN ('null'::jsonb,'""'::jsonb))||jsonb_build_object('legacyStep7',legacy),
    pii_encrypted=jsonb_build_object(
     'dob',CASE WHEN nullif(decrypt_pii_value(i.pii_encrypted->'dob'),'') IS NULL THEN sensitive->'dob' ELSE i.pii_encrypted->'dob' END,
     'mbi',CASE WHEN nullif(decrypt_pii_value(i.pii_encrypted->'mbi'),'') IS NULL THEN sensitive->'mbi' ELSE i.pii_encrypted->'mbi' END,
     'medicaidNum',CASE WHEN nullif(decrypt_pii_value(i.pii_encrypted->'medicaidNum'),'') IS NULL THEN sensitive->'medicaidNum' ELSE i.pii_encrypted->'medicaidNum' END)
    WHERE i.id=target;
  END IF;
 END LOOP;
END; $$;
ALTER TABLE public.enrollment_intakes ADD CONSTRAINT enrollment_intake_completed_contact CHECK(completed_at IS NULL OR contact_id IS NOT NULL);
-- Existing native enrollments predate the new selector.
UPDATE public.enrollment_intakes SET data=data||'{"planType":"MA/MAPD/PDP"}'::jsonb
 WHERE nullif(data->>'planType','') IS NULL;
CREATE OR REPLACE FUNCTION public.save_enrollment_intake(p_id uuid,p_tenant uuid,p_call uuid,p_contact uuid,p_data jsonb,p_carrier text,p_payload jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; task uuid; owner_slug text; previous public.enrollment_intakes; codes text;
BEGIN
 -- Lock the call to serialize intake/disposition changes and household code updates.
 PERFORM 1 FROM call_records WHERE id=p_call AND tenant_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM contacts WHERE id=p_contact AND tenant_id=p_tenant) THEN
  RAISE EXCEPTION 'Invalid intake relationship'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO previous FROM enrollment_intakes WHERE id=p_id AND call_id=p_call AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intake unavailable'; END IF;
 END IF;
 IF nullif(p_data->>'sixtyDayDate','') IS NULL OR nullif(p_data->>'aor','') IS NULL THEN RAISE EXCEPTION 'Incomplete intake'; END IF;
 owner_slug:=lower(replace(p_data->>'aor',' ','_'));
 task:=previous.follow_up_id;
 IF task IS NULL THEN
  INSERT INTO follow_ups(tenant_id,contact_id,agent_id,due_at,reason)
  VALUES(p_tenant,p_contact,owner_slug,((p_data->>'sixtyDayDate')::date+time '09:00') AT TIME ZONE 'America/New_York','Medicare enrollment — 60 day follow-up') RETURNING id INTO task;
 ELSE
  UPDATE follow_ups SET contact_id=p_contact,agent_id=owner_slug,
   due_at=((p_data->>'sixtyDayDate')::date+time '09:00') AT TIME ZONE 'America/New_York',updated_at=now() WHERE id=task AND tenant_id=p_tenant;
 END IF;
 INSERT INTO enrollment_intakes(id,tenant_id,call_id,contact_id,data,pii_encrypted,carrier_key,follow_up_id,submitted_at,is_test_enrollment)
 VALUES(coalesce(p_id,gen_random_uuid()),p_tenant,p_call,p_contact,p_data-ARRAY['dob','mbi','medicaidNum'],
 jsonb_build_object('dob',encrypt_pii_value(p_data->>'dob'),'mbi',encrypt_pii_value(p_data->>'mbi'),'medicaidNum',encrypt_pii_value(p_data->>'medicaidNum')),p_carrier,task,(p_payload->>'submittedAt')::timestamptz,coalesce((p_data->>'testEnrollment')::boolean,false))
 ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id,data=excluded.data,pii_encrypted=excluded.pii_encrypted,
 completed_at=now(),carrier_key=excluded.carrier_key,is_test_enrollment=excluded.is_test_enrollment,updated_at=now() RETURNING id INTO result;
 IF NOT coalesce((p_data->>'testEnrollment')::boolean,false) THEN
 INSERT INTO ghl_enrollment_deliveries(tenant_id,call_id,twilio_recording_sid,enrollment_key,intake_id,payload_encrypted)
 VALUES(p_tenant,p_call,'ghl',gen_random_uuid()::text,result,encrypt_pii_value(p_payload::text));
 END IF;
 SELECT string_agg(data->>'sunfireCode',E'\n' ORDER BY submitted_at,id) INTO codes FROM enrollment_intakes WHERE call_id=p_call AND tenant_id=p_tenant AND nullif(data->>'sunfireCode','') IS NOT NULL;
 UPDATE call_records SET sunfire_code=coalesce(codes,'') WHERE id=p_call AND tenant_id=p_tenant;
 PERFORM enqueue_compliance_uploads(p_call);
 RETURN result;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
