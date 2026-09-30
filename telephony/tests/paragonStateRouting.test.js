import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeCarrier, eligibilityForAgent, decideParagonPing } from '../src/paragonEligibility.js';
import { csvReport } from '../../integrations/payloads.js';
import { createHandler } from '../../supabase/functions/get-availability/handler.js';
import { readParagonPing } from '../../supabase/functions/_shared/paragonPingAdapter.js';

const tenant = '00000000-0000-4000-8000-000000000001';
const source = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);
let db;
const migration = name => readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const ping = async (state,phone,callId,enabled=true) => (await db.query(
  'SELECT paragon_ping($1,$2,$3,$4,$5) AS decision',[hash,state,phone,callId,enabled])).rows[0].decision;

test('field adapter and public Paragon response use a configurable request mapping', async () => {
  assert.deepEqual(readParagonPing({ region:'KS',ani:'+15550000001',cid:'abc' },
    { state:'region',phone:'ani',call_id:'cid' }),
    { state:'KS',phone:'+15550000001',invalidPhone:false,callId:'abc' });
  let received;
  const handler = createHandler({
    rpc:async () => ({ data:{ authorized:true,consumer_name:'Paragon Media',feed:{ agents:[] } } }),
    paragonPing:async params => { received=params;return { data:{ available:false,reason:'routing_disabled' } }; },
    routingEnabled:false,fieldMap:JSON.stringify({ state:'region',phone:'ani',call_id:'cid' }),log:() => {},
  });
  const response = await handler(new Request('https://example.test/?region=KS&ani=%2B15550000001&cid=abc',
    { headers:{ 'x-api-key':'test' } }));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ available:false,reason:'routing_disabled' });
  assert.equal(received.p_state,'KS');
  assert.equal(received.p_phone,'+15550000001');
  assert.equal(received.p_call_id,'abc');
});

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tenants(id uuid PRIMARY KEY); INSERT INTO tenants VALUES ('${tenant}');
    CREATE TABLE lead_sources(id uuid PRIMARY KEY,tenant_id uuid,name text,type text,active boolean,ping_key_hash text);
    INSERT INTO lead_sources VALUES ('${source}','${tenant}','Paragon Media','publisher',true,'${hash}');
    CREATE TABLE availability_consumers(name text,active boolean,key_hash text);
    CREATE TABLE vendor_controls(tenant_id uuid,vendor_pause boolean,staffed_hours jsonb);
    INSERT INTO vendor_controls VALUES ('${tenant}',false,'{"timezone":"America/New_York","days":{}}');
    CREATE TABLE tenant_agents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,name text,npn text,agent_slug text,is_active boolean);
    INSERT INTO tenant_agents(tenant_id,name,npn,agent_slug,is_active) VALUES
      ('${tenant}','Mark','20856361','mark',true),
      ('${tenant}','Dylan Maria','22167368','dylan_maria',true),
      ('${tenant}','Mike','20574678','mike',true);
    CREATE TABLE agent_availability(agent_id text PRIMARY KEY,agent_name text,status text,available boolean,
      active_call_sid text,resume_status text,last_assigned_at timestamptz,toggled_at timestamptz);
    INSERT INTO agent_availability(agent_id,agent_name,status,available) VALUES
      ('mark','Mark','available',true),('dylan_maria','Dylan','available',true),('mike','Mike','available',true);
    CREATE TABLE call_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,call_duration_seconds integer,
      call_outcome text,app_written boolean,metadata jsonb DEFAULT '{}');
    CREATE TABLE inbound_calls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,twilio_call_sid text,
      from_number text,source_kind text,lead_source_id uuid,created_at timestamptz DEFAULT now(),duration_seconds integer,
      call_record_id uuid,status text,aggregator_call_id text,publisher text);
    CREATE FUNCTION agent_inbound_routable(text,text,boolean,text) RETURNS boolean LANGUAGE sql AS $$
      SELECT $2='available' AND $3=true AND $4 IS NULL $$;`);
  await db.exec(await migration('051_paragon_vendor_matrix.sql'));
  await db.exec(await migration('052_paragon_ping_and_claim.sql'));
  await db.exec(await migration('053_paragon_zip_and_reports.sql'));
});
after(async () => db?.close());

test('aliases, matrix existence and critical missing carrier define tiers', () => {
  assert.equal(normalizeCarrier('Centene'),'wellcare');
  assert.equal(normalizeCarrier('WellCare'),'wellcare');
  assert.equal(normalizeCarrier('Cigna'),'healthspring');
  assert.equal(normalizeCarrier('HealthSpring'),'healthspring');
  const full = { agent_id:'mark',id:'mark',state:'KS',carriers:{aetna:true,humana:true,uhc:true,wellcare:true,devoted:true,healthspring:true} };
  assert.equal(eligibilityForAgent({agent:{id:'mark'},state:'KS',rows:[full]}).tier,'full');
  assert.equal(eligibilityForAgent({agent:{id:'mark'},state:'NC',rows:[full]}).tier,'ineligible');
  assert.equal(eligibilityForAgent({agent:{id:'mark'},state:'KS',rows:[{...full,carriers:{...full.carriers,uhc:false}}]}).tier,'ineligible');
  assert.equal(eligibilityForAgent({agent:{id:'mark'},state:'KS',rows:[{...full,carriers:{...full.carriers,aetna:false}}]}).tier,'partial');
  const ncWithoutHumana = { ...full,state:'NC',carriers:{ ...full.carriers,humana:false } };
  assert.equal(eligibilityForAgent({agent:{id:'mark'},state:'NC',rows:[ncWithoutHumana]}).tier,'ineligible');
});

test('seed tiers match Mark, Dylan and Mike coverage', async () => {
  const rows = (await db.query(`SELECT a.agent_slug,paragon_agent_tier(a.agent_slug,'KS',$1) ks,
    paragon_agent_tier(a.agent_slug,'NC',$1) nc FROM tenant_agents a ORDER BY a.agent_slug`,[source])).rows;
  assert.deepEqual(rows.map(row => [row.agent_slug,row.ks,row.nc]),[
    ['dylan_maria','ineligible','ineligible'],['mark','full','ineligible'],['mike','ineligible','ineligible']]);
  await db.query(`UPDATE vendor_routing_config SET plan_year=2028 WHERE source_id=$1`,[source]);
  assert.equal((await db.query(`SELECT paragon_agent_tier('mark','KS',$1) AS tier`,[source])).rows[0].tier,'ineligible');
  await db.query(`UPDATE vendor_routing_config SET plan_year=2027 WHERE source_id=$1`,[source]);
});

test('ping logs all decision reasons and repeat pings reuse a 30 second reservation', async () => {
  assert.equal((await ping('NC','+15550000001','call-nc')).reason,'state_not_allowed');
  await db.query(`UPDATE vendor_routing_config SET allowed_states=array_append(allowed_states,'NC') WHERE source_id=$1`,[source]);
  assert.equal((await ping('NC','+15550000001','call-nc')).reason,'no_eligible_agent');
  await db.exec(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id='mark'`);
  assert.equal((await ping('KS','+15550000002','call-busy')).reason,'all_eligible_busy');
  await db.exec(`UPDATE agent_availability SET status='available',available=true WHERE agent_id='mark'`);
  const accepted = await ping('KS','+15550000003','call-ks');
  assert.equal(accepted.reason,'accepted_full');
  assert.equal((await ping('KS','+15550000003','call-ks')).agent_id,accepted.agent_id);
  const reservation = (await db.query(`SELECT * FROM paragon_agent_reservations WHERE reservation_key='id:call-ks'`)).rows[0];
  assert.ok(new Date(reservation.expires_at)-new Date(reservation.created_at)<=31000);
  assert.ok(new Date(reservation.expires_at)-new Date(reservation.created_at)>=29000);
  await db.exec(`UPDATE paragon_agent_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE reservation_key='id:call-ks'`);
  await db.exec(`UPDATE vendor_agent_state_eligibility SET aetna=false WHERE state='KS' AND agent_id=(SELECT id FROM tenant_agents WHERE agent_slug='mark')`);
  assert.equal((await ping('KS','+15550000004','call-partial')).reason,'accepted_partial');
  assert.equal(decideParagonPing({state:'KS',agents:[{tier:'partial',available:true,agent_id:'mark'}]}).reason,'accepted_partial');
  assert.equal((await db.query(`SELECT count(*) AS n FROM paragon_ping_decisions`)).rows[0].n,6);
});

