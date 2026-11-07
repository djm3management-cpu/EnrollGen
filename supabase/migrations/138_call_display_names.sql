-- UNAPPLIED. Display enrichment only; never changes ownership or queues a call.
BEGIN;
CREATE FUNCTION public.enrich_call_display_names() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE safe_name text;first text;last text;contact contacts;
BEGIN
 IF NEW.agent_name IS NULL OR lower(trim(NEW.agent_name)) IN ('agent','unknown','') THEN
  SELECT coalesce(nullif(nullif(trim(e.name),'Agent'),''),initcap(replace(r.agent_slug,'_',' '))) INTO safe_name
  FROM enrolled_agents e JOIN availability_agent_subjects r
   ON r.clerk_user_id=e.clerk_user_id AND r.tenant_id=e.tenant_id AND r.is_active
  WHERE e.id=NEW.agent_id AND e.tenant_id=NEW.tenant_id AND e.is_active;
  IF safe_name IS NOT NULL THEN NEW.agent_name:=safe_name; END IF;
 END IF;
 IF NEW.beneficiary_name IS NULL AND NEW.contact_id IS NOT NULL THEN
  SELECT * INTO contact FROM contacts WHERE id=NEW.contact_id AND tenant_id=NEW.tenant_id;
  IF FOUND THEN
   first:=contact.first_name;last:=contact.last_name;
   IF contact.pii_encrypted->>'first_name' IS NOT NULL THEN first:=decrypt_pii_value(contact.pii_encrypted->'first_name'); END IF;
   IF contact.pii_encrypted->>'last_name' IS NOT NULL THEN last:=decrypt_pii_value(contact.pii_encrypted->'last_name'); END IF;
   NEW.beneficiary_name:=nullif(trim(concat_ws(' ',first,last)),'');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrich_call_display_names BEFORE INSERT OR UPDATE OF agent_id,agent_name,contact_id,beneficiary_name ON public.call_records
 FOR EACH ROW EXECUTE FUNCTION public.enrich_call_display_names();
COMMIT;
