import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { signalMediaLifecycle } from '../src/media/mediaLifecycle.js';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import WebSocket from 'ws';
for (const name of ['PUBLIC_BASE_URL', 'SUPABASE_URL']) process.env[name] = 'https://example.test';
for (const name of ['SUPABASE_SERVICE_ROLE_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','DEEPGRAM_API_KEY','INBOUND_VENDOR_API_KEY','CLERK_SECRET_KEY','AGENT_WS_SIGNING_SECRET']) process.env[name] = 'fixture';
const accountSid = 'AC' + '1'.repeat(32);
process.env.TWILIO_ACCOUNT_SID = accountSid;
const { createMediaServer, MEDIA_LIMITS } = await import('../src/media/mediaStream.js');
const { mintMediaStreamToken, verifyMediaStreamToken } = await import('../src/media/streamToken.js');
const { createMediaLeaseClient } = await import('../src/media/streamLease.js');
const { openDeepgramTrack,TRACK_LIMITS } = await import('../src/media/deepgramTrack.js');
const { mintAgentWsToken } = await import('../src/wsToken.js');

const pg = new PGlite();
const tenant = '00000000-0000-4000-8000-000000000001';
const sid = prefix => prefix + randomBytes(16).toString('hex');
const sql = (text, args = []) => pg.query(text, args);
const db = { rpc(name, input) {
  const entries = Object.entries(input);
  const query = sql('SELECT ' + name + '(' + entries.map(([key], index) => key + '=>$' + (index + 1)).join(',') + ') AS result', entries.map(([,value]) => value));
  return { abortSignal() { return query.then(({ rows }) => ({ data: rows[0].result })).catch(error => ({ error })); } };
} };
before(async () => {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE inbound_calls(id uuid PRIMARY KEY,tenant_id uuid,twilio_call_sid text,routed_agent_id text,ended_at timestamptz);
    CREATE TABLE telephony_call_attempts(id uuid PRIMARY KEY,tenant_id uuid,parent_call_sid text,
      agent_id text,inbound_call_id uuid,direction text,status text DEFAULT 'ringing',ended_at timestamptz);
    CREATE TABLE agent_availability(agent_id text PRIMARY KEY,active_call_sid text);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await pg.exec(readFileSync(new URL('../../supabase/migrations/074_media_stream_auth.sql', import.meta.url), 'utf8'));
  await pg.exec('SET ROLE service_role');
  await sql('INSERT INTO tenants VALUES($1)', [tenant]);
});
after(async () => pg.close());
async function seedCall(direction = 'inbound') {
  const claims = { callSid: sid('CA'), attemptId: randomUUID(), tenantId: tenant,
    agentId: 'agent-' + randomUUID(), inboundCallId: direction === 'inbound' ? randomUUID() : null, direction };
  if (claims.inboundCallId) await sql('INSERT INTO inbound_calls VALUES($1,$2,$3,$4,NULL)', [claims.inboundCallId,tenant,claims.callSid,claims.agentId]);
  await sql('INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,inbound_call_id,direction) VALUES($1,$2,$3,$4,$5,$6)',
    [claims.attemptId,tenant,claims.callSid,claims.agentId,claims.inboundCallId,direction]);
  await sql('INSERT INTO agent_availability VALUES($1,$2)', [claims.agentId,claims.callSid]);
  return claims;
}
function start(claims, streamSid = sid('MZ')) {
  return { event: 'start', streamSid, start: { streamSid, accountSid, callSid: claims.callSid,
    tracks: ['inbound','outbound'], mediaFormat: { encoding: 'audio/x-mulaw',sampleRate: 8000,channels: 1 },
    customParameters: { agentId: claims.agentId,attemptId: claims.attemptId,...(claims.inboundCallId ? { inboundCallId: claims.inboundCallId } : {}) } } };
}
const frame = (streamSid, track = 'inbound', audio = Buffer.alloc(160,255)) => ({ event: 'media',streamSid,
  media: { track,payload: audio.toString('base64') } });
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await new Promise(resolve => setTimeout(resolve,5)); }
}
async function harness(t, options = {}) {
  const events = [], tracks = [], clients = [];
  const media = createMediaServer({ waitForAnswer: false, transcriptWriter: () => () => {}, leases: createMediaLeaseClient(db),notify: (agentId,message) => events.push({ agentId,...message }),
    openTrack: ({ speaker,notify,timelineOrigin }) => {
      const track = { speaker,notify,timelineOrigin,audio: [],closed: false,send(chunk) { this.audio.push(chunk); },close() { this.closed = true; } };
      tracks.push(track); return track;
    }, ...options });
  const server = createServer(); server.on('upgrade',media.handleUpgrade);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'ws://127.0.0.1:' + server.address().port;
  async function connect(claims, token = mintMediaStreamToken(claims)) {
    const ws = new WebSocket(base + '/media/' + token); clients.push(ws);
    await once(ws,'open'); return ws;
  }
  t.after(async () => {
    for (const ws of clients) ws.terminate();
    for (const ws of media.wss.clients) ws.terminate();
    await new Promise(resolve => media.wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => setTimeout(resolve,5));
  });
  return { base,connect,events,tracks,media,clients };
}

