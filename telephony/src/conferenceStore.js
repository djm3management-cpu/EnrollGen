import { randomUUID } from 'node:crypto';

export const checked = result => { if (result.error) throw result.error; return result.data; };
export class ConferenceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function createConferenceStore(db) {
  return {
    db,
    async get(callId) { return checked(await db.from('call_conferences').select('*').eq('call_id', callId).maybeSingle()); },
    async byParent(sid) { return checked(await db.from('call_conferences').select('*').eq('parent_call_sid', sid).maybeSingle()); },
    async participants(id) { return checked(await db.from('call_participants').select('*').eq('call_id', id).order('dial_started_at')); },
    async participant(id) { return checked(await db.from('call_participants').select('*').eq('id', id).maybeSingle()); },
    async patch(id, fields) { checked(await db.from('call_conferences').update(fields).eq('call_id', id)); },
    async patchParticipant(id, fields) { checked(await db.from('call_participants').update(fields).eq('id', id)); },
    async add(row) { return checked(await db.from('call_participants').insert({ id: randomUUID(), speaker: row.role, ...row }).select('*').single()); },
    async event(id, event, payload = {}) { checked(await db.rpc('conference_event', { p_call_id: id, p_event: event, p_payload: payload })); },
    async locked(id, action) {
      const token = randomUUID();
      if (!checked(await db.rpc('lock_call_conference', { p_call_id: id, p_token: token }))) {
        throw new ConferenceError(409, 'Call controls are updating. Please retry.');
      }
      try { return await action(await this.get(id)); }
      finally { checked(await db.from('call_conferences').update({ operation_token: null, operation_until: null })
        .eq('call_id', id).eq('operation_token', token)); }
    },
    async online(agent) {
      const rows = checked(await db.from('agent_phone_sessions').select('session_id')
        .eq('agent_id', agent).gte('expires_at', new Date().toISOString()).limit(1));
      return Boolean(rows?.length);
    },
    async reserve(agent, sid) {
      return checked(await db.rpc('reserve_conference_agent', { p_call_sid: sid, p_agent_id: agent })) === true;
    },
    async release(agent, sid) { checked(await db.rpc('release_call_agent', { p_agent_id: agent, p_call_sid: sid })); },
    async transfer(id, participant) { checked(await db.rpc('complete_conference_agent_transfer', { p_call_id: id, p_participant_id: participant })); },
    async finish(id) { checked(await db.rpc('finish_call_conference', { p_call_id: id })); },
    async active() { return checked(await db.from('call_conferences').select('*').is('ended_at', null).limit(200)); },
    async pendingRecordings() { return checked(await db.from('call_participants').select('*').not('recording_sid', 'is', null)
      .is('recording_ingested_at', null).limit(100)); },
  };
}
