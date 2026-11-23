import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {catalogQueries,catalogDifferences} from '../scripts/lib/database-catalog.js';

// pg_policies.roles is name[] (OID 1003). node-pg has no parser for it and returns
// the text '{authenticated}', while PGlite returns an array. The catalog query casts
// it to text[] (OID 1009) so every driver yields the same array.
test('policy roles are selected as text[] so node-pg parses them into arrays',()=>{
 assert.match(catalogQueries.policies,/\broles::text\[\] roles\b/);
 assert.equal(pg.types.getTypeParser(1003)('{authenticated}'),'{authenticated}');
 assert.deepEqual(pg.types.getTypeParser(1009)('{anon,authenticated}'),['anon','authenticated']);
});

test('normalized policy roles compare equal, and a changed role is still drift',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.t(id int);
   CREATE POLICY p_one ON public.t FOR SELECT TO authenticated USING(true);
   CREATE POLICY p_two ON public.t FOR SELECT TO anon,authenticated USING(true);`);
  const read=async()=>(await db.query(catalogQueries.policies)).rows.filter(r=>r.relation==='t');
  const before=await read();
  assert.deepEqual(before.map(r=>r.roles),[['authenticated'],['anon','authenticated']]);
  assert.deepEqual(catalogDifferences({policies:before},{policies:await read()}),[]);
  await db.exec('ALTER POLICY p_one ON public.t TO anon');
  const changes=catalogDifferences({policies:before},{policies:await read()});
  assert.deepEqual(changes.map(d=>[d.change,d.object.name]).sort(),[['extra_or_changed','p_one'],['missing_or_changed','p_one']]);
 }finally{await db.close();}
});
