import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPlatformExceptions,applyPlatformExceptions} from '../scripts/check-database-drift.mjs';

const grant={schema:'storage',relation:'objects',grantor:'supabase_storage_admin',grantee:'anon',privilege:'SELECT',grantable:'NO'};
const defacl={owner:'supabase_admin',schema:'public',type:'r',acl:'{postgres=arwdDxtm/supabase_admin}'};
const usage={schema:'public',owner:'pg_database_owner',acl:'{pg_database_owner=UC/pg_database_owner,postgres=U/pg_database_owner}'};
const entry=(category,section,change,object)=>({category,section,change,object,reason:'synthetic'});
const file=accepted=>()=>JSON.stringify({platform:'supabase-hosted',accepted});
const load=accepted=>loadPlatformExceptions('supabase-hosted',file(accepted));

test('only the approved categories, each confined to its own rows, can be accepted',()=>{
 assert.equal(load([entry('B4-storage-grant','tableGrants','extra_or_changed',grant),entry('B6-default-acl','defaults','extra_or_changed',defacl),entry('B6-schema-usage','schemaGrants','extra_or_changed',usage)]).length,3);
 const outside=/outside its approved category/;
 assert.throws(()=>load([entry('B4-storage-grant','tableGrants','extra_or_changed',{...grant,schema:'public',relation:'contacts'})]),outside);
 assert.throws(()=>load([entry('B4-storage-grant','tableGrants','extra_or_changed',{...grant,relation:'s3_multipart_uploads'})]),outside);
 assert.throws(()=>load([entry('B4-storage-grant','policies','extra_or_changed',{schema:'storage',relation:'objects',name:'open'})]),outside);
 assert.throws(()=>load([entry('B6-schema-usage','schemaGrants','extra_or_changed',{...usage,schema:'pii_vault'})]),outside);
 assert.throws(()=>load([entry('B6-default-acl','tables','extra_or_changed',{schema:'public',name:'contacts'})]),outside);
 assert.throws(()=>load([entry('B3-routine','routines','extra_or_changed',{schema:'public',name:'f'})]),outside);
 assert.throws(()=>load([{...entry('B4-storage-grant','tableGrants','extra_or_changed',grant),reason:''}]),outside);
 assert.throws(()=>load([entry('B4-storage-grant','tableGrants','added',grant)]),outside);
 assert.throws(()=>load([entry('B4-storage-grant','tableGrants','extra_or_changed',grant),entry('B4-storage-grant','tableGrants','extra_or_changed',grant)]),/Duplicate/);
 assert.throws(()=>loadPlatformExceptions('other',file([])),/Unknown --platform/);
 assert.throws(()=>loadPlatformExceptions('supabase-hosted',()=>JSON.stringify({platform:'other',accepted:[]})),/malformed/);
});

test('acceptance is exact: any further widening or a different row remains drift',()=>{
 const accepted=load([entry('B4-storage-grant','tableGrants','extra_or_changed',grant),entry('B6-default-acl','defaults','missing_or_changed',defacl)]);
 const diffs=[
  {section:'tableGrants',change:'extra_or_changed',object:grant},
  {section:'tableGrants',change:'extra_or_changed',object:{...grant,privilege:'TRUNCATE'}},
  {section:'tableGrants',change:'extra_or_changed',object:{...grant,grantee:'PUBLIC'}},
  {section:'defaults',change:'extra_or_changed',object:defacl},
  {section:'policies',change:'extra_or_changed',object:{schema:'storage',relation:'objects',name:'open'}},
 ];
 const {remaining,accepted:matched,unused}=applyPlatformExceptions(diffs,accepted);
 assert.deepEqual(matched,[{section:'tableGrants',change:'extra_or_changed',schema:'storage',relation:'objects',name:undefined,category:'B4-storage-grant'}]);
 assert.equal(remaining.length,4);
 assert.deepEqual(unused.map(u=>u.category),['B6-default-acl']);
 assert.deepEqual(applyPlatformExceptions([],[]),{remaining:[],accepted:[],unused:[]});
});