test('claim only uses matching eligible reservation and sticky cannot bypass tier', async () => {
  await db.exec(`UPDATE vendor_agent_state_eligibility SET aetna=true WHERE state='KS' AND agent_id=(SELECT id FROM tenant_agents WHERE agent_slug='mark')`);
  await db.exec(`DELETE FROM paragon_agent_reservations; UPDATE agent_availability SET status='available',available=true,active_call_sid=NULL`);
  await ping('KS','+15550000005','call-sticky');
  const claim = (await db.query(`SELECT * FROM claim_paragon_call($1,$2,$3,$4,$5,$6)`,
    ['CA123','+15550000005','call-sticky',[],'mike',true])).rows[0];
  assert.equal(claim.agent_id,'mark');
  assert.equal(claim.caller_state,'KS');
  assert.equal(claim.claim_path,'reserved');
});

test('pause, staffed hours and kill switch override every tier', async () => {
  assert.equal((await ping('AR','+15550000006','disabled',false)).reason,'routing_disabled');
  await db.exec(`UPDATE vendor_controls SET vendor_pause=true`);
  assert.equal((await ping('AR','+15550000006','paused')).reason,'vendor_paused');
  await db.exec(`UPDATE vendor_controls SET vendor_pause=false,
    staffed_hours=jsonb_build_object('timezone','America/New_York','days',
      jsonb_build_object(lower(to_char(clock_timestamp() AT TIME ZONE 'America/New_York','Dy')),
        jsonb_build_object('enabled',false,'start','00:00','end','23:59')))`);
  assert.equal((await ping('AR','+15550000006','hours')).reason,'outside_staffed_hours');
});