test('unsigned, forged, expired, wrong-purpose and query-based upgrades are rejected before Deepgram', async t => {
  const h = await harness(t), claims = await seedCall(), token = mintMediaStreamToken(claims);
  assert.equal(verifyMediaStreamToken(token,Date.now() + 301000),null);
  assert.equal(verifyMediaStreamToken(mintAgentWsToken('agent','subject','session')),null);
  const forged = token.slice(0,-1) + (token.endsWith('A') ? 'B' : 'A');
  for (const path of ['/media','/media/' + forged,'/media/' + mintMediaStreamToken(claims,Date.now()-301000),'/media/' + token + '?agentId=other','/media/browser-token.signature']) {
    const status = await new Promise(resolve => {
      const ws = new WebSocket(h.base + path);
      ws.on('unexpected-response',(_request,response) => { response.resume(); ws.terminate(); resolve(response.statusCode); });
      ws.on('error',() => {});
    });
    assert.equal(status,401);
  }
  assert.equal(h.tracks.length,0);
});

test('valid stream routes both tracks and final transcripts only to the bound agent; stop releases lease', async t => {
  const h = await harness(t), claims = await seedCall(), ws = await h.connect(claims), message = start(claims);
  ws.send(JSON.stringify({ event: 'connected',protocol: 'Call',version: '1.0.0' }));
  ws.send(JSON.stringify(message));
  await until(() => h.tracks.length === 2);
  for (const track of ['inbound','outbound']) ws.send(JSON.stringify(frame(message.streamSid,track)));
  await until(() => h.tracks.every(track => track.audio.length === 1));
  for (const track of h.tracks) track.notify({ type: 'transcript',speaker: track.speaker,text: 'Fixture speech',isFinal: true });
  const transcripts = h.events.filter(event => event.type === 'transcript');
  assert.deepEqual(transcripts.map(event => event.speaker),['customer','agent']);
  assert.ok(transcripts.every(event => event.agentId === claims.agentId && event.inboundCallId === claims.inboundCallId));
  const closed = once(ws,'close');
  ws.send(JSON.stringify({ event: 'stop',streamSid: message.streamSid,stop: { callSid: claims.callSid,accountSid } }));
  assert.equal((await closed)[0],1000);
  await until(() => h.tracks.every(track => track.closed));
  await new Promise(resolve => setTimeout(resolve,10));
  assert.equal((await sql('SELECT count(*)::int AS n FROM media_stream_leases WHERE call_sid=$1',[claims.callSid])).rows[0].n,0);
});

test('mismatched agent, call, account, attempt, inbound ID and audio format are rejected without tracks', async t => {
  const h = await harness(t), claims = await seedCall();
  for (const mutate of [
    message => { message.start.customParameters.agentId = 'other-agent'; },
    message => { message.start.callSid = sid('CA'); }, message => { message.start.accountSid = 'other-account'; },
    message => { message.start.customParameters.attemptId = randomUUID(); },
    message => { message.start.customParameters.inboundCallId = randomUUID(); },
    message => { message.start.mediaFormat.sampleRate = 16000; },
  ]) {
    const ws = await h.connect(claims), message = start(claims), closed = once(ws,'close');
    mutate(message); ws.send(JSON.stringify(message)); assert.equal((await closed)[0],1008);
  }
  // A correctly signed token with forged ownership still fails persisted binding.
  const forged = { ...claims,agentId: 'other-agent' }, ws = await h.connect(forged), closed = once(ws,'close');
  ws.send(JSON.stringify(start(forged))); assert.equal((await closed)[0],1008);
  assert.equal(h.tracks.length,0);
});

test('second stream for the same call is rejected across separate server instances', async t => {
  const first = await harness(t), second = await harness(t), claims = await seedCall();
  const a = await first.connect(claims); a.send(JSON.stringify(start(claims))); await until(() => first.tracks.length === 2);
  const b = await second.connect(claims), closed = once(b,'close'); b.send(JSON.stringify(start(claims)));
  assert.equal((await closed)[0],1008); assert.equal(second.tracks.length,0);
  assert.equal(first.tracks[0].closed,false);
});

test('DB rejects terminal attempts, lost reservations, stale renewals and cross-tenant bindings', async () => {
  const claims = await seedCall(), lease = createMediaLeaseClient(db), owner = randomUUID();
  assert.equal(await lease.claim({ ...claims,tenantId: randomUUID() },sid('MZ'),owner),false);
  assert.equal(await lease.claim(claims,sid('MZ'),owner),true);
  assert.equal(await lease.renew(claims.callSid,randomUUID()),false);
  assert.equal(await lease.release(claims.callSid,randomUUID()),false);
  await sql('UPDATE agent_availability SET active_call_sid=NULL WHERE agent_id=$1',[claims.agentId]);
  assert.equal(await lease.renew(claims.callSid,owner),false);
  assert.equal(await lease.claim(claims,sid('MZ'),randomUUID()),false);
  await sql('UPDATE agent_availability SET active_call_sid=$1 WHERE agent_id=$2',[claims.callSid,claims.agentId]);
  await sql("UPDATE telephony_call_attempts SET status='completed',ended_at=now() WHERE id=$1",[claims.attemptId]);
  assert.equal(await lease.claim(claims,sid('MZ'),randomUUID()),false);
});

