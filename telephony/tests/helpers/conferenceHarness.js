import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { evidenceDb } from '../../../tests/helpers/evidenceDb.js';

export const settings = { publicBaseUrl: 'https://example.test',twilioAccountSid:'AC'+'a'.repeat(32),
 twilioAuthToken:'fixture',agentWsSigningSecret:'fixture',twilioPhoneNumber:'+16095551234',dialTimeoutSeconds:20,conferenceCallingEnabled:true };
export const sid = prefix => prefix + randomUUID().replaceAll('-', '');
export async function database() {
 const pg = new PGlite();
 await pg.exec(readFileSync(new URL('./conference-schema.sql',import.meta.url),'utf8'));
 const legacyWriterDefinition=(await pg.query("SELECT pg_get_functiondef('persist_telephony_transcript(uuid,uuid,text,text,timestamptz,integer,integer)'::regprocedure) definition")).rows[0].definition;
 await pg.exec(readFileSync(new URL('../../../supabase/migrations/121_conference_calling.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../../../supabase/migrations/122_conference_stream_recovery.sql',import.meta.url),'utf8'));
 const base=evidenceDb(pg);
 const scalar=['lock_call_conference','unlock_call_conference','finish_call_conference','reserve_conference_agent','prepare_call_conference','outbound_dnc_status','claim_conference_media','renew_conference_media','release_conference_media'];
 const db={...base,async rpc(name,args){const result=await base.rpc(name,args);if(scalar.includes(name)&&!result.error)result.data=result.data?.[0]?.[name];return result;}};
 return {pg,db,legacyWriterDefinition};
}
export async function seed(pg,direction='inbound') {
 const tenant=randomUUID(),owner=randomUUID(),receiver=randomUUID(),record=randomUUID(),attempt=randomUUID(),session=randomUUID(),inbound=randomUUID();
 const parent=sid('CA'),child=sid('CA'),original='original',target='receiver';
 await pg.query(`INSERT INTO tenants VALUES($1,'Agency','Agency');`,[tenant]);
 await pg.query(`INSERT INTO enrolled_agents VALUES($1,$2,'user','Original',true),($3,$2,'receiver-user','Receiver',true)`,[owner,tenant,receiver]);
 await pg.query(`INSERT INTO availability_agent_subjects VALUES($1,'user','org','original',true),($1,'receiver-user','org','receiver',true)`,[tenant]);
 await pg.query(`INSERT INTO agent_availability VALUES('original',$1,'busy','available',false,now(),now()),('receiver',NULL,'available',NULL,true,now(),now());`,[parent]);
 await pg.exec(`INSERT INTO agent_phone_sessions(agent_id,expires_at) VALUES('original',now()+interval '1 hour'),('receiver',now()+interval '1 hour');`);
 await pg.query(`INSERT INTO call_records(id,tenant_id,agent_id,agent_name,call_direction,call_type,product_type,call_start,session_id)
 VALUES($1,$2,$3,'Original',$4,'enrollment','MA',now()-interval '2 minutes',$5)`,[record,tenant,owner,direction,session]);
 await pg.query('INSERT INTO sessions VALUES($1,$2,$3,$4)',[session,tenant,owner,record]);
 await pg.query('INSERT INTO inbound_calls VALUES($1,$2,$3,$4,NULL)',[inbound,tenant,parent,'answered']);
 await pg.query(`INSERT INTO telephony_call_attempts(id,tenant_id,call_record_id,parent_call_sid,child_call_sid,agent_id,direction,inbound_call_id,answered_at,status)
 VALUES($1,$2,$3,$4,$5,'original',$6,$7,now()-interval '2 minutes','accepted')`,[attempt,tenant,record,parent,child,direction,direction==='inbound'?inbound:null]);
 return {tenant,owner,receiver,record,attempt,session,inbound,parent,child,original,target,
  call:(await pg.query('SELECT * FROM telephony_call_attempts WHERE id=$1',[attempt])).rows[0]};
}
export function provider(initial) {
 const calls=new Map(),recordings=new Map(),streams=new Map(),members=new Map(),operations=[],holds=[];
 let failDial=false;
 const addCall=(callSid,parent=null,status='in-progress')=>calls.set(callSid,{sid:callSid,parentCallSid:parent,accountSid:settings.twilioAccountSid,status});
 addCall(initial.parent);addCall(initial.child,initial.parent);
 function callResource(callSid){
  const streamResource=name=>({update:async value=>{operations.push(['stop-stream',callSid,name]);const stream=(streams.get(callSid)||[]).find(s=>s.sid===name||s.name===name);if(stream)Object.assign(stream,value);else throw Object.assign(Error('missing'),{code:20404});}});
  streamResource.create=async data=>{const stream={...data,sid:sid('MZ'),status:'in-progress'};streams.set(callSid,[...(streams.get(callSid)||[]),stream]);operations.push(['stream',callSid,data]);return stream;};
  return {fetch:async()=>{if(!calls.has(callSid))throw Error('unknown call');return structuredClone(calls.get(callSid));},
   update:async data=>{operations.push(['update',callSid,data]);const call=calls.get(callSid);Object.assign(call,data);
    if(['completed','canceled'].includes(data.status)){members.delete(callSid);for(const r of recordings.values())if(r.callSid===callSid)r.status='completed';}
    if(data.twiml?.includes('<Conference'))members.set(callSid,{callSid});
    return call;},streams:streamResource,
   recordings:{create:async data=>{const r={...data,sid:sid('RE'),callSid,accountSid:settings.twilioAccountSid,status:'in-progress',channels:2,duration:'120',source:'StartCallRecordingAPI',startTime:new Date().toISOString()};recordings.set(r.sid,r);operations.push(['record',callSid,data]);return r;}}};
 }
 callResource.create=async data=>{if(failDial)throw Error('provider failure');const id=sid('CA');addCall(id,null,'ringing');operations.push(['dial',id,data]);return calls.get(id);};
 const conferences=()=>{const people=id=>({update:async data=>{holds.push({id,...data});}});people.list=async()=>[...members.values()];return {participants:people,update:async data=>{operations.push(['conference',data]);}};};
 conferences.list=async()=>[{sid:'CF'+'c'.repeat(32)}];
 const client={calls:callResource,conferences,recordings:id=>({fetch:async()=>recordings.get(id)})};
 return {client,calls,recordings,streams,members,operations,holds,set failDial(value){failDial=value;}};
}
