import {readFileSync} from 'node:fs';
const core=readFileSync(new URL('../../supabase/migrations/157_evidence_access_and_minimization.sql',import.meta.url),'utf8').split('ALTER TABLE public.evidence_access_log ENABLE')[0].replace('BEGIN;','');
export async function installEvidenceAuditFixture(pg){
 const {rows}=await pg.query("SELECT to_regclass('public.evidence_access_log') name");
 if(rows[0].name)return;
 await pg.exec(core);
 if((await pg.query("SELECT 1 FROM pg_roles WHERE rolname='service_role'")).rows.length)await pg.exec('GRANT INSERT,SELECT ON evidence_access_log TO service_role');
 for(const table of ['recording_download_tickets','recording_compliance_tickets']){
  if((await pg.query('SELECT to_regclass($1) name',['public.'+table])).rows[0].name){
   await pg.exec('ALTER TABLE '+table+' ADD COLUMN IF NOT EXISTS grant_id uuid');
   if(table==='recording_download_tickets')await pg.exec('ALTER TABLE '+table+' ADD COLUMN IF NOT EXISTS actor_id text, ADD COLUMN IF NOT EXISTS recording_id text,ADD COLUMN IF NOT EXISTS storage_path text,ALTER COLUMN recording_sid DROP NOT NULL,ALTER COLUMN account_sid DROP NOT NULL,ALTER COLUMN expected_call_sid DROP NOT NULL');
  }
 }
}