test('finished attempt can be replaced on reroute; its late close cannot release successor', async () => {
  const claims = await seedCall(), lease = createMediaLeaseClient(db), oldOwner = randomUUID(), newOwner = randomUUID();
  assert.equal(await lease.claim(claims,sid('MZ'),oldOwner),true);
  await sql("UPDATE telephony_call_attempts SET status='no-answer',ended_at=now() WHERE id=$1",[claims.attemptId]);
  const next = { ...claims,attemptId: randomUUID(),agentId: 'next-agent-' + randomUUID() };
  await sql('INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,inbound_call_id,direction) VALUES($1,$2,$3,$4,$5,$6)',
    [next.attemptId,tenant,next.callSid,next.agentId,next.inboundCallId,next.direction]);
  await sql('UPDATE inbound_calls SET routed_agent_id=$1 WHERE id=$2',[next.agentId,next.inboundCallId]);
  await sql('INSERT INTO agent_availability VALUES($1,$2)',[next.agentId,next.callSid]);
  assert.equal(await lease.claim(next,sid('MZ'),newOwner),true);
  assert.equal(await lease.release(claims.callSid,oldOwner),false);
  assert.equal(await lease.renew(claims.callSid,newOwner),true);
});

test('oversized frames, binary data, repeated starts and stream-ID substitution close the stream', async t => {
  const h = await harness(t), claims = await seedCall();
  for (const input of ['x'.repeat(MEDIA_LIMITS.frameBytes+1),Buffer.alloc(160),JSON.stringify(frame(sid('MZ')))]) {
    const ws = await h.connect(claims), closed = once(ws,'close'); ws.send(input);
    assert.ok([1008,1009].includes((await closed)[0]));
  }
  const ws = await h.connect(claims), message = start(claims);
  ws.send(JSON.stringify(message)); await until(() => h.tracks.length === 2);
  const closed = once(ws,'close'); ws.send(JSON.stringify(message)); assert.equal((await closed)[0],1008);
});

test('audio arriving during DB binding is bounded and opens no speech connections after timeout/overflow', async t => {
  let resolveClaim;
  const h = await harness(t,{ leases: { claim: () => new Promise(resolve => { resolveClaim = resolve; }),release: async () => true },
    limits: { ...MEDIA_LIMITS,pendingFrames: 2 } });
  const claims = await seedCall(), ws = await h.connect(claims), message = start(claims), closed = once(ws,'close');
  ws.send(JSON.stringify(message)); await until(() => resolveClaim);
  for (let n=0;n<3;n++) ws.send(JSON.stringify(frame(message.streamSid)));
  assert.equal((await closed)[0],1009); resolveClaim(true);
  await new Promise(resolve => setTimeout(resolve,5)); assert.equal(h.tracks.length,0);
});

test('anonymous/authenticated callers cannot read or mutate leases or execute lease RPCs', async () => {
  for (const role of ['anon','authenticated']) {
    await pg.exec('RESET ROLE; SET ROLE ' + role);
    await assert.rejects(sql('SELECT * FROM media_stream_leases'),/permission denied/);
    await assert.rejects(sql('DELETE FROM media_stream_leases'),/permission denied/);
    await assert.rejects(sql('SELECT renew_media_stream($1,$2)',['CA-forged',randomUUID()]),/permission denied/);
  }
  await pg.exec('RESET ROLE; SET ROLE service_role');
});

test('a timed out start cleans up a claim completing after the socket has gone', async t => {
  let resolveClaim; const releases = [];
  const h = await harness(t,{ limits: { ...MEDIA_LIMITS,startMs: 30 },leases: {
    claim: () => new Promise(resolve => { resolveClaim = resolve; }),
    release: async (...args) => { releases.push(args); return true; },
  } });
  const claims = await seedCall(), ws = await h.connect(claims), closed = once(ws,'close');
  ws.send(JSON.stringify(start(claims))); assert.equal((await closed)[0],1008);
  resolveClaim(true); await until(() => releases.length === 1);
  assert.equal(releases[0][0],claims.callSid); assert.equal(h.tracks.length,0);
});

test('expired leases can be replaced and cannot be renewed or released by the old owner', async () => {
  const claims = await seedCall(), lease = createMediaLeaseClient(db), oldOwner = randomUUID(), nextOwner = randomUUID();
  assert.equal(await lease.claim(claims,sid('MZ'),oldOwner),true);
  await sql("UPDATE media_stream_leases SET expires_at=now()-interval '1 second' WHERE call_sid=$1",[claims.callSid]);
  assert.equal(await lease.renew(claims.callSid,oldOwner),false);
  assert.equal(await lease.claim(claims,sid('MZ'),nextOwner),true);
  assert.equal(await lease.release(claims.callSid,oldOwner),false);
});

