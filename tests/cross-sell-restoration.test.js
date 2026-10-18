import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('restored cross-sell table accepts owned rows and rejects anonymous, foreign-agent and borrowed-session writes',async()=>{
 const pg=new PGlite();
 const T='00000000-0000-4000-8000-000000000001',A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
 const S='20000000-0000-4000-8000-000000000001',OTHER='20000000-0000-4000-8000-000000000002';
 try {
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims')::jsonb$$;
 CREATE TABLE tenants(id uuid PRIMARY KEY);CREATE TABLE enrolled_agents(id uuid PRIMARY KEY,tenant_id uuid,clerk_user_id text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY,tenant_id uuid,agent_id uuid);CREATE TABLE call_transcripts(id uuid PRIMARY KEY,tenant_id uuid,session_id uuid);
 GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT ON enrolled_agents,sessions,call_transcripts TO authenticated;
 INSERT INTO tenants VALUES('${T}');INSERT INTO enrolled_agents VALUES('${A}','${T}','dylan',true),('${B}','${T}','peer',true);
 INSERT INTO sessions VALUES('${S}','${T}','${A}'),('${OTHER}','${T}','${B}');`);
 await pg.exec(readFileSync(new URL('../supabase/migrations/100_cross_sell_attempts_restore.sql',import.meta.url),'utf8'));
 await pg.exec(`SET ROLE authenticated;SELECT set_config('request.jwt.claims','{"sub":"dylan"}',false)`);
 const insert=(agent,session)=>pg.query("INSERT INTO cross_sell_attempts(tenant_id,agent_id,session_id,primary_product,cross_sell_product,presented) VALUES($1,$2,$3,'MA','HIP',true)",[T,agent,session]);
 await insert(A,S);assert.equal((await pg.query('SELECT count(*)::int n FROM cross_sell_attempts')).rows[0].n,1);
 await assert.rejects(insert(B,OTHER),/row-level security/);await assert.rejects(insert(A,OTHER),/row-level security/);
 await pg.exec('RESET ROLE;SET ROLE anon');await assert.rejects(pg.query('SELECT * FROM cross_sell_attempts'),/permission denied/);
 }finally{await pg.close();}
});
