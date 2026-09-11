import { test } from 'node:test';
import assert from 'node:assert/strict';
for (const name of ['PUBLIC_BASE_URL','SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN',
  'TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY',
  'INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET']) process.env[name] = 'test';
const { supabase } = await import('../src/supabase.js');
const { routingReplay, sendRoutingTwiml } = await import('../src/routingReplay.js');
const rows = new Map();
supabase.from = () => ({
  insert: async ({request_key}) => {
    if (rows.has(request_key)) return {error:{code:'23505'}};
    rows.set(request_key, {response_xml:null}); return {};
  },
  select: () => ({eq: (_field,key) => ({single: async () => ({data:rows.get(key)})})}),
  update: data => ({eq: async (_field,key) => { Object.assign(rows.get(key), data); return {}; }}),
});
function response() {
  return {locals:{}, code:200, status(code){this.code=code;return this;},
    type(){return this;}, send(body){this.body=body;return this;}};
}
const request = sid => ({path:'/twilio/voice',body:{CallSid:sid},query:{}});
test('overlapping webhook delivery admits exactly one routing handler', async () => {
  let admitted = 0;
  const responses = Array.from({length:3}, response);
  await Promise.all(responses.map(res => routingReplay(request('CA1'), res, () => admitted++)));
  assert.equal(admitted,1);
  assert.deepEqual(responses.map(r => r.code),[200,503,503]);
});
test('retry receives original TwiML without rerunning assignment', async () => {
  const first = response();
  await routingReplay(request('CA2'),first,()=>{});
  const xml = '<Response><Dial><Client>a</Client></Dial></Response>';
  await sendRoutingTwiml(first,xml);
  const retry = response();
  await routingReplay(request('CA2'),retry,()=>assert.fail('Must not route twice'));
  assert.equal(retry.body,xml);
});
test('distinct reroute attempts have distinct replay keys', async () => {
  let admitted=0;
  for (const tried of ['a','a,b']) {
    await routingReplay({path:'/twilio/dial-result',body:{CallSid:'CA3'},query:{tried}},response(),()=>admitted++);
  }
  assert.equal(admitted,2);
});
test('missing call identity is rejected before routing', async () => {
  const res=response();
  await routingReplay(request(undefined),res,()=>assert.fail('Missing SID'));
  assert.equal(res.code,400);
});