test('a live Deepgram drop delivers the correct speaker failure to the call owner browser', async t => {
  const sockets = [];
  class Socket extends EventEmitter {
    constructor() { super(); this.readyState=0; this.bufferedAmount=0; sockets.push(this); }
    send(_data,callback) { callback?.(); }
    terminate() { this.readyState=3; this.emit('close'); }
    close() { this.terminate(); }
  }
  const h = await harness(t,{ openTrack: options => openDeepgramTrack({ ...options,registerStream:()=>true,reserveReconnect:()=>true,onLimit:async()=>{},reportUsage:async()=>{},Socket }) });
  const claims = await seedCall(), ws = await h.connect(claims);
  ws.send(JSON.stringify(start(claims))); await until(() => sockets.length === 2);
  for (const socket of sockets) { socket.readyState=1; socket.emit('open'); }
  sockets[1].emit('error',new Error('agent drop'));
  const notification = h.events.find(event => event.type === 'transcription_error');
  assert.equal(notification.agentId,claims.agentId); assert.equal(notification.inboundCallId,claims.inboundCallId);
  assert.equal(notification.speaker,'agent'); assert.match(notification.message,/Agent transcription disconnected/);
  assert.ok(!h.events.some(event => event.type === 'transcription_error' && event.speaker === 'customer'));
});

test('renewal failure stops only transcription and reports both speaker failures', async t => {
  const lease = createMediaLeaseClient(db);
  const h = await harness(t,{ leases: { ...lease,renew: async () => { throw new Error('database unavailable'); } },
    limits: { ...MEDIA_LIMITS,renewMs: 20 } });
  const claims = await seedCall(), ws = await h.connect(claims), closed = once(ws,'close');
  ws.send(JSON.stringify(start(claims))); assert.equal((await closed)[0],1011);
  assert.deepEqual(h.events.filter(event => event.type === 'transcription_error').map(event => event.speaker),['customer','agent']);
  assert.equal((await sql('SELECT active_call_sid FROM agent_availability WHERE agent_id=$1',[claims.agentId])).rows[0].active_call_sid,claims.callSid);
});

test('a substituted stream SID on an active media packet is rejected', async t => {
  const h = await harness(t), claims = await seedCall(), ws = await h.connect(claims);
  ws.send(JSON.stringify(start(claims))); await until(() => h.tracks.length === 2);
  const closed = once(ws,'close'); ws.send(JSON.stringify(frame(sid('MZ'))));
  assert.equal((await closed)[0],1008); assert.ok(h.tracks.every(track => track.audio.length === 0));
});

function deepgramHarness(speaker, options = {}) {
  const sockets = [], messages = [], timers = new Map(), intervals = new Map();
  class Socket extends EventEmitter {
    constructor() { super(); this.readyState=0; this.bufferedAmount=0; this.sent=[]; sockets.push(this); }
    open() { this.readyState=1; this.emit('open'); }
    send(chunk,callback) { this.sent.push(chunk); callback?.(); }
    terminate() { this.readyState=3; this.emit('close'); }
    close() { this.terminate(); }
  }
  const schedule = (fn,delay) => { const key={}; timers.set(key,{fn,delay}); return key; };
  const track = openDeepgramTrack({ speaker,Socket,registerStream:()=>true,reserveReconnect:()=>true,onLimit:async()=>{},reportUsage:async()=>{},limits:{...TRACK_LIMITS,queueFrames:100,queueBytes:16*1024,reconnects:3},notify: event => messages.push(event),schedule,cancel: key => timers.delete(key),
    every: fn => { const key={}; intervals.set(key,fn); return key; },cancelEvery: key => intervals.delete(key), ...options });
  function retry() { assert.ok(sockets.length>1,'new speech opens a replacement after the old socket closes'); }
  return { sockets,messages,timers,intervals,track,retry };
}

test('both Deepgram tracks emit interim and segment-final results immediately on a shared audio timeline', () => {
  const origin = 10000;
  let clock = 20000;
  const customer = deepgramHarness('customer', { now: () => clock, timelineOrigin: origin });
  const agent = deepgramHarness('agent', { now: () => clock, timelineOrigin: origin });
  const result = (h, start, text, final) => h.sockets.at(-1).emit('message', Buffer.from(JSON.stringify({
    type: 'Results', start, duration: 1, is_final: final, speech_final: false,
    channel: { alternatives: [{ transcript: text }] },
  })));
  try {
    for (const h of [customer, agent]) { h.sockets[0].open(); h.track.send(Buffer.alloc(160), 500); }
    result(customer, 0, 'Caller speaking', false);
    const partial = customer.messages.at(-1);
    assert.equal(partial.isFinal, false); assert.equal(partial.timestamp, 10500);
    result(agent, 1, 'Agent answer', true);
    clock += 9000;
    result(customer, 0, 'Caller finished.', true);
    const final = customer.messages.at(-1);
    assert.equal(final.isFinal, true); assert.equal(final.segmentId, partial.segmentId);
    assert.ok(final.timestamp < agent.messages.at(-1).timestamp, 'arrival latency cannot reorder the speakers');
    result(customer, 2, 'Latest continuous speech', false);
    assert.equal(customer.messages.at(-1).text, 'Latest continuous speech');
    customer.sockets[0].emit('close');customer.track.send(Buffer.alloc(160),5000);customer.retry();customer.sockets[1].open();
    result(customer, 0, 'After reconnect', false);
    assert.equal(customer.messages.at(-1).timestamp, 15000);
    assert.equal(customer.messages.at(-1).startMs, 5000);
    assert.notEqual(customer.messages.at(-1).segmentId, partial.segmentId);
  } finally { customer.track.close(); agent.track.close(); }
});

