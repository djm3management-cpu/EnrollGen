// Logical acceptance archive for the in-process platform stand-ins only.
// Native PostgreSQL operators use pg_dump/pg_restore; never use this test key export against hosted Vault.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {snapshotCatalog,catalogDifferences} from '../lib/database-catalog.js';
import {applyBootstrap} from '../bootstrap-database.mjs';
import {requireEmptyDatabase} from './native.js';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const relation=(s,t)=>quote(s)+'.'+quote(t);
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function logicalBackup(db){
 const catalog=await snapshotCatalog(db);
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const tables=[];
  const list=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','pii_vault','oct_slim_086_rollback','oct_slim_088_rollback','storage') OR (schemaname='vault' AND tablename='decrypted_secrets') ORDER BY 1,2")).rows;
  for(const {schemaname:schema,tablename:name} of list){
   const columns=(await db.query("SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='' ORDER BY attnum",[relation(schema,name)])).rows.map(r=>r.attname);
   const rows=(await db.query(`SELECT to_jsonb(t)::text value FROM ${relation(schema,name)} t`)).rows.map(r=>r.value);
   tables.push({schema,name,columns,rows});
  }
  const sequences=(await db.query("SELECT schemaname,sequencename FROM pg_sequences WHERE schemaname IN ('public','pii_vault') ORDER BY 1,2")).rows;
  for(const s of sequences)Object.assign(s,(await db.query(`SELECT last_value::text,is_called FROM ${relation(s.schemaname,s.sequencename)}`)).rows[0]);
  return Buffer.from(JSON.stringify({format:'enrollgen-local-logical-v1',catalog,tables,sequences}));
 }finally{await db.query('ROLLBACK');}
}
export async function logicalRestore(db,bytes){
 await requireEmptyDatabase(db);
 const archive=JSON.parse(bytes.toString());if(archive.format!=='enrollgen-local-logical-v1')throw Error('Invalid local archive');
 await applyBootstrap(db,{platformStandins:true});
 await db.query('BEGIN');
 try{
  // Equivalent to an owner data-only restore with disabled triggers. Catalog guards are restored before commit.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query('TRUNCATE '+archive.tables.map(t=>relation(t.schema,t.name)).join(',')+' CASCADE');
  for(const t of archive.tables){
   if(t.rows.length)await db.query(`INSERT INTO ${relation(t.schema,t.name)} (${t.columns.map(quote).join(',')}) OVERRIDING SYSTEM VALUE SELECT ${t.columns.map(quote).join(',')} FROM jsonb_populate_recordset(NULL::${relation(t.schema,t.name)},$1::jsonb)`,['['+t.rows.join(',')+']']);
  }
  for(const s of archive.sequences)await db.query('SELECT setval($1::regclass,$2,$3)',[relation(s.schemaname,s.sequencename),s.last_value,s.is_called]);
  await db.query("SET LOCAL session_replication_role='origin'");
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
const encryptedValues=value=>{
 if(!value||typeof value!=='object')return [];
 if(typeof value.k==='string'&&typeof value.c==='string')return [value];
 return Object.values(value).flatMap(encryptedValues);
};
export async function verifyRestore(source,restored){
 const expected=JSON.parse(readFileSync(new URL('../../supabase/bootstrap/catalog.expected.json',import.meta.url)));
 const a=JSON.parse((await logicalBackup(source)).toString()),b=JSON.parse((await logicalBackup(restored)).toString());
 const checks=[];const check=(name,pass)=>checks.push({name,pass});
 check('catalog_source',catalogDifferences(expected,a.catalog).length===0);
 check('catalog_restored',catalogDifferences(expected,b.catalog).length===0);
 check('row_level_security',hash(a.catalog.tables)===hash(b.catalog.tables)&&hash(a.catalog.policies)===hash(b.catalog.policies));
 check('grants',hash(a.catalog.tableGrants)===hash(b.catalog.tableGrants)&&hash(a.catalog.columnGrants)===hash(b.catalog.columnGrants)&&hash(a.catalog.defaults)===hash(b.catalog.defaults));
 let total=0,encrypted=0;
 for(const t of a.tables){
  const other=b.tables.find(x=>x.schema===t.schema&&x.name===t.name),name=t.schema+'.'+t.name;
  total+=t.rows.length;
  check('count:'+name,!!other&&other.rows.length===t.rows.length);
  check('checksum:'+name,!!other&&hash(t.rows.map(hash).sort())===hash(other.rows.map(hash).sort()));
  const values=encryptedValues(other?.rows.map(r=>JSON.parse(r)));let decrypts=true;
  for(const value of values){encrypted++;try{const orig=await source.query('SELECT decrypt_pii_value($1::jsonb) v',[JSON.stringify(value)]),copy=await restored.query('SELECT decrypt_pii_value($1::jsonb) v',[JSON.stringify(value)]);if(orig.rows[0].v!==copy.rows[0].v)decrypts=false;}catch{decrypts=false;}}
  if(values.length)check('decrypt:'+name,decrypts);
 }
 check('encrypted_fields_present',encrypted>0);
 check('sequences',hash(a.sequences)===hash(b.sequences));
 for(const table of ['evidence_access_log','admin_action_log'])for(const operation of ['UPDATE','DELETE']){
  let rejected=false;await restored.query('BEGIN');
  try{await restored.query(operation==='UPDATE'?`UPDATE ${table} SET actor_id=actor_id WHERE false`:`DELETE FROM ${table} WHERE false`);}catch(e){rejected=e.code==='42501';}finally{await restored.query('ROLLBACK');}
  check('append_only:'+table+':'+operation,rejected);
 }
 return {pass:checks.every(c=>c.pass),tables:a.tables.length,rows:total,checks};
}
