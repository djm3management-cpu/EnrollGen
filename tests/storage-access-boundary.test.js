// Storage boundary (hosted rehearsal B4): anon and authenticated read, insert, update
// and delete 0 rows of storage.objects and storage.buckets. In-process this runs on
// the fresh install (no browser grants). With ACCESS_MATRIX_TARGET=hosted it runs on
// the hosted project, where the platform's own browser grants remain and RLS with no
// browser policy must deny. Synthetic rows only, inside a rolled-back transaction.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessDatabase,fixtureRoster,T} from './helpers/databaseAccessSchema.js';

let pg;
after(async()=>{if(pg)await pg.close();});
const q=(s,a=[])=>pg.query(s,a);
const deniedOrNone=async(sql,params=[])=>{
 try{const r=await q(sql,params);return {denied:false,rows:r.rows.length,affected:r.affectedRows};}
 catch(e){assert.equal(e.code,'42501',`unexpected SQLSTATE ${e.code}`);return {denied:true,rows:0,affected:0};}
};

test('anon and authenticated read, insert, update and delete 0 storage rows',async t=>{
 ({pg}=await buildAccessDatabase());
 const paths=[['message-media',`${T}/synthetic-boundary/0.gif`],['call-recordings',`${T}/CAsyntheticboundary/REsyntheticboundary.wav`]];
 for(const [bucket,name] of paths)await q('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',[bucket,name]);
 const state=async()=>({
  objects:(await q('SELECT count(*)::int n FROM storage.objects')).rows[0].n,
  objectNames:(await q('SELECT string_agg(bucket_id||\'/\'||name,\',\' ORDER BY name) s FROM storage.objects')).rows[0].s,
  buckets:(await q('SELECT string_agg(id||\':\'||public,\',\' ORDER BY id) s FROM storage.buckets')).rows[0].s,
 });
 const before=await state();
 assert.ok(before.objects>=2);
 const platformGrants=(await q("SELECT has_table_privilege('anon','storage.objects','SELECT') a")).rows[0].a;
 t.diagnostic(`target=${pg.hosted?'hosted':'in-process'} browser table grants present=${platformGrants}`);
 for(const [role,claims] of [['anon',{role:'anon'}],['authenticated',{role:'authenticated',sub:fixtureRoster[0].clerk_user_id}]]){
  await pg.exec('RESET ROLE');
  await q("SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers','{}',false)",[JSON.stringify(claims)]);
  await pg.exec('SET ROLE '+role);
  for(const table of ['storage.objects','storage.buckets']){
   const read=await deniedOrNone(`SELECT * FROM ${table}`);
   assert.equal(read.rows,0,`${role} read ${table}`);
   const update=await deniedOrNone(table==='storage.objects'?`UPDATE ${table} SET name=name||'.x' RETURNING 1`:`UPDATE ${table} SET public=true RETURNING 1`);
   assert.equal(update.affected,0,`${role} updated ${table}`);
   const del=await deniedOrNone(`DELETE FROM ${table} RETURNING 1`);
   assert.equal(del.affected,0,`${role} deleted ${table}`);
   t.diagnostic(`${role} ${table}: read=${read.denied?'denied':'0 rows'} update=${update.denied?'denied':'0 rows'} delete=${del.denied?'denied':'0 rows'}`);
  }
  await assert.rejects(q("INSERT INTO storage.objects(bucket_id,name) VALUES('message-media',$1)",[`${T}/synthetic-boundary/${role}.gif`]),e=>e.code==='42501',`${role} inserted an object`);
  await assert.rejects(q("INSERT INTO storage.buckets(id,name,public) VALUES($1,$1,true)",[`synthetic-${role}`]),e=>e.code==='42501',`${role} inserted a bucket`);
 }
 await pg.exec('RESET ROLE');
 assert.deepEqual(await state(),before);
 assert.equal(before.buckets.includes(':true'),false);
});