test('media forwards Twilio timestamps and gives both channels the same timeline origin', async t => {
  const opened = [], sent = [];
  const h = await harness(t, { now: () => Date.now(), openTrack: options => {
    opened.push(options);
    return { send: (_audio, timestamp) => sent.push([options.speaker, timestamp]), close() {} };
  } });
  const claims = await seedCall(), ws = await h.connect(claims), message = start(claims);
  ws.send(JSON.stringify(message)); await until(() => opened.length === 2);
  for (const track of ['inbound', 'outbound']) {
    const audio = frame(message.streamSid, track); audio.media.timestamp = '240'; ws.send(JSON.stringify(audio));
  }
  await until(() => sent.length === 2);
  assert.equal(opened[0].timelineOrigin, opened[1].timelineOrigin);
  assert.deepEqual(sent, [['customer', 240], ['agent', 240]]);
});
for (const speaker of ['customer','agent']) {
  test(`Deepgram ${speaker} errors/close notify browser, reconnect with gap markers and stop after the configured three retries`, () => {
    const h = deepgramHarness(speaker); h.sockets[0].open();
    h.sockets[0].emit('error',new Error('drop')); h.sockets[0].emit('close');
    assert.equal(h.messages.filter(event => event.type==='transcription_error').length,1);
    assert.equal(h.messages.at(-1).speaker,speaker); assert.equal(h.messages.at(-1).status,'reconnecting');
    for (let n=1;n<=3;n++) {
      h.track.send(Buffer.alloc(160)); h.retry(); h.sockets[n].open();
      assert.equal(h.messages.at(-1).coverageGap,true); assert.ok(h.messages.at(-1).gapUntil);
      h.sockets[n].emit('message',Buffer.from(JSON.stringify({ type:'Results',is_final:true,channel:{alternatives:[{transcript:'Valid recovered speech'}]} })));
      assert.equal(h.messages.at(-1).type,'transcript'); assert.equal(h.messages.at(-1).speaker,speaker);
      h.sockets[n].emit('close');
    }
    assert.equal(h.messages.at(-1).status,'unavailable'); assert.equal(h.track.stats().exhausted,true);
    h.track.close(); assert.equal(h.timers.size,0); assert.equal(h.intervals.size,0);
  });
}

test('Deepgram CONNECTING queue, transport backpressure and provider Error messages are bounded/visible', () => {
  const h = deepgramHarness('agent');
  for (let n=0;n<1000;n++) h.track.send(Buffer.alloc(160));
  assert.ok(h.track.stats().queuedFrames<=100); assert.ok(h.track.stats().queuedBytes<=16*1024);
  assert.ok(h.messages.some(event => event.coverageGap));
  h.sockets[0].open(); h.sockets[0].bufferedAmount=65536; h.track.send(Buffer.alloc(160));
  assert.equal(h.track.stats().queuedFrames,1);
  h.sockets[0].bufferedAmount=0;
  const drain=[...h.timers.entries()].find(([,timer])=>timer.delay===20);assert.ok(drain);h.timers.delete(drain[0]);drain[1].fn();
  assert.equal(h.track.stats().queuedFrames,0);assert.equal(h.sockets.length,1);
  h.sockets[0].emit('message',Buffer.from('{"type":"Error"}'));
  assert.equal(h.messages.at(-1).status,'reconnecting');h.track.send(Buffer.alloc(160));h.retry();h.sockets[1].open();
  assert.equal(h.messages.at(-1).speaker,'agent'); h.track.close();h.sockets[1].terminate();
  assert.equal(h.timers.size,0); assert.equal(h.intervals.size,0);
});

test('Deepgram connect timeout notifies and retries; normal stop preserves final flush without reconnecting', () => {
  const timeout = deepgramHarness('customer');
  const entry = [...timeout.timers.entries()][0]; timeout.timers.delete(entry[0]); entry[1].fn();
  assert.equal(timeout.messages.at(-1).status,'reconnecting'); timeout.track.close(); assert.equal(timeout.timers.size,0);
  const h = deepgramHarness('agent'); h.sockets[0].open();
  h.sockets[0].close = () => { h.sockets[0].readyState=2; };
  h.track.close();
  h.sockets[0].emit('message',Buffer.from(JSON.stringify({ type:'Results',is_final:true,channel:{alternatives:[{transcript:'Last final speech'}]} })));
  assert.equal(h.messages.at(-1).text,'Last final speech');
  assert.ok(!h.messages.some(message => message.type === 'transcription_error'));
  h.sockets[0].emit('close'); assert.equal(h.timers.size,0); assert.equal(h.intervals.size,0);
});

