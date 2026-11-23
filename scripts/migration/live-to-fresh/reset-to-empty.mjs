#!/usr/bin/env node
// Reset a REHEARSAL Supabase project to its day-one empty state, and prove it.
//
// Capture the baseline once, on the empty project, before any bootstrap:
//   PGPASSWORD=… node scripts/migration/live-to-fresh/reset-to-empty.mjs --capture-baseline <private file> \
//     --connection <verify-full URL without password> --remote-host <host> --remote-ref <ref>
// Reset (destructive; removes every application object, row, policy, grant, default,
// extension, Vault secret, bucket and object the bootstrap, provisioning, migration
// or storage copy created):
//   PGPASSWORD=… TARGET_SUPABASE_SECRET_KEY=… node scripts/migration/live-to-fresh/reset-to-empty.mjs \
//     --baseline <private file> --connection <…> --remote-host <host> --remote-ref <ref> \
//     --api-url https://<ref>.supabase.co --confirm-reset <ref>
//
// Refusals, before any connection: the retired production project in any argument;
// a connection, API URL or confirmation that does not name exactly --remote-ref; a
// baseline captured for another ref. Before any change: a public object not owned by
// the connecting role, or a bucket outside the application/test allowlist.
// Proof: the empty-target check passes and the catalog fingerprint equals the
// baseline (temporary namespaces excepted). Output is counts and object names only.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {takeRemoteFlags,assertDatabaseTarget,assertSupabaseApiTarget,refuseProduction} from '../../lib/remote-target.js';

export const APP_SCHEMAS=['migration_ledger','pii_vault','oct_slim_086_rollback','oct_slim_088_rollback'];
export const RESETTABLE_BUCKET=/^(call-recordings|message-media|rehearsal-test-[a-z0-9-]+)$/;

// One key per platform-visible object; values carry owner/ACL/flags. No row data.
export const FINGERPRINT={
 schema:`select 'schema:'||nspname k, coalesce(nspacl::text,'') v from pg_namespace where nspname !~ '^pg_(toast_)?temp_'`,
 relation:`select 'rel:'||n.nspname||'.'||c.relname||':'||c.relkind::text k, pg_get_userbyid(c.relowner)||'|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'') v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname !~ '^pg_(toast_)?temp_' and c.relkind<>'t'`,
 column_acl:`select 'colacl:'||n.nspname||'.'||c.relname||'.'||a.attname k, a.attacl::text v from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where a.attacl is not null and n.nspname not in ('pg_catalog','information_schema')`,
 routine:`select 'fn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'') v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast_)?temp_'`,
 type:`select 'type:'||n.nspname||'.'||t.typname k, t.typtype::text v from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname !~ '^pg_(toast_)?temp_' and t.typrelid=0 and t.typelem=0`,
 policy:`select 'policy:'||n.nspname||'.'||c.relname||'.'||p.polname k, p.polroles::text v from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace`,
 trigger:`select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname k, t.tgenabled::text v from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal`,
 extension:`select 'ext:'||extname k, extversion||'@'||extnamespace::regnamespace::text v from pg_extension`,
 default_acl:`select 'defacl:'||pg_get_userbyid(defaclrole)||':'||coalesce(nullif(defaclnamespace,0)::regnamespace::text,'-')||':'||defaclobjtype::text k, defaclacl::text v from pg_default_acl`,
 role:`select 'role:'||rolname k, rolsuper::text||'|'||rolbypassrls::text||'|'||rolcanlogin::text v from pg_roles`,
 membership:`select 'member:'||pg_get_userbyid(roleid)||'>'||pg_get_userbyid(member) k, admin_option::text v from pg_auth_members`,
 event_trigger:`select 'evt:'||evtname k, evtenabled::text v from pg_event_trigger`,
 publication:`select 'pub:'||pubname||':'||schemaname||'.'||tablename k, '' v from pg_publication_tables`,
 db_setting:`select 'dbsetting:'||coalesce(pg_get_userbyid(setrole),'*')||':'||array_to_string(setconfig,',') k,'' v from pg_db_role_setting`,
 bucket:`select 'bucket:'||id k, public::text v from storage.buckets`,
 objects:`select 'objects:count' k, count(*)::text v from storage.objects`,
 vault:`select 'vault:'||coalesce(name,'<unnamed>') k, '' v from vault.secrets`,
};
export async function fingerprint(db,{inTransaction=false}={}){
 const out={};
 if(!inTransaction)await db.query('BEGIN READ ONLY');
 for(const [name,sql] of Object.entries(FINGERPRINT)){
  await db.query('SAVEPOINT fp');
  try{for(const r of (await db.query(sql)).rows)out[r.k]=r.v;await db.query('RELEASE SAVEPOINT fp');}
  catch(e){await db.query('ROLLBACK TO SAVEPOINT fp');out['unavailable:'+name]=e.code||'error';}
 }
 if(!inTransaction)await db.query('ROLLBACK');
 return out;
}
export function compareFingerprints(baseline,current){
 const added=[],removed=[],changed=[];
 for(const k of Object.keys(current))if(!(k in baseline))added.push(k);else if(baseline[k]!==current[k])changed.push(k);
 for(const k of Object.keys(baseline))if(!(k in current))removed.push(k);
 return {equal:!added.length&&!removed.length&&!changed.length,added:added.sort(),removed:removed.sort(),changed:changed.sort()};
}
export async function emptyCheck(db){
 const r=(await db.query(`select
  (select count(*) from pg_class k join pg_namespace n on n.oid=k.relnamespace where n.nspname='public' and k.relkind in ('r','p','v','m','S','f'))::int public_relations,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='public' and d.objid is null)::int public_routines,
  (select count(*) from pg_namespace where nspname = any($1))::int app_schemas,
  (select count(*) from pg_policy p join pg_class k on k.oid=p.polrelid join pg_namespace n on n.oid=k.relnamespace where n.nspname in ('public','storage'))::int app_policies,
  (select count(*) from storage.buckets)::int buckets,
  (select count(*) from storage.objects)::int objects`,[APP_SCHEMAS])).rows[0];
 return {empty:Object.values(r).every(v=>v===0),...r};
}

