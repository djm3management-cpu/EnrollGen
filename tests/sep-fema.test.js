import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fetchLiveFemaDisasters, declarationToDisaster, matchFemaDisasters, femaCountyStatus, countyFipsFromDeclaration, withLiveFemaResult } from '../src/lib/sepFema.js';
import { getSEPsForZip, getSEPsForState } from '../src/lib/sepEngine.js';
import { refreshFemaSnapshot } from '../netlify/functions/sync-fema.js';
const now = new Date();
const iso = now.toISOString();
const row = { id:'a', disasterNumber:9001, declarationType:'DR', state:'PA', fipsStateCode:42, fipsCountyCode:101,
  designatedArea:'Philadelphia (County)', declarationDate:iso, incidentEndDate:null, ihProgramDeclared:true, declarationTitle:'Fixture disaster' };
const response = rows => ({ ok:true, json:async()=>({DisasterDeclarationsSummaries:rows}) });
const fema = seps => seps.filter(s=>s.category==='FEMA Disaster');

test('all pages fetched, including late county amendments; per-county program flags never bleed', async()=>{
 const urls=[];
 const feed=await fetchLiveFemaDisasters({ now, fetchImpl:async url=>{
  urls.push(new URL(url));
  return response(urls.length===1 ? Array.from({length:1000},()=>row) : [{...row,id:'b', fipsCountyCode:91,designatedArea:'Montgomery (County)',ihProgramDeclared:false,paProgramDeclared:true}]);
 }});
 assert.equal(feed.apiFailed,false);assert.equal(feed.disasters.length,2);
 assert.equal(urls[0].searchParams.get('$skip'),'0');assert.equal(urls[1].searchParams.get('$skip'),'1000');
 assert.match(urls[0].searchParams.get('$select'),/fipsCountyCode/);
 assert.equal(matchFemaDisasters(feed.disasters,['42101'],now).length,1);
 assert.equal(matchFemaDisasters(feed.disasters,['42091'],now).length,0);
 assert.equal(feed.fetchedAt,iso);
});
test('NJ with no declaration shows no FEMA; affected county shows SEP; another county and state-only selection do not',async()=>{
 const feed=await fetchLiveFemaDisasters({now,fetchImpl:async()=>response([row])});
 assert.equal(femaCountyStatus(feed,['34021'],now),null);
 assert.equal(fema(getSEPsForZip('08540',feed.disasters,{countyFips:['34021']})).length,0);
 assert.equal(fema(getSEPsForZip('19103',feed.disasters,{countyFips:['42101']})).length,1);
 assert.equal(fema(getSEPsForZip('19401',feed.disasters,{countyFips:['42091']})).length,0);
 assert.equal(fema(getSEPsForZip('19103',feed.disasters)).length,0);
 assert.equal(fema(getSEPsForState('PA',feed.disasters)).length,0);
 assert.match(femaCountyStatus(feed,['42101'],now).label,/FEMA SEP available.*Data from/);
});
test('network, malformed response, and failure after first page discard all data; empty feed is authoritative',async()=>{
 for(const fetchImpl of [async()=>{throw Error('offline')},async()=>({ok:false,status:503}),async()=>({ok:true,json:async()=>({})})]){
  const feed=await fetchLiveFemaDisasters({now,fetchImpl});
  assert.equal(feed.apiFailed,true);assert.deepEqual(feed.disasters,[]);assert.equal(femaCountyStatus(feed,['42101'],now).label,'FEMA data unavailable');
 }
 let calls=0;const partial=await fetchLiveFemaDisasters({now,fetchImpl:async()=>{if(calls++)throw Error('page 2 failed');return response(Array(1000).fill(row))}});
 assert.deepEqual(partial.disasters,[]);assert.equal(partial.apiFailed,true);
 const empty=await fetchLiveFemaDisasters({now,fetchImpl:async()=>response([])});assert.equal(empty.apiFailed,false);assert.deepEqual(empty.disasters,[]);
});
test('stale and seed data cannot yield SEP; invalid and statewide/tribal FIPS fail closed; month-end is inclusive',()=>{
 const disaster=declarationToDisaster(row,iso,now);
 assert.equal(matchFemaDisasters([{...disaster,fetchedAt:'2026-04-25T00:00:00Z'}],['42101'],new Date('2026-10-03')).length,0);
 assert.equal(matchFemaDisasters([{...disaster,source:'seed'}],['42101'],now).length,0);
 for(const invalid of [{},{fipsStateCode:42,fipsCountyCode:0},{fipsStateCode:'XX',fipsCountyCode:101},{...row,designatedArea:'Tribal reservation'}])assert.equal(countyFipsFromDeclaration(invalid),null);
 const boundary=declarationToDisaster({...row,declarationDate:'2026-01-31',incidentEndDate:'2026-01-31'},'2026-03-31T12:00:00Z',new Date('2026-03-31T12:00:00Z'));
 assert.equal(boundary.sepEndDate,'2026-03-31');assert.equal(matchFemaDisasters([boundary],['42101'],new Date('2026-03-31T12:00:00Z')).length,1);
});
test('scheduled refresh replaces removed areas atomically and writes unavailable on feed failure',async()=>{
 const writes=[];const client={from:table=>{assert.equal(table,'fema_feed_snapshot');return {upsert:async value=>{writes.push(value);return {error:null}}}}};
 await refreshFemaSnapshot(client,async()=>({apiFailed:false,disasters:[],fetchedAt:iso,checkedAt:iso}));
 await refreshFemaSnapshot(client,async()=>({apiFailed:true,disasters:[],fetchedAt:null,checkedAt:iso}));
 assert.equal(writes[0].status,'live');assert.deepEqual(writes[0].disasters,[]);assert.equal(writes[1].status,'unavailable');assert.equal(writes[1].fetched_at,null);
 await assert.rejects(refreshFemaSnapshot({from:()=>({upsert:async()=>({error:Error('write failed')})})},async()=>({apiFailed:false,disasters:[],fetchedAt:iso,checkedAt:iso})),/write failed/);
});
test('078 executes: ignores stale legacy NJ, matches designated county, handles failure/staleness, preserves other SEPs and privileges',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const schema=readFileSync(new URL('../scripts/sep-data/schema.sql',import.meta.url),'utf8');
  const cms=readFileSync(new URL("../supabase/migrations/054_cms_landscape_2027.sql",import.meta.url),"utf8");
  await pg.exec(cms.slice(cms.indexOf("CREATE TABLE IF NOT EXISTS public.cms_plans_py2027"),cms.indexOf("CREATE INDEX IF NOT EXISTS cms_plans_py2027_area_idx")));
  await pg.exec(schema);
  await pg.exec(`INSERT INTO zip_county_crosswalk(zip,county_fips,state_code) VALUES ('08540','34021','NJ'),('19103','42101','PA'),('19401','42091','PA');
    INSERT INTO fema_disasters(disaster_number,county_fips,ia_designated,sep_end_date,updated_at) VALUES(9999,'34021',true,CURRENT_DATE+10,'2026-04-25');`);
  const base=(await pg.query("SELECT get_available_seps('08540') result")).rows[0].result;
  const migration=readFileSync(new URL('../supabase/migrations/078_fema_county.sql',import.meta.url),'utf8');
  await pg.exec(migration);
  const lookup=async zip=>(await pg.query('SELECT get_available_seps($1) result',[zip])).rows[0].result;
  const disaster=async zip=>(await lookup(zip)).seps.find(s=>s.sep_type==='Disaster / Emergency SEP');
  assert.equal((await disaster('08540')).available,false);assert.equal((await disaster('08540')).evidence,'FEMA data unavailable');
  await pg.query("INSERT INTO fema_feed_snapshot VALUES(true,'live',now(),now(),$1)",[JSON.stringify([declarationToDisaster(row,iso,now)])]);
  assert.equal((await disaster('08540')).available,false);assert.equal((await disaster('19103')).available,true);assert.equal((await disaster('19401')).available,false);
  const other=r=>r.seps.filter(s=>s.sep_type!=='Disaster / Emergency SEP');assert.deepEqual(other(await lookup('08540')),other(base));
  await pg.exec("UPDATE fema_feed_snapshot SET fetched_at=now()-interval '25 hours'");assert.equal((await disaster('19103')).evidence,'FEMA data unavailable');
  await pg.exec("UPDATE fema_feed_snapshot SET status='unavailable',fetched_at=NULL,disasters='[]'");assert.equal((await disaster('19103')).available,false);
  await pg.exec(migration);assert.equal((await disaster('19103')).evidence,'FEMA data unavailable');
  const permissions=(await pg.query("SELECT has_function_privilege('anon','get_available_seps(text)','EXECUTE') allowed,has_function_privilege('anon','get_available_seps_before_fema_078(text)','EXECUTE') bypass")).rows[0];assert.equal(permissions.allowed,true);assert.equal(permissions.bypass,false);
 } finally {await pg.close()}
});

test('browser RPC overlay suppresses stale DB NJ and all disaster claims when live feed fails',()=>{
 const result={counties:[{county_fips:'34021'}],seps:[{sep_type:'Disaster / Emergency SEP',available:true,disasters:[{title:'stale NJ'}]},{sep_type:'Other',available:true}]};
 const live=withLiveFemaResult(result,{apiFailed:false,disasters:[declarationToDisaster(row,iso,now)],fetchedAt:iso},now);
 assert.equal(live.seps[0].available,false);assert.deepEqual(live.seps[0].disasters,[]);assert.deepEqual(live.seps[1],result.seps[1]);
 const failed=withLiveFemaResult(result,{apiFailed:true,disasters:[],fetchedAt:null},now);assert.equal(failed.seps[0].evidence,'FEMA data unavailable');assert.equal(failed.seps[0].available,false);
});