test('production inbound parent/child identity accepts documented MZ start and denies child reservation', async t => {
  const claims={callSid:'CAa44621807f498d3dede1eb16ce02d192',attemptId:'fb43fb0a-cb98-47ca-837c-b889006de579',
    tenantId:tenant,agentId:'mike_shiomos',inboundCallId:'5fcbe3a8-887e-4b12-8275-8c6ae3e93508',direction:'inbound'};
  const childSid='CA060f237b887be453e64adf7698149a19';
  await sql('INSERT INTO inbound_calls VALUES($1,$2,$3,$4,NULL)',[claims.inboundCallId,tenant,claims.callSid,claims.agentId]);
  await sql('INSERT INTO telephony_call_attempts(id,tenant_id,parent_call_sid,agent_id,inbound_call_id,direction,status) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [claims.attemptId,tenant,claims.callSid,claims.agentId,claims.inboundCallId,'inbound','in-progress']);
  await sql('INSERT INTO agent_availability VALUES($1,$2)',[claims.agentId,childSid]);
  const lease=createMediaLeaseClient(db);
  assert.equal(await lease.claim(claims,sid('MZ'),randomUUID()),false);
  await sql('UPDATE agent_availability SET active_call_sid=$1 WHERE agent_id=$2',[claims.callSid,claims.agentId]);
  const h=await harness(t),ws=await h.connect(claims),packet=start(claims);
  ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
  ws.send(JSON.stringify({...packet,sequenceNumber:'1'}));
  await until(()=>h.tracks.length===2);
  for(const track of ['inbound','outbound'])ws.send(JSON.stringify({...frame(packet.streamSid,track),sequenceNumber:'2'}));
  await until(()=>h.tracks.every(track=>track.audio.length===1));
  assert.equal((await sql('SELECT active_call_sid FROM agent_availability WHERE agent_id=$1',[claims.agentId])).rows[0].active_call_sid,claims.callSid);
});

test('SM IDs from the old synthetic fixture are rejected and log only a reason',async t=>{
  const h=await harness(t),claims=await seedCall(),ws=await h.connect(claims);
  const lines=[],warn=console.warn;console.warn=line=>lines.push(line);
  try{const closed=once(ws,'close');ws.send(JSON.stringify(start(claims,sid('SM'))));assert.equal((await closed)[0],1008);}
  finally{console.warn=warn;}
  assert.deepEqual(lines,['[media] rejected: Invalid stream SID']);assert.equal(h.tracks.length,0);
});

test('forward SQL repair upgrades already-applied 074 and is safe to apply twice',async()=>{
  await pg.exec('RESET ROLE');
  const patch=readFileSync(new URL('../../supabase/patches/074_media_stream_sid_fix.sql',import.meta.url),'utf8');
  const legacy=patch.replace('^MZ[0-9a-fA-F]{32}$','^SM[0-9a-fA-F]{32}$');
  await pg.exec(legacy);await pg.exec('SET ROLE service_role');
  const claims=await seedCall(),owner=randomUUID();
  assert.equal(await createMediaLeaseClient(db).claim(claims,sid('MZ'),owner),false);
  await pg.exec('RESET ROLE');await pg.exec(patch);await pg.exec(patch);await pg.exec('SET ROLE service_role');
  assert.equal(await createMediaLeaseClient(db).claim(claims,sid('MZ'),owner),true);
  const rights=await sql("SELECT has_function_privilege('anon','claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid)','EXECUTE') AS anon,has_function_privilege('authenticated','claim_media_stream(text,uuid,text,uuid,uuid,text,text,uuid)','EXECUTE') AS authenticated");
  assert.deepEqual(rights.rows[0],{anon:false,authenticated:false});
});

test('media upgrade and failed lease logging never contains credentials or caller parameters',async t=>{
  const h=await harness(t),lines=[],warn=console.warn;console.warn=line=>lines.push(line);
  try{
    h.media.handleUpgrade({url:'/media/secret-capability.invalid'}, {write(){},destroy(){}},Buffer.alloc(0));
    const badDb={rpc(){return {abortSignal:async()=>({data:false})};}};
    assert.equal(await createMediaLeaseClient(badDb).claim({callSid:'secret-call',agentId:'secret-agent'},'MZsecret','secret-owner'),false);
  }finally{console.warn=warn;}
  assert.deepEqual(lines,['[media] rejected: invalid_upgrade_token_or_path','[media] rejected: lease_claim_denied']);
});

test('Deepgram flushes the last short-call final after media stop', () => {
  const h = deepgramHarness('customer'); h.sockets[0].open(); h.track.close();
  assert.ok(h.sockets[0].sent.some(value => value === JSON.stringify({type:'CloseStream'})));
  h.sockets[0].emit('message',Buffer.from(JSON.stringify({type:'Results',is_final:true,start:1,duration:0.5,
    channel:{alternatives:[{transcript:'Last words'}]}})));
  assert.equal(h.messages.at(-1).text,'Last words'); assert.equal(h.messages.at(-1).startMs,1000);
  h.sockets[0].terminate();assert.equal(h.timers.size,0);
});

test('answer gate drops ringing audio and opens both tracks only after persisted answer, then closes on reroute', async t => {
  let answered = false, clock = Date.now();
  const origin = clock;
  const leases = { ...createMediaLeaseClient(db), answered: async () => answered };
  const h = await harness(t, { waitForAnswer: true, answerPollMs: 10, leases, now: () => clock });
  const claims = await seedCall(), ws = await h.connect(claims), packet = start(claims);
  ws.send(JSON.stringify(packet));
  await until(() => h.events.some(e => e.status === 'stream_started'));
  ws.send(JSON.stringify(frame(packet.streamSid)));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(h.tracks.length, 0);
  clock += 15000;
  answered = true;
  signalMediaLifecycle({ callSid: claims.callSid, attemptId: claims.attemptId });
  await until(() => h.tracks.length === 2);
  assert.ok(h.tracks.every(track => track.audio.length === 0));
  assert.ok(h.tracks.every(track => track.timelineOrigin === origin));
  ws.send(JSON.stringify(frame(packet.streamSid)));
  await until(() => h.tracks[0].audio.length === 1);
  const closed = once(ws, 'close');
  signalMediaLifecycle({ callSid: claims.callSid, attemptId: claims.attemptId, ended: true });
  await closed;
  assert.ok(h.tracks.every(track => track.closed));
  // The next agent's attempt starts fresh with no Deepgram connections.
  answered = false;
  const next = await seedCall(), nextWs = await h.connect(next), nextPacket = start(next);
  nextWs.send(JSON.stringify(nextPacket));
  await until(() => h.events.filter(e => e.status === 'stream_started').length === 2);
  nextWs.send(JSON.stringify(frame(nextPacket.streamSid)));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(h.tracks.length, 2);
});

test('answer evidence errors fail closed, while the kill switch restores pre-answer transcription', async t => {
  const leases = { ...createMediaLeaseClient(db), answered: async () => { throw new Error('unavailable'); } };
  const gated = await harness(t, { waitForAnswer: true, answerPollMs: 10, leases });
  const claims = await seedCall(), ws = await gated.connect(claims);
  ws.send(JSON.stringify(start(claims)));
  await until(() => gated.events.some(e => e.status === 'stream_started'));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(gated.tracks.length, 0);
  const legacy = await harness(t, { waitForAnswer: false, leases });
  const other = await seedCall(), otherWs = await legacy.connect(other);
  otherWs.send(JSON.stringify(start(other)));
  await until(() => legacy.tracks.length === 2);
});

test('STT usage counts audio bytes per connection, excludes keepalives and queued frames, and reports once across retries', async () => {
  const rows = [], claims = { tenantId: tenant, callSid: sid('CA') };
  const h = deepgramHarness('customer', { claims, reportUsage: async row => rows.push(row) });
  h.track.send(Buffer.alloc(8000)); // queued, then sent exactly once on open
  h.sockets[0].open();
  for (const keepalive of h.intervals.values()) keepalive();
  h.sockets[0].terminate();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 1);
  h.track.send(Buffer.alloc(4000));h.retry();h.sockets[1].open();
  h.track.close(); h.sockets[1].terminate(); h.track.close();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(rows.length, 2); assert.equal(rows[1].quantity, 0.5);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[1].metadata.call_sid, claims.callSid);
  assert.equal(rows[1].metadata.source, 'server');
  assert.equal(rows[1].metadata.track, 'customer');
  assert.equal(rows[1].metadata.model, 'nova-2');
});