test('sticky selection only wins within eligible full tier after reservation expires', async () => {
  await db.exec(`UPDATE vendor_controls SET staffed_hours='{"timezone":"America/New_York","days":{}}';
    DELETE FROM paragon_agent_reservations;
    UPDATE agent_availability SET status='available',available=true,active_call_sid=NULL`);
  assert.equal((await ping('AR','+15550000007','sticky')).available,true);
  await db.exec(`UPDATE paragon_agent_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE reservation_key='id:sticky'`);
  const claim = (await db.query(`SELECT * FROM claim_paragon_call($1,$2,$3,$4,$5,$6)`,
    ['CA124','+15550000007','sticky',[],'mark',true])).rows[0];
  assert.equal(claim.agent_id,'mark');
  assert.equal(claim.claim_path,'preferred');
});

test('a lost reserved agent falls through to another eligible agent', async () => {
  await db.exec(`DELETE FROM paragon_agent_reservations;
    UPDATE agent_availability SET status='available',available=true,active_call_sid=NULL`);
  const decision = await ping('AR','+15550000010','lost-agent');
  assert.equal(decision.available,true);
  await db.query(`UPDATE agent_availability SET status='busy',available=false WHERE agent_id=$1`,[decision.agent_id]);
  const claim = (await db.query(`SELECT * FROM claim_paragon_call($1,$2,$3,$4,$5,$6)`,
    ['CA125','+15550000010','lost-agent',[],null,true])).rows[0];
  assert.ok(claim);
  assert.notEqual(claim.agent_id,decision.agent_id);
  assert.equal(claim.caller_state,'AR');
});

test('wrong state calls appear in weekly reconciliation and daily CSV with 90 second dispute rule', async () => {
  await db.query(`INSERT INTO inbound_calls(tenant_id,twilio_call_sid,from_number,source_kind,lead_source_id,
    duration_seconds,status,confirmed_state,confirmed_zip,wrong_state)
    VALUES($1,'CAwrong95','+15550000008','publisher',$2,95,'completed','KS','66002',true),
      ($1,'CAwrong30','+15550000009','publisher',$2,30,'completed','KS','66002',true)`,[tenant,source]);
  const report = (await db.query(`SELECT paragon_weekly_reconciliation($1,now()-interval '1 day',now()+interval '1 day') AS report`,[tenant])).rows[0].report;
  assert.equal(report.wrong_state_calls.length,2);
  assert.deepEqual(report.wrong_state_calls.map(call => call.billing_dispute).sort(),[false,true]);
  const rows = (await db.query(`SELECT vendor_call_payload(id) AS payload FROM inbound_calls WHERE wrong_state ORDER BY twilio_call_sid`)).rows.map(row => row.payload);
  const csv = csvReport(rows);
  assert.match(csv,/wrong_state,zip,billing_dispute/);
  assert.match(csv,/"66002"/);
  assert.match(csv,/"true"/);
  assert.match(csv,/"false"/);
});
