import { readFileSync } from 'node:fs';
import {freshDatabase} from './freshInstall.js';

import roster from '../fixtures/deployment-roster.json' with {type:'json'};
import profile from '../fixtures/deployment-profile.json' with {type:'json'};
export const sql = name => readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
export const newMigrations=['152_protected_deployment_identity.sql','153_scoped_table_and_storage_access.sql','154_scoped_browser_routines.sql','155_owned_workspace_writes.sql','156_scoped_service_call_views.sql'];
export const auditTables=JSON.parse(readFileSync(new URL('../fixtures/historical-regressions.json',import.meta.url),'utf8')).auditTables;
export const publicReferences=['birthday_rule_states','bulletin_feed_status','bulletins','carrier_profiles','cms_county_penetration','cms_plan_embeddings_py2027','cms_plans_py2027','csnp_carrier_verification','dsnp_eae_lookup','fema_disasters','plan_terminations','qhp_landscape_2026','snp_plans_by_county','snp_routing_rules','star_ratings_by_county','state_excess_charge_rules','zip_county_crosswalk','sbe_plans_nj_2025','sbe_plans_pa_2025','sbe_plans_va_2025'];
export const uuid=n=>`90000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const fixtureRoster=roster.slice(0,4);
export const T='e0000000-0000-4000-8000-000000000004';
export const U=uuid(999);
export async function buildAccessDatabase(){
 // ACCESS_MATRIX_TARGET=hosted runs the same scenarios against an already
 // bootstrapped hosted project inside one rolled-back transaction (see
 // hostedAccessTarget.js). The hostile pre-150 grants cannot be injected there;
 // the platform's own default grants to browser roles play that part.
 const pg=process.env.ACCESS_MATRIX_TARGET==='hosted'
  ?await (await import('./hostedAccessTarget.js')).hostedAccessDatabase()
  :await freshDatabase({hostile:true});
 await pg.query('SELECT provision_deployment_roster($1,$2)',[JSON.stringify({...profile,tenantId:T}),JSON.stringify(fixtureRoster)]);
 return {pg,realTables:new Set((await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename))};
}