test('voicemail explicitly stops the named media stream before greeting or recording', async () => {
  const {voicemailTwiml} = await import('../src/routes/twilioVoice.js');
  const xml=voicemailTwiml().toString();
  assert.match(xml, /<Stop><Stream name="agent-transcription"\/><\/Stop>/);
  assert.ok(xml.indexOf('<Stop>')<xml.indexOf('<Say'));
  assert.ok(xml.indexOf('<Stop>')<xml.indexOf('<Record'));
});

test('persisted answer lookup requires answer evidence and a nonterminal attempt', async () => {
  let row={answered_at:null,ended_at:null};
  const filters=[];
  const query={select(){return this;},eq(column,value){filters.push([column,value]);return this;},abortSignal(){return this;},async maybeSingle(){return {data:row};}};
  const leases=createMediaLeaseClient({from(table){assert.equal(table,'telephony_call_attempts');return query;}});
  const claims={attemptId:randomUUID(),callSid:sid('CA')};
  assert.equal(await leases.answered(claims),false);
  row={answered_at:new Date().toISOString(),ended_at:null};assert.equal(await leases.answered(claims),true);
  row.ended_at=new Date().toISOString();assert.equal(await leases.answered(claims),false);
  assert.deepEqual(filters.slice(0,2),[['id',claims.attemptId],['parent_call_sid',claims.callSid]]);
});

test('server STT writer uses one idempotent usage row and surfaces database errors', async () => {
  const {reportServerSttUsage}=await import('../src/sttUsage.js');
  const row={id:randomUUID(),record_type:'stt_seconds',quantity:1,tenant_id:tenant};
  const db={from(table){assert.equal(table,'usage_records');return {async upsert(actual,options){assert.equal(actual,row);assert.deepEqual(options,{onConflict:'id',ignoreDuplicates:true});return {};}};}};
  await reportServerSttUsage(row,db);
  await assert.rejects(reportServerSttUsage(row,{from:()=>({upsert:async()=>({error:new Error('database unavailable')})})}),/database unavailable/);
});


test('stop arriving during lease acquisition wins over a simultaneous answer and opens no Deepgram sockets', async t => {
  let resolveClaim;
  const leases={claim:()=>new Promise(resolve=>{resolveClaim=resolve;}),answered:async()=>true,release:async()=>true,renew:async()=>true};
  const h=await harness(t,{waitForAnswer:true,leases}),claims=await seedCall(),ws=await h.connect(claims),packet=start(claims);
  ws.send(JSON.stringify(packet));await until(()=>Boolean(resolveClaim));
  ws.send(JSON.stringify({event:'stop',streamSid:packet.streamSid,stop:{callSid:claims.callSid,accountSid}}));
  await new Promise(resolve=>setTimeout(resolve,15));
  const closed=once(ws,'close');resolveClaim(true);await closed;
  assert.equal(h.tracks.length,0);
});

