import twilio from 'twilio';
import { config } from './config.js';
import { supabase } from './supabase.js';
import { createConferenceStore, checked, ConferenceError } from './conferenceStore.js';
import { conferenceStreamUrl } from './media/conferenceMedia.js';
import { conferenceRuntime } from './conferenceRuntime.js';
import { callbackPayload } from './recordings.js';
import parsePhoneNumber from 'libphonenumber-js/max';
import { conferenceRequest, conferenceFailureLog } from './conferenceErrors.js';

export const US_PHONE = /^\+1[2-9]\d{2}[2-9]\d{6}$/;
export function validUsPhone(value) {
  if (typeof value !== 'string' || !US_PHONE.test(value)) return false;
  const phone = parsePhoneNumber(value, { defaultCountry: 'US', extract: false });
  return Boolean(phone?.country === 'US' && phone.isValid());
}
const terminal = new Set(['completed', 'canceled', 'failed', 'busy', 'no-answer']);
const live = p => p.status !== 'left';
export function createConferenceService({ store = createConferenceStore(supabase), settings = config,
  client = twilio(settings.twilioAccountSid, settings.twilioAuthToken, { timeout: 5000, autoRetry: false }),
  now = () => new Date().toISOString(), logError = entry => console.error(JSON.stringify(entry)) } = {}) {
  const url = path => settings.publicBaseUrl + path;
  const participantUrl = (p, action) => url(`/twilio/conference/${action}?participantId=${p.id}`);
  const fail = (status, message, code) => { throw new ConferenceError(status, message, code); };
  const provider = (operation, request) => conferenceRequest('twilio', operation, request);
  const patch = (c, fields) => store.patch(c.call_id, fields);
  async function roomSid(c) {
    if (c.twilio_conference_sid) return c.twilio_conference_sid;
    const [room] = await provider('conference_lookup', () => client.conferences.list({ friendlyName: c.name, status: 'in-progress', limit: 1 }));
    if (!room) fail(409, 'Conference is connecting. Please retry.');
    await patch(c, { twilio_conference_sid: room.sid });
    return room.sid;
  }
  async function hold(c, enabled) {
    const customer = (await store.participants(c.call_id)).find(p => p.role === 'customer' && live(p));
    if (!customer) fail(409, 'Customer is no longer connected.');
    const sid = await roomSid(c);
    await provider('customer_hold', () => client.conferences(sid).participants(customer.twilio_call_sid).update({
      hold: enabled, holdUrl: url('/twilio/conference/hold'), holdMethod: 'POST',
    }));
    await patch(c, { customer_held: enabled });
    await store.event(c.call_id, 'customer_hold_changed', { held: enabled });
  }
  function twiml(c, p) {
    const response = new twilio.twiml.VoiceResponse();
    // A redirect cannot be used as a promise that old streams survive. Give
    // every leg an independently authenticated, speaker-specific REST stream.
    response.dial({ action: participantUrl(p, 'exit'), method: 'POST' }).conference({
      startConferenceOnEnter: true, endConferenceOnExit: false, beep: false,
      participantLabel: p.id, waitUrl: url('/twilio/conference/hold'),
      statusCallback: url(`/twilio/conference/events?callId=${c.call_id}`),
      statusCallbackMethod: 'POST', statusCallbackEvent: 'start end join leave',
    }, c.name);
    return response.toString();
  }
  async function media(c, p, { recover = false } = {}) {
    p = await store.participant(p.id);
    if (!p.twilio_call_sid || !live(p)) return;
    const name = `conference-${p.id}`;
    let restart = !p.stream_sid;
    if (recover && p.stream_sid) {
      const lease = checked(await store.db.from('conference_media_leases').select('stream_sid,expires_at')
        .eq('participant_id', p.id).maybeSingle(), 'stream_health');
      const healthy = lease?.stream_sid === p.stream_sid && Date.parse(lease.expires_at) > Date.parse(now());
      const connecting = Date.parse(now()) - Date.parse(p.stream_requested_at) < 30000;
      restart = !healthy && !connecting;
    }
    if (restart) {
      // Streams REST supports create and stop only. Health comes from the
      // authenticated WebSocket lease and signed stream-status callbacks.
      if (p.stream_sid || p.stream_generation > 0) {
        try { await provider('stream_stop', () => client.calls(p.twilio_call_sid).streams(p.stream_sid || name).update({ status: 'stopped' })); }
        catch (error) { if (error.code !== 20404) throw error; }
      }
      // Explicitly release the previous generation before restart. A late close
      // cannot release its successor because lease owners are compared in SQL.
      await store.db.from('conference_media_leases').delete().eq('participant_id', p.id).then(checked);
      const generation = p.stream_generation + 1;
      await store.patchParticipant(p.id, { stream_generation: generation, stream_sid: null, stream_requested_at: now() });
      const stream = await provider('stream_create', () => client.calls(p.twilio_call_sid).streams.create({ name, track: 'inbound_track',
        url: conferenceStreamUrl({ ...p, ...c, id: p.id, stream_generation: generation }, settings),
        'parameter1.name': 'agentId', 'parameter1.value': c.owner_agent_id,
        'parameter2.name': 'attemptId', 'parameter2.value': c.attempt_id,
        statusCallback: participantUrl(p, 'stream-status'), statusCallbackMethod: 'POST',
      }));
      await store.patchParticipant(p.id, { stream_sid: stream.sid });
    }
    // Continuous per-leg dual-channel recordings survive TwiML changes and
    // retain private warm-consultation audio as well as the shared conversation.
    if (!p.recording_sid) {
      const recording = await provider('recording_start', () => client.calls(p.twilio_call_sid).recordings.create({ recordingChannels: 'dual', recordingTrack: 'both',
        recordingStatusCallback: participantUrl(p, 'recording'), recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['completed', 'absent'],
      }));
      await store.patchParticipant(p.id, { recording_sid: recording.sid });
    }
  }
  async function stop(p, { release = true } = {}) {
    if (!p.twilio_call_sid || !live(p)) return;
    try {
      const call = await provider('call_lookup', () => client.calls(p.twilio_call_sid).fetch());
      if (call.accountSid !== settings.twilioAccountSid) throw new Error('Account mismatch');
      if (!terminal.has(call.status)) await provider('call_end', () => client.calls(p.twilio_call_sid).update({ status: call.status === 'in-progress' ? 'completed' : 'canceled' }));
    }
    catch (error) { if (error.code !== 20404) throw error; }
    await store.patchParticipant(p.id, { status: 'left', left_at: now() });
    if (release && p.agent_id) await store.release(p.agent_id, (await store.get(p.call_id)).parent_call_sid);
  }
  async function snapshot(id) {
    const c = await store.get(id);
    if (!c) return null;
    return { callId: id, phase: c.phase, customerHeld: c.customer_held,
      transferParticipantId: c.transfer_participant_id, ownerAgentId: c.owner_agent_id,
      participants: (await store.participants(id)).map(p => ({ id: p.id, role: p.role, phone: p.phone,
        agentId: p.agent_id, status: p.status, joinedAt: p.joined_at, leftAt: p.left_at })) };
  }
  async function upgrade(attempt, phone) {
    if (!attempt.child_call_sid || attempt.ended_at || !attempt.answered_at) {
      fail(409, 'Wait for the connected call details to finish syncing.');
    }
    const existing = attempt.call_record_id && await store.get(attempt.call_record_id);
    if (existing) return existing;
    const [parent, child] = await Promise.all([
      provider('parent_lookup', () => client.calls(attempt.parent_call_sid).fetch()), provider('child_lookup', () => client.calls(attempt.child_call_sid).fetch()),
    ]);
    if (parent.accountSid !== settings.twilioAccountSid || child.accountSid !== settings.twilioAccountSid ||
      child.parentCallSid !== parent.sid || parent.status !== 'in-progress' || child.status !== 'in-progress') {
      fail(409, 'Both call participants must still be connected.');
    }
    if (!attempt.call_record_id) {
      const subject = checked(await store.db.from('availability_agent_subjects').select('clerk_user_id')
        .eq('tenant_id', attempt.tenant_id).eq('agent_slug', attempt.agent_id).eq('is_active', true).single());
      const owner = checked(await store.db.from('enrolled_agents').select('id').eq('tenant_id', attempt.tenant_id)
        .eq('clerk_user_id', subject.clerk_user_id).eq('is_active', true).single());
      const session = checked(await store.db.rpc('start_telephony_session', { p_tenant_id: attempt.tenant_id,
        p_agent_id: owner.id, p_call_sid: attempt.parent_call_sid, p_flow: 'ma' }));
      attempt = { ...attempt, call_record_id: session.call_record_id };
    }
    checked(await store.db.rpc('prepare_call_conference', { p_attempt_id: attempt.id,
      p_customer_phone: typeof phone === 'string' ? phone : null }));
    conferenceRuntime.draining = true;
    return store.get(attempt.call_record_id);
  }
  async function connectOriginal(c) {
    const participants = (await store.participants(c.call_id)).filter(live);
    if (participants.length < 2) fail(503, 'Conference setup is incomplete. Contact support with the request ID.', 'CONFERENCE_SETUP_INCOMPLETE');
    // Record/stream both legs before redirecting either. Keep the old recording
    // until Twilio ends Dial; the new recordings overlap that boundary.
    for (const p of participants) await media(c, p);
    try { await provider('legacy_stream_stop', () => client.calls(c.parent_call_sid).streams('agent-transcription').update({ status: 'stopped' })); }
    catch (error) { if (error.code !== 20404) throw error; }
    // Child first: redirecting the parent first would hang up Dial's child.
    // The legacy Dial action is intercepted below and joins the parent instead
    // of releasing/rerouting it. Persisted intent precedes both REST requests.
    for (const p of [...participants].sort((a) => a.twilio_call_sid === c.parent_call_sid ? 1 : -1)) {
      await provider('conference_redirect', () => client.calls(p.twilio_call_sid).update({ twiml: twiml(c, p) }));
    }
    for (const p of participants) await media(c, await store.participant(p.id));
    await patch(c, { phase: 'active', last_error: null });
    await store.event(c.call_id, 'upgraded');
  }
  async function dial(c, { mode, phone, targetAgentId }) {
    if (!['add', 'warm', 'blind'].includes(mode)) fail(400, 'Choose Add Person, Warm Transfer, or Blind Transfer.');
    if (!targetAgentId && !validUsPhone(phone)) fail(400, 'Enter a valid US E.164 number, such as +16095551234.');
    if (!validUsPhone(settings.twilioPhoneNumber)) fail(503, 'A US Twilio caller ID must be configured.', 'CONFERENCE_CALLER_ID_MISSING');
    if (targetAgentId && mode !== 'warm') fail(400, 'Agent destinations require Warm Transfer.');
    if ((await store.participants(c.call_id)).some(p => p.role === 'third_party' && live(p))) fail(409, 'Remove the existing third party first.');
    if ((await store.participants(c.call_id)).filter(live).length >= 3) fail(409, 'One agent must leave before adding another person.');
    if (targetAgentId) {
      const target = checked(await store.db.from('availability_agent_subjects').select('agent_slug')
        .eq('tenant_id', c.tenant_id).eq('agent_slug', targetAgentId).eq('is_active', true).maybeSingle());
      if (!target || targetAgentId === c.owner_agent_id || !(await store.online(targetAgentId)) || !(await store.reserve(targetAgentId, c.parent_call_sid))) {
        fail(409, 'That agent is unavailable.');
      }
    } else {
      const blocked = checked(await store.db.rpc('outbound_dnc_status', { p_phone: phone, p_tenant_id: c.tenant_id }));
      if (blocked !== false) fail(403, 'This number cannot be called (Do Not Call).');
    }
    let p;
    try {
      if (mode === 'warm') await hold(c, true);
      p = await store.add({ call_id: c.call_id, role: 'third_party', phone: targetAgentId ? null : phone,
        agent_id: targetAgentId || null, added_by_agent_id: c.owner_agent_id });
      await patch(c, { phase: mode === 'add' ? 'active' : mode, transfer_participant_id: p.id,
        transfer_deadline: new Date(Date.parse(now()) + (settings.dialTimeoutSeconds + 15) * 1000).toISOString() });
      const to = targetAgentId ? clientAddress(c, targetAgentId) : phone;
      const call = await provider('participant_dial', () => client.calls.create({ to, from: settings.twilioPhoneNumber, url: participantUrl(p, 'join'),
        method: 'POST', timeout: settings.dialTimeoutSeconds,
        statusCallback: participantUrl(p, 'status'), statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      }));
      await store.patchParticipant(p.id, { twilio_call_sid: call.sid });
      await store.event(c.call_id, `${mode}_dialed`, { participant_id: p.id, target_agent_id: targetAgentId || null });
      if (mode === 'blind') {
        for (const agent of (await store.participants(c.call_id)).filter(item => item.role === 'agent' && live(item))) {
          await stop(agent); await store.release(agent.agent_id, c.parent_call_sid);
        }
      }
    } catch (error) {
      if (p) await stop(await store.participant(p.id));
      if (targetAgentId) await store.release(targetAgentId, c.parent_call_sid);
      if (mode === 'warm') await hold(c, false);
      await patch(c, { phase: 'active', transfer_participant_id: null, transfer_deadline: null });
      throw error;
    }
  }
  function clientAddress(c, agent) {
    return `client:${agent}?${new URLSearchParams({ conferenceCallId: c.call_id, twilioCallSid: c.parent_call_sid,
      callerName: 'Conference call', callerPhone: '', direction: 'inbound' })}`;
  }
  async function voicemail(c) {
    await patch(c, { phase: 'voicemail', customer_held: false, transfer_deadline: null });
    for (const p of (await store.participants(c.call_id)).filter(item => item.role !== 'customer' && live(item))) await stop(p);
    const customer = (await store.participants(c.call_id)).find(p => p.role === 'customer' && live(p));
    if (!customer) return finish(c);
    const response = new twilio.twiml.VoiceResponse();
    response.say('The transfer could not be completed. Please leave a message after the tone.');
    response.record({ maxLength: 120, playBeep: true, recordingStatusCallback: participantUrl(customer, 'recording'),
      recordingStatusCallbackEvent: 'completed absent' });
    response.hangup();
    await provider('voicemail_redirect', () => client.calls(customer.twilio_call_sid).update({ twiml: response.toString() }));
    await store.event(c.call_id, 'voicemail_fallback');
  }
  async function fallback(c) {
    if (['recovering', 'voicemail', 'ended'].includes(c.phase)) return;
    await patch(c, { phase: 'recovering', transfer_deadline: new Date(Date.parse(now()) + (settings.dialTimeoutSeconds + 15) * 1000).toISOString() });
    await store.event(c.call_id, 'blind_fallback_requested');
    if (!(await store.online(c.original_agent_id)) || !(await store.reserve(c.original_agent_id, c.parent_call_sid))) return voicemail(c);
    const p = await store.add({ call_id: c.call_id, role: 'agent', agent_id: c.original_agent_id,
      phone: null, added_by_agent_id: c.original_agent_id });
    try {
      const call = await provider('agent_return_dial', () => client.calls.create({ to: clientAddress(c, c.original_agent_id), from: settings.twilioPhoneNumber,
        url: participantUrl(p, 'join'), method: 'POST', timeout: settings.dialTimeoutSeconds,
        statusCallback: participantUrl(p, 'status'), statusCallbackMethod: 'POST', statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] }));
      await store.patchParticipant(p.id, { twilio_call_sid: call.sid });
    } catch { await store.patchParticipant(p.id, { status: 'left', left_at: now() }); await voicemail(c); }
  }
  async function finish(c) {
    if (c.ended_at) return;
    for (const p of (await store.participants(c.call_id)).filter(live)) await stop(p, { release: false });
    if (c.twilio_conference_sid) await provider('conference_end', () => client.conferences(c.twilio_conference_sid).update({ status: 'completed' }));
    if (await store.finish(c.call_id)) await store.event(c.call_id, 'ended');
  }
  async function departed(c, p) {
    if (p.role === 'customer') return finish(c);
    if (p.agent_id) await store.release(p.agent_id, c.parent_call_sid);
    if (p.role === 'third_party') {
      if (c.phase === 'blind') return fallback(c);
      if (c.customer_held) await hold(c, false);
      await patch(c, { phase: 'active', transfer_deadline: null });
    }
    const others = (await store.participants(c.call_id)).filter(live);
    if (others.some(item => item.role !== 'customer' && item.status === 'connected')) {
      if (c.customer_held) await hold(c, false);
    } else if (!['blind', 'recovering'].includes(c.phase)) await voicemail(c);
    else if (c.phase === 'recovering' && p.role === 'agent') await voicemail(c);
  }
  async function action(callId, input) {
    return store.locked(callId, async c => {
      if (!c || c.ended_at) fail(409, 'This call has ended.');
      if (c.phase === 'upgrading') await connectOriginal(c);
      c = await store.get(callId);
      const people = await store.participants(callId);
      if (input.action === 'dial') await dial(c, input);
      else if (input.action === 'remove') {
        const p = people.find(item => item.id === input.participantId && item.role === 'third_party' && live(item));
        if (!p) fail(404, 'Third party is no longer on the call.');
        await stop(p); await departed(c, p);
      } else if (input.action === 'warm_cancel') {
        if (c.phase !== 'warm') fail(409, 'No warm transfer is in progress.');
        for (const p of people.filter(item => item.id === c.transfer_participant_id && live(item))) { await stop(p); if (p.agent_id) await store.release(p.agent_id, c.parent_call_sid); }
        await hold(c, false);
        await patch(c, { phase: 'active', transfer_participant_id: null, transfer_deadline: null });
        await store.event(callId, 'warm_canceled');
      } else if (input.action === 'warm_complete') {
        if (c.phase !== 'warm') fail(409, 'No warm transfer is in progress.');
        const target = people.find(p => p.id === c.transfer_participant_id && p.status === 'connected');
        if (!target) fail(409, 'Wait for the receiving person to connect.');
        await hold(c, false);
        await store.transfer(callId, target.id);
        await patch(c, { phase: 'warm_completed', transfer_deadline: null });
        await store.event(callId, 'warm_completed', { participant_id: target.id, receiving_agent_id: target.agent_id });
      } else if (input.action === 'hold') {
        if (c.phase === 'warm') fail(409, 'Complete or cancel the warm transfer to reconnect the customer.');
        await hold(c, input.held === true);
      }
      else if (input.action === 'leave') {
        const p = people.find(item => item.agent_id === input.actor && live(item));
        if (!p || !people.some(item => item.id !== p.id && item.role !== 'customer' && item.status === 'connected') || c.phase === 'warm') fail(409, 'Complete the transfer and keep another person connected before leaving.');
        await stop(p);
        await store.event(callId, 'agent_left');
      } else if (input.action === 'end') await finish(c);
      else fail(400, 'Unknown conference action.');
      return snapshot(callId);
    });
  }
  async function status(participantId, body) {
    const p = await store.participant(participantId);
    if (!p || (p.twilio_call_sid && p.twilio_call_sid !== body.CallSid)) fail(403, 'Participant mismatch.');
    if (!p.twilio_call_sid) {
      const destination = p.agent_id ? `client:${p.agent_id}` : p.phone;
      if (String(body.To || '').split('?')[0] !== destination) fail(403, 'Participant destination mismatch.');
      await store.patchParticipant(p.id, { twilio_call_sid: body.CallSid });
    }
    return store.locked(p.call_id, async c => {
      const current = await store.participant(p.id);
      if (current.status === 'left' || c.ended_at) return;
      if (terminal.has(body.CallStatus)) {
        await store.patchParticipant(p.id, { status: 'left', left_at: now() });
        await departed(c, current);
      }
      // 'answered' does not imply conference join. /events marks connected.
    });
  }
  async function joined(c, p) {
    if (p.status === 'left' || c.ended_at) return;
    await store.patchParticipant(p.id, { status: 'connected', joined_at: p.joined_at || now() });
    if (p.id === c.transfer_participant_id || (c.phase === 'recovering' && p.role === 'agent')) {
      await patch(c, { transfer_deadline: null, ...(c.phase === 'recovering' ? { phase: 'active' } : {}) });
    }
    if (p.status !== 'connected') await store.event(c.call_id, 'participant_joined', { participant_id: p.id, role: p.role });
  }
  async function reconcileRecordings() {
    for (const p of await store.pendingRecordings()) {
      try {
        const r = await provider('recording_lookup', () => client.recordings(p.recording_sid).fetch());
        if (r.accountSid !== settings.twilioAccountSid || r.callSid !== p.twilio_call_sid || !['completed', 'absent'].includes(r.status)) continue;
        const payload = callbackPayload({ AccountSid: r.accountSid, CallSid: r.callSid, RecordingSid: r.sid,
          RecordingStatus: r.status, RecordingSource: r.source, RecordingChannels: r.channels,
          RecordingDuration: r.duration, RecordingStartTime: r.startTime }, settings.twilioAccountSid);
        checked(await store.db.rpc('enqueue_conference_recording', { p_participant_id: p.id, p_callback: payload }));
        await store.patchParticipant(p.id, { recording_ingested_at: now() });
      } catch { /* Keep the durable work item for the next reconciliation. */ }
    }
  }
  async function tick() {
    // Existing conferences drain even after the kill switch is turned off.
    const rooms = await store.active();
    conferenceRuntime.draining = rooms.length > 0;
    for (const room of rooms) {
      try {
        await store.locked(room.call_id, async c => {
          if (c.phase === 'upgrading') { await connectOriginal(c); c = await store.get(c.call_id); }
          const people = await store.participants(c.call_id);
          if (!people.some(p => p.role === 'customer' && live(p))) { await finish(c); return; }
          for (const p of people.filter(item => item.status === 'left' && item.agent_id)) await store.release(p.agent_id, c.parent_call_sid);
          let members = [];
          if (c.phase !== 'voicemail') {
            const sid = await roomSid(c);
            members = await provider('participant_lookup', () => client.conferences(sid).participants.list({ limit: 20 }));
          }
          for (const p of (await store.participants(c.call_id)).filter(live)) {
            if (!p.twilio_call_sid) {
              if (Date.parse(now()) - Date.parse(p.dial_started_at) > 45000) { await store.patchParticipant(p.id, { status: 'left', left_at: now() }); await departed(c, p); }
              continue;
            }
            const call = await provider('call_lookup', () => client.calls(p.twilio_call_sid).fetch());
            if (call.accountSid !== settings.twilioAccountSid) throw new Error('Account mismatch');
            if (terminal.has(call.status)) { await store.patchParticipant(p.id, { status: 'left', left_at: now() }); await departed(await store.get(c.call_id), p); continue; }
            if (call.status === 'in-progress') await media(c, p, { recover: true });
            if (p.status === 'ringing' && members.some(m => m.callSid === p.twilio_call_sid)) await joined(c, p);
            if (p.agent_id && p.status === 'connected') {
              if (await store.online(p.agent_id)) { if (p.heartbeat_missing_at) await store.patchParticipant(p.id, { heartbeat_missing_at: null }); }
              else if (!p.heartbeat_missing_at) await store.patchParticipant(p.id, { heartbeat_missing_at: now() });
              else if (Date.parse(now()) - Date.parse(p.heartbeat_missing_at) > 45000) { await stop(p); await departed(await store.get(c.call_id), p); }
            }
          }
          c = await store.get(c.call_id);
          if (c.transfer_deadline && Date.parse(c.transfer_deadline) < Date.parse(now())) {
            for (const p of (await store.participants(c.call_id)).filter(item => item.status === 'ringing')) await stop(p);
            if (c.phase === 'blind') await fallback(c);
            else if (c.phase === 'recovering') await voicemail(c);
            else { if (c.customer_held) await hold(c, false); await patch(c, { phase: 'active', transfer_deadline: null }); }
          }
        });
      } catch (error) {
        if (!(error instanceof ConferenceError && error.status === 409)) {
          logError(conferenceFailureLog(error, { route: 'conference_recovery', call_id: room.call_id }));
          await store.patch(room.call_id, { last_error: 'recovery_pending' });
        }
      }
    }
    await reconcileRecordings();
  }
  return { store, upgrade, action, snapshot, status, tick, twiml, media, hold, departed, finish, roomSid, joined };
}

let singleton;
export const conferenceService = () => singleton ??= createConferenceService();
