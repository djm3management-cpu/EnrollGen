import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import process from 'node:process';
import { createHandler } from '../netlify/functions/paragon-vendor-report.js';

const token = 'a'.repeat(43);
const request = (query = '') => new Request(`https://example.com/vendor/paragon${query}`);

test('missing and bad tokens return 404 and never read calls', async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  try {
    const calls = [];
    const handler = createHandler(() => ({rpc(name,args) {
      calls.push([name,args]);
      return Promise.resolve({data:null,error:null});
    }}));
    for (const url of ['', '?token=bad']) {
      const response = await handler(request(url));
      assert.equal(response.status,404);
      assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');
    }
    assert.deepEqual(calls.map(([name]) => name),['authorize_paragon_report','authorize_paragon_report']);
    assert.ok(calls.every(([,args]) => args.p_hash === null));
  } finally { if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous; if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl; }
});

test('CSV and page expose only approved columns', async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  try {
    const row = {call_id:'vendor-1',received_at:'2026-10-01T14:00:00Z',caller_phone:'+15551234567',caller_state:'FL',duration_seconds:100,billable:'yes',non_billable_reason:null,disposition_category:'completed',app_written:true,name:'PRIVATE_NAME',notes:'PRIVATE_NOTES',transcript:'PRIVATE_TRANSCRIPT',recording_url:'PRIVATE_RECORDING'};
    const handler = createHandler(() => ({rpc(name) {
      if (name === 'authorize_paragon_report') return Promise.resolve({data:'source-id',error:null});
      if (name==='paragon_report_totals') return Promise.resolve({data:[{day:'2026-10-01',calls:1,billable:1,amount_due:28}],error:null});
      assert.equal(name,'paragon_vendor_report');
      return {range() { return Promise.resolve({data:[row,{...row,call_id:'vendor-2',disposition_category:'enrolled',app_written:false}],error:null}); }};
    }}));
    for (const format of ['', '&format=csv']) {
      const response = await handler(request(`?token=${token}&start=2026-10-01&end=2026-10-01${format}`));
      assert.equal(response.status,200);
      const body = await response.text();
      for (const secret of ['PRIVATE_NAME','PRIVATE_NOTES','PRIVATE_TRANSCRIPT','PRIVATE_RECORDING']) assert.ok(!body.includes(secret));
      if (format) {
        assert.equal(body.split('\r\n')[0],'call_id,received_at,caller_phone,caller_state,duration_seconds,billable,non_billable_reason,disposition_category,app_written,serviceability');
        assert.ok(body.includes(',"connected_no_sale","FALSE"'));
        assert.ok(body.includes(',"sale","TRUE"'));
      } else {
        assert.ok(body.includes('<th>app_written</th>'));
        assert.ok(body.includes('<td>connected_no_sale</td><td>FALSE</td>'));
        assert.ok(body.includes('<td>sale</td><td>TRUE</td>'));
      }
    }
  } finally { if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous; if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl; }
});

test('database report is scoped to the exact Paragon source', () => {
  const sql = readFileSync(new URL('../supabase/migrations/055_paragon_vendor_report.sql',import.meta.url),'utf8');
  const proof = readFileSync(new URL('../supabase/migrations/057_paragon_vendor_report_proof.sql',import.meta.url),'utf8');
  assert.match(sql,/s\.id=p_source_id/);
  assert.match(sql,/s\.tenant_id=i\.tenant_id AND s\.name='Paragon Media' AND s\.type='publisher'/);
  assert.match(sql,/i\.created_at >= p_start AND i\.created_at < p_end/);
  assert.match(proof,/d\.source_id=s\.id AND d\.matched_call_sid=i\.twilio_call_sid AND d\.available/);
  assert.ok(!sql.includes("'mentally_unfit'"));
  assert.ok(!sql.includes("'possible_cognitive_impairment'"));
});

test('serviceability count/filter and CSV identify only unserviceable calls without rewriting billing',async()=>{
 const previous={SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,SUPABASE_URL:process.env.SUPABASE_URL};
 process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.SUPABASE_URL='https://example.supabase.co';
 try{
  const rows=[{call_id:'dispute-1',received_at:'2026-10-01T14:00:00Z',caller_phone:'+15555550123',caller_state:'NY',billable:'yes',duration_seconds:120,disposition_category:'completed',serviceability:'Out of state: not serviceable'},
   {call_id:'callback-2',received_at:'2026-10-01T15:00:00Z',caller_state:'AZ',billable:'yes',disposition_category:'callback_scheduled',serviceability:'Paragon callback: out-of-state'}];
  const handler=createHandler(()=>({rpc(name){
   if(name==='authorize_paragon_report')return Promise.resolve({data:'source-id'});
   if(name==='paragon_report_totals')return Promise.resolve({data:[{day:'2026-10-01',calls:2,billable:2,amount_due:56}]});
   return {range:async()=>({data:rows})};
  }}));
  const query=`?token=${token}&start=2026-10-01&end=2026-10-01&serviceability=not_serviceable`;
  const page=await (await handler(request(query))).text();assert.ok(page.includes('Out of state: not serviceable: 1'));assert.ok(page.includes('1 shown'));assert.ok(page.includes('dispute-1'));assert.ok(!page.includes('callback-2'));assert.ok(page.includes('serviceability=not_serviceable'));assert.ok(page.includes('Daily totals (all calls)'));
  const csv=await (await handler(request(query+'&format=csv'))).text();assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes('NY'));assert.ok(csv.includes('"yes"'));assert.ok(csv.includes('Out of state: not serviceable'));assert.ok(!csv.includes('callback-2'));
  assert.equal((await handler(request(`?token=${token}&serviceability=invalid`))).status,400);
 }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
