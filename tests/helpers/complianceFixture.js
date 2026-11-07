import {readFileSync} from 'node:fs';
export const assessment={a:{r:7,l:7,k:7,n:'Fixture assessment.'},b:{e:7,l:'low',r:[]}};
export function completeCall(patch={}) {
 const duration=patch.call_duration_seconds??900;
 return {product_type:'MA',call_outcome:'enrolled',call_duration_seconds:duration,
  transcript_diarized:[{speaker:'agent',text:'Hello, we are discussing Medicare. This call is recorded.',start_ms:0,end_ms:1000},
   {speaker:'customer',text:'Yes, please.',start_ms:0,end_ms:1000},
   {speaker:'agent',text:'Thank you.',start_ms:duration*1000-1000,end_ms:duration*1000},
   {speaker:'customer',text:'Thank you.',start_ms:duration*1000-1000,end_ms:duration*1000}],...patch};
}
export function enableFixtureScoring(){process.env.SCORING_ENABLED='true';process.env.COMPLIANCE_RULES_VERSION='cy2027-full-rubric-6';}
export async function installComplianceFixture(pg){
 const sql=name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
 await pg.exec(`CREATE TABLE IF NOT EXISTS tenants(id uuid PRIMARY KEY);
 INSERT INTO tenants(id) SELECT DISTINCT tenant_id FROM call_records c WHERE tenant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tenants t WHERE t.id=c.tenant_id) ON CONFLICT DO NOTHING;
 DO $$ BEGIN IF to_regprocedure('public.is_current_tenant(uuid)') IS NULL THEN EXECUTE 'CREATE FUNCTION public.is_current_tenant(uuid) RETURNS boolean LANGUAGE sql AS ''SELECT true'''; END IF; END $$;
 DO $$ BEGIN IF to_regclass('public.transcript_score_dispatch') IS NULL THEN
 CREATE TABLE transcript_score_dispatch(call_id uuid,revision text,delivered_revision text,available_at timestamptz);
 END IF; END $$;
 DO $$ BEGIN IF to_regprocedure('public.get_sale_compliance_dispatch()') IS NULL THEN EXECUTE 'CREATE FUNCTION get_sale_compliance_dispatch() RETURNS SETOF transcript_score_dispatch LANGUAGE sql AS ''SELECT * FROM transcript_score_dispatch'''; END IF;
 IF to_regprocedure('public.refresh_sale_compliance_request(uuid)') IS NULL THEN EXECUTE 'CREATE FUNCTION refresh_sale_compliance_request(uuid) RETURNS void LANGUAGE sql AS ''SELECT'''; END IF; END $$;
 ALTER TABLE call_records ADD COLUMN IF NOT EXISTS compliance_status text DEFAULT 'not_requested', ADD COLUMN IF NOT EXISTS agent_assessment jsonb, ADD COLUMN IF NOT EXISTS beneficiary_risk jsonb;`);
 for(const name of ['133_compliance_overhaul_safety.sql','134_compliance_atomic_versions.sql','135_compliance_admin_versions.sql','136_compliance_dispatch_freeze.sql','139_scoring_incomplete_status.sql','145_compliance_event_version.sql'])await pg.exec(sql(name));
 await pg.exec('UPDATE compliance_runtime_control SET enabled=true');
 enableFixtureScoring();
}
