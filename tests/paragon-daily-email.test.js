import assert from 'node:assert/strict';
import { test } from 'node:test';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createDailyHandler } from '../netlify/functions/paragon-daily-email.js';

const fixture = {call_id:'paragon-1',received_at:'2026-10-01T14:00:00Z',caller_phone:'+15551234567',caller_state:'FL',duration_seconds:110,billable:'yes',non_billable_reason:null,disposition_category:'completed',notes:'SECRET'};

async function run(calls) {
  const prior = {url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,resend:process.env.RESEND_API_KEY};
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  process.env.RESEND_API_KEY = 'test';
  const events = [];
  const db = {
    from() { return {select() { return this; },eq() { return this; },maybeSingle() { return Promise.resolve({data:{id:'source-1'},error:null}); }}; },
    rpc(name,args) {
      events.push([name,args]);
      if (name === 'paragon_vendor_report') return {range() { return Promise.resolve({data:calls,error:null}); }};
      return Promise.resolve({data:name === 'claim_paragon_report_email' ? 1 : null,error:null});
    },
  };
  const handler = createDailyHandler({now:() => new Date('2026-10-01T22:00:00Z'),makeDb:() => db,
    fetchImpl:async (_url,options) => { events.push(['send',JSON.parse(options.body)]); return {ok:true,json:async () => ({id:'email-1'})}; },
  });
  try { return {response:await handler(),events}; }
  finally {
    for (const [name,value] of [['SUPABASE_URL',prior.url],['SUPABASE_SERVICE_ROLE_KEY',prior.key],['RESEND_API_KEY',prior.resend]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('zero-call day is logged and not emailed', async () => {
  const {response,events} = await run([]);
  assert.equal(response.status,200);
  assert.ok(events.some(([name]) => name === 'claim_paragon_report_email'));
  assert.ok(!events.some(([name]) => name === 'send'));
});

test('daily attachment uses the report columns and logs the send', async () => {
  const {response,events} = await run([fixture]);
  assert.equal(response.status,200);
  const body = events.find(([name]) => name === 'send')[1];
  assert.equal(body.from,'reports@newgenhealthsolutions.com');
  assert.equal(body.reply_to,'mike@newgenhealthsolutions.com');
  assert.deepEqual(body.to,['dispo@paragonmedia.io']);
  const csv = Buffer.from(body.attachments[0].content,'base64').toString();
  assert.equal(csv.split('\r\n')[0],'call_id,received_at,caller_phone,caller_state,duration_seconds,billable,non_billable_reason,disposition_category');
  assert.ok(!csv.includes('SECRET'));
  assert.equal(events.find(([name]) => name === 'finish_paragon_report_email')[1].p_status,'sent');
});

test('only the 6 PM Eastern hour processes a day', async () => {
  const handler = createDailyHandler({now:() => new Date('2026-10-01T23:00:00Z'),makeDb:() => { throw Error('Unexpected database read'); }});
  assert.equal((await handler()).status,200);
});