test('failed socket writes are not counted as audio sent', async () => {
  const rows=[],claims={tenantId:tenant,callSid:sid('CA')};
  const h=deepgramHarness('agent',{claims,reportUsage:async row=>rows.push(row)});
  h.sockets[0].open();
  h.sockets[0].send=(_chunk,callback)=>callback(new Error('write failed'));
  h.track.send(Buffer.alloc(8000));
  await Promise.resolve();await Promise.resolve();
  assert.equal(rows.length,1);assert.equal(rows[0].quantity,0);
  h.track.close();
});

test('Railway cost switch defaults and explicit overrides are parsed by the production configuration', async () => {
  const {execFileSync}=await import('node:child_process');
  const script=`const {config}=await import('./src/config.js'); process.stdout.write(JSON.stringify([config.sttWaitForAnswer,config.deleteTwilioRecordingsAfterCopy]));`;
  for(const [wait,remove,expected] of [[undefined,undefined,[true,false]],['false','true',[false,true]],['true','false',[true,false]]]){
    const env={...process.env};delete env.STT_WAIT_FOR_ANSWER;delete env.DELETE_TWILIO_RECORDINGS_AFTER_COPY;
    if(wait!==undefined)env.STT_WAIT_FOR_ANSWER=wait;if(remove!==undefined)env.DELETE_TWILIO_RECORDINGS_AFTER_COPY=remove;
    const result=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env,encoding:'utf8'});
    assert.deepEqual(JSON.parse(result),expected);
  }
});

// Exercise the shared transport used by legacy and conference legs. Conference
// control behavior (including transfers/flag-off draining) is covered separately.
const { egressMetrics } = await import('../src/egressMetrics.js');
for (const scenario of ['normal hangup', 'three-way call', 'warm transfer', 'blind transfer', 'agent browser disconnect', 'stream error']) {
  test(`${scenario}: media sockets and tracks return to baseline`, async t => {
    const baseline = egressMetrics.snapshot().open.twilio_media || 0;
    const h = await harness(t);
    const count = scenario === 'three-way call' ? 3 : scenario.includes('transfer') ? 3 : 1;
    const legs = [];
    for (let i = 0; i < count; i++) {
      const claims = await seedCall(), ws = await h.connect(claims), packet = start(claims);
      ws.send(JSON.stringify(packet));
      legs.push({ claims, ws, packet });
    }
    await until(() => h.tracks.length === count * 2);
    assert.equal(egressMetrics.snapshot().open.twilio_media, baseline + count);
    for (const { claims, ws, packet } of legs) {
      if (scenario === 'normal hangup' || scenario === 'three-way call') {
        ws.send(JSON.stringify({ event: 'stop', streamSid: packet.streamSid, stop: { callSid: claims.callSid, accountSid } }));
      } else if (scenario === 'agent browser disconnect') ws.terminate();
      else if (scenario === 'stream error') [...h.media.wss.clients][0].emit('error', new Error('transport failure'));
      else signalMediaLifecycle({ callSid: claims.callSid, attemptId: claims.attemptId, ended: true });
    }
    await until(() => h.tracks.every(track => track.closed) && egressMetrics.snapshot().open.twilio_media === baseline);
  });
}

test('silent media transport expires after 45 seconds and closes its tracks', async t => {
  let clock = Date.now();
  const h = await harness(t, { now: () => clock });
  const claims = await seedCall(), ws = await h.connect(claims);
  ws.send(JSON.stringify(start(claims)));
  await until(() => h.tracks.length === 2);
  clock += 45001;
  // The watchdog ticks every five seconds; allow one real tick.
  await new Promise(resolve => setTimeout(resolve, 5100));
  assert.ok(h.tracks.every(track => track.closed));
});

test('a transient renewal transport error keeps the valid lease and transcription alive', async t => {
 let renewals=0;const claims=await seedCall();
 const h=await harness(t,{leases:{claim:async()=>true,renew:async()=>{if(++renewals===1)throw Error('transient');return true;},release:async()=>true},limits:{...MEDIA_LIMITS,renewMs:5},onUnexpectedStop:async()=>{assert.fail('Unexpected stop');}});
 const ws=await h.connect(claims);ws.send(JSON.stringify(start(claims)));await until(()=>renewals>=2);
 assert.equal(h.tracks.every(track=>!track.closed),true);
 // Cleanly terminate through the authenticated lifecycle rather than triggering an incident.
 signalMediaLifecycle({callSid:claims.callSid,attemptId:claims.attemptId,ended:true});
});

test('unexpected media disconnect persists its reason and alerts without waiting for reconnect exhaustion',async t=>{
 const persisted=[],alerts=[],claims=await seedCall();
 const h=await harness(t,{transcriptWriter:()=>message=>persisted.push(message),onUnexpectedStop:async event=>alerts.push(event)});
 const ws=await h.connect(claims);ws.send(JSON.stringify(start(claims)));await until(()=>h.tracks.length===2);ws.terminate();
 await until(()=>alerts.length===1);
 assert.equal(persisted.find(m=>m.type==='transcription_incident').reason,'media_transport_closed');
 assert.ok(h.events.some(m=>m.type==='transcription_error'&&m.status==='unavailable'));
 assert.equal(h.tracks.every(track=>track.closed),true);
});