// ---- default privileges: restore pg_default_acl rows to the baseline exactly ----
const PRIVS={r:{a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN'},S:{r:'SELECT',w:'UPDATE',U:'USAGE'},f:{X:'EXECUTE'},T:{U:'USAGE'},n:{U:'USAGE',C:'CREATE'}};
const OBJECTS={r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS',T:'TYPES',n:'SCHEMAS'};
export function parseAcl(text){
 const m=new Map();if(!text)return m;
 for(const item of text.replace(/^\{|\}$/g,'').split(',').filter(Boolean)){
  const [lhs]=item.split('/');const eq=lhs.lastIndexOf('=');
  const grantee=lhs.slice(0,eq).replace(/^"|"$/g,'')||'PUBLIC';
  m.set(grantee,new Set(lhs.slice(eq+1).replace(/\*/g,'').split('')));
 }
 return m;
}
function builtinDefault(type,owner,global){
 if(!global)return new Map();
 return new Map({r:[[owner,'arwdDxtm']],S:[[owner,'rwU']],f:[['PUBLIC','X'],[owner,'X']],T:[['PUBLIC','U'],[owner,'U']],n:[[owner,'UC']]}[type].map(([g,p])=>[g,new Set(p.split(''))]));
}
export function defaultPrivilegeStatements(baseline,current,actor){
 const keys=new Set([...Object.keys(baseline),...Object.keys(current)].filter(k=>k.startsWith('defacl:')));
 const out=[];
 for(const key of [...keys].sort()){
  if(baseline[key]===current[key])continue;
  const [,owner,schema,type]=key.split(':');const global=schema==='-';
  if(owner!==actor)throw Error(`default privileges of ${owner} differ from the baseline and cannot be restored by ${actor}`);
  const want=key in baseline?parseAcl(baseline[key]):builtinDefault(type,owner,global);
  const have=key in current?parseAcl(current[key]):builtinDefault(type,owner,global);
  const scope=`ALTER DEFAULT PRIVILEGES FOR ROLE ${pg.escapeIdentifier(owner)}${global?'':' IN SCHEMA '+pg.escapeIdentifier(schema)}`;
  const role=g=>g==='PUBLIC'?'PUBLIC':pg.escapeIdentifier(g);
  for(const grantee of new Set([...want.keys(),...have.keys()])){
   const w=want.get(grantee)||new Set(),h=have.get(grantee)||new Set();
   const grant=[...w].filter(p=>!h.has(p)).map(p=>PRIVS[type][p]),revoke=[...h].filter(p=>!w.has(p)).map(p=>PRIVS[type][p]);
   if(grant.length)out.push(`${scope} GRANT ${grant.join(',')} ON ${OBJECTS[type]} TO ${role(grantee)}`);
   if(revoke.length)out.push(`${scope} REVOKE ${revoke.join(',')} ON ${OBJECTS[type]} FROM ${role(grantee)}`);
  }
 }
 return out;
}

// ---- database part (one transaction) ----
export async function resetDatabase(db,baseline,{log=()=>{}}={}){
 const actor=(await db.query('select current_user u')).rows[0].u;
 const foreign=(await db.query(`select count(*)::int n from (
   select relowner o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
   union all select proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='public' and d.objid is null) x
  where o<>(select oid from pg_roles where rolname=current_user)`)).rows[0].n;
 if(foreign)throw Error(`${foreign} public object(s) are not owned by ${actor}; refusing`);
 const done={};
 await db.query('BEGIN');
 try{
  const schemas=(await db.query('select nspname from pg_namespace where nspname=any($1)',[APP_SCHEMAS])).rows.map(r=>r.nspname);
  for(const s of schemas)await db.query(`DROP SCHEMA ${pg.escapeIdentifier(s)} CASCADE`);
  done.schemas=schemas;
  const views=(await db.query(`select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')`)).rows;
  for(const r of views)await db.query(`DROP ${r.relkind==='m'?'MATERIALIZED VIEW':'VIEW'} IF EXISTS public.${pg.escapeIdentifier(r.relname)} CASCADE`);
  const tables=(await db.query(`select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','f')`)).rows;
  for(const r of tables)await db.query(`DROP ${r.relkind==='f'?'FOREIGN TABLE':'TABLE'} IF EXISTS public.${pg.escapeIdentifier(r.relname)} CASCADE`);
  for(const r of (await db.query(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='S'`)).rows)await db.query(`DROP SEQUENCE IF EXISTS public.${pg.escapeIdentifier(r.relname)} CASCADE`);
  const routines=(await db.query(`select p.oid::regprocedure::text sig,p.prokind from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='public' and d.objid is null`)).rows;
  for(const r of routines)await db.query(`DROP ${r.prokind==='p'?'PROCEDURE':r.prokind==='a'?'AGGREGATE':'FUNCTION'} IF EXISTS ${r.sig} CASCADE`);
  for(const r of (await db.query(`select t.oid::regtype::text t from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_depend d on d.objid=t.oid and d.deptype='e' where n.nspname='public' and t.typtype in ('e','d','c','r','m') and (t.typrelid=0 or (select relkind from pg_class where oid=t.typrelid)='c') and d.objid is null`)).rows)await db.query(`DROP TYPE IF EXISTS ${r.t} CASCADE`);
  Object.assign(done,{views:views.length,tables:tables.length,routines:routines.length});
  const policies=(await db.query(`select c.relname,p.polname from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage'`)).rows
   .filter(r=>!(`policy:storage.${r.relname}.${r.polname}` in baseline));
  for(const r of policies)await db.query(`DROP POLICY ${pg.escapeIdentifier(r.polname)} ON storage.${pg.escapeIdentifier(r.relname)}`);
  done.storagePolicies=policies.length;
  // Grants made by the connecting role on the storage tables (e.g. seal's service_role grant).
  for(const t of ['objects','buckets'])for(const grantee of ['service_role','authenticated','anon'])
   await db.query(`REVOKE ALL ON storage.${t} FROM ${grantee}`);
  // Extensions and Vault secrets absent from the baseline.
  const current=await fingerprint(db,{inTransaction:true});
  const exts=Object.keys(current).filter(k=>k.startsWith('ext:')&&!(k in baseline)).map(k=>k.slice(4));
  for(const e of exts)await db.query(`DROP EXTENSION IF EXISTS ${pg.escapeIdentifier(e)}`);
  done.extensions=exts;
  const secrets=Object.keys(current).filter(k=>k.startsWith('vault:')&&!(k in baseline)).map(k=>k.slice(6));
  for(const name of secrets)await db.query('DELETE FROM vault.secrets WHERE name=$1',[name]);
  done.vaultSecrets=secrets;
  // Schemas created since the baseline and owned by the connecting role; must be empty by now.
  const extraSchemas=Object.keys(await fingerprint(db,{inTransaction:true})).filter(k=>k.startsWith('schema:')&&!(k in baseline)).map(k=>k.slice(7));
  for(const ns of extraSchemas){
   const own=(await db.query('select pg_get_userbyid(nspowner)=current_user o from pg_namespace where nspname=$1',[ns])).rows[0]?.o;
   if(!own)throw Error(`schema ${ns} is not in the baseline and not owned by ${actor}; refusing`);
   await db.query(`DROP SCHEMA ${pg.escapeIdentifier(ns)}`);
  }
  done.extraSchemas=extraSchemas;
  const statements=defaultPrivilegeStatements(baseline,await fingerprint(db,{inTransaction:true}),actor);
  for(const s of statements)await db.query(s);
  done.defaultPrivilegeStatements=statements.length;
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
 log(`database reset: ${JSON.stringify(done)}`);
 return done;
}

// ---- storage part (Storage API; SQL deletes are refused by the platform) ----
export async function resetStorage(apiUrl,key,{fetchImpl=fetch,log=()=>{},waitMs=1000,attempts=30}={}){
 const call=(method,path,body)=>fetchImpl(new URL('/storage/v1/'+path,apiUrl),{method,headers:{apikey:key,Authorization:'Bearer '+key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const r=await call('GET','bucket');if(!r.ok)throw Error(`bucket list failed (HTTP ${r.status})`);
 const buckets=(await r.json()).map(b=>b.id);
 const foreign=buckets.filter(id=>!RESETTABLE_BUCKET.test(id));
 if(foreign.length)throw Error(`${foreign.length} bucket(s) outside the application/test allowlist; refusing`);
 for(const id of buckets){
  const e=await call('POST',`bucket/${encodeURIComponent(id)}/empty`);await e.arrayBuffer();
  if(!e.ok)throw Error(`emptying a bucket failed (HTTP ${e.status})`);
  for(let i=0;;i++){
   const d=await call('DELETE',`bucket/${encodeURIComponent(id)}`);await d.arrayBuffer();
   if(d.ok)break;
   if(i>=attempts)throw Error(`deleting a bucket failed (HTTP ${d.status})`);
   await new Promise(res=>setTimeout(res,waitMs));
  }
 }
 log(`storage reset: ${buckets.length} bucket(s) emptied and deleted`);
 return buckets;
}

export function parseResetArgs(argv){
 refuseProduction(...argv);
 const {remote,rest}=takeRemoteFlags(argv);
 const o={connection:null,baseline:null,capture:null,apiUrl:null,confirm:null};
 for(let i=0;i<rest.length;i++){
  const a=rest[i],next=()=>{if(i+1>=rest.length)throw Error(`${a} needs a value`);return rest[++i];};
  if(a==='--connection')o.connection=next();else if(a==='--baseline')o.baseline=next();else if(a==='--capture-baseline')o.capture=next();
  else if(a==='--api-url')o.apiUrl=next();else if(a==='--confirm-reset')o.confirm=next();else throw Error(`Unknown argument ${a}`);
 }
 if(!remote)throw Error('--remote-host and --remote-ref are required: this tool only resets one explicitly named project');
 if(!o.connection)throw Error('--connection is required');
 assertDatabaseTarget(o.connection,'connection',remote);
 if(o.capture){if(o.baseline||o.apiUrl||o.confirm)throw Error('--capture-baseline takes no reset arguments');return {...o,remote};}
 if(!o.baseline||!o.apiUrl||!o.confirm)throw Error('--baseline, --api-url and --confirm-reset are required to reset');
 if(o.confirm!==remote.ref)throw Error('--confirm-reset must repeat --remote-ref exactly');
 assertSupabaseApiTarget(o.apiUrl,remote);
 return {...o,remote};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const say=m=>console.log(`[reset-to-empty] ${m}`);
 let db;
 try{
  const o=parseResetArgs(process.argv.slice(2));
  db=new pg.Client({connectionString:o.connection,application_name:'enrollgen-reset-to-empty',connectionTimeoutMillis:15000});
  await db.connect();
  if(o.capture){
   const e=await emptyCheck(db);
   if(!e.empty)throw Error(`baseline must be captured on an empty project: ${JSON.stringify(e)}`);
   writeFileSync(o.capture,JSON.stringify({ref:o.remote.ref,capturedAt:new Date().toISOString(),fingerprint:await fingerprint(db)}),{mode:0o600});
   say(`baseline captured (${e.empty?'empty':'not empty'})`);
  }else{
   const base=JSON.parse(readFileSync(o.baseline,'utf8'));
   if(base.ref!==o.remote.ref)throw Error('baseline was captured for a different project');
   const key=process.env.TARGET_SUPABASE_SECRET_KEY;if(!key)throw Error('TARGET_SUPABASE_SECRET_KEY is required');
   await resetStorage(o.apiUrl,key,{log:say});
   await resetDatabase(db,base.fingerprint,{log:say});
   const e=await emptyCheck(db),cmp=compareFingerprints(base.fingerprint,await fingerprint(db));
   say(`empty check: ${JSON.stringify(e)}`);
   say(`fingerprint equals day-one baseline: ${cmp.equal}${cmp.equal?'':` (added ${cmp.added.length}, removed ${cmp.removed.length}, changed ${cmp.changed.length}: ${[...cmp.added,...cmp.removed,...cmp.changed].slice(0,20).join(', ')})`}`);
   process.exitCode=e.empty&&cmp.equal?0:1;
  }
 }catch(e){say(`refused or failed: ${e.code?'SQLSTATE '+e.code:e.message}`);process.exitCode=2;}
 finally{if(db)await db.end();}
}
