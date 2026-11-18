// The ZIP to county loader (scripts/load_zip_county_crosswalk.js) against a
// small HUD layout fixture and a stub service client: batching, upsert
// payloads, conflict target, skipped rows and failure handling. No network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadZipCountyCrosswalk,crosswalkRows,parseCsv,CROSSWALK_TABLE} from '../scripts/load_zip_county_crosswalk.js';

const fixture=()=>readFile(new URL('./fixtures/zip-county-crosswalk-sample.csv',import.meta.url),'utf8');
function stubClient({failOn=null}={}){
 const calls=[];
 return {calls,from(table){return {upsert:async(rows,options)=>{
  calls.push({table,rows,options});
  return {data:null,error:calls.length===failOn?{message:'stub failure'}:null};
 }};}};
}
const EXPECTED=[
 {zip:'66210',county_fips:'20091',state_code:'KS',res_ratio:0.65},
 {zip:'66210',county_fips:'20209',state_code:'KS',res_ratio:0.3},
 {zip:'66001',county_fips:'20003',state_code:'KS',res_ratio:0.5},
 {zip:'66001',county_fips:'20001',state_code:'KS',res_ratio:0.5},
 {zip:'00601',county_fips:'72001',state_code:'PR',res_ratio:1},
 {zip:'66002',county_fips:'20003',state_code:'KS',res_ratio:1},
 {zip:'66004',county_fips:'20005',state_code:'KS',res_ratio:1},
];

test('the fixture parses to normalized rows; invalid rows are skipped and a repeat keeps the last',async()=>{
 const {rows,skipped}=crosswalkRows(await fixture());
 assert.deepEqual(rows,EXPECTED);
 assert.equal(skipped,4,'bad ZIP, bad state, empty and out of range ratio');
 assert.deepEqual(parseCsv('a,"b ""c"", d"\r\n1,2\n'),[['a','b "c", d'],['1','2']]);
});

test('rows are upserted in batches on (zip, county_fips) through the service client',async()=>{
 const client=stubClient();
 const result=await loadZipCountyCrosswalk({text:await fixture(),client,batchSize:3});
 assert.deepEqual(result,{rows:7,skipped:4,batches:3});
 assert.deepEqual(client.calls.map(call=>call.rows.length),[3,3,1]);
 for(const call of client.calls){
  assert.equal(call.table,CROSSWALK_TABLE);
  assert.equal(call.table,'ping_zip_county_crosswalk');
  assert.deepEqual(call.options,{onConflict:'zip,county_fips'});
 }
 assert.deepEqual(client.calls.flatMap(call=>call.rows),EXPECTED);
});

test('the default batch size sends a small file in one upsert, and lowercase headers are accepted',async()=>{
 const client=stubClient();
 const text='zip,county,usps_zip_pref_state,res_ratio\n66210,20091,ks,1\n';
 assert.deepEqual(await loadZipCountyCrosswalk({text,client}),{rows:1,skipped:0,batches:1});
 assert.deepEqual(client.calls[0].rows,[{zip:'66210',county_fips:'20091',state_code:'KS',res_ratio:1}]);
});

test('a failed batch stops the load, and bad input is refused before any upsert',async()=>{
 const client=stubClient({failOn:2});
 await assert.rejects(loadZipCountyCrosswalk({text:await fixture(),client,batchSize:3}),/Crosswalk batch 2 failed: stub failure/);
 assert.equal(client.calls.length,2);
 const untouched=stubClient();
 await assert.rejects(loadZipCountyCrosswalk({text:'ZIP,COUNTY\n66210,20091\n',client:untouched}),/missing columns: USPS_ZIP_PREF_STATE, RES_RATIO/);
 await assert.rejects(loadZipCountyCrosswalk({text:await fixture(),client:untouched,batchSize:0}),/positive integer/);
 await assert.rejects(loadZipCountyCrosswalk({text:'',client:untouched}),/empty/);
 assert.equal(untouched.calls.length,0);
});

test('the loader never downloads: no fetch, HTTP URL or network module in its source',async()=>{
 const source=await readFile(new URL('../scripts/load_zip_county_crosswalk.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|https?:\/\/|node:(https?|net)\b|—/);
});
