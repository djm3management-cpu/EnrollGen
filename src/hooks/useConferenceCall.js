import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithClerk } from '../lib/clerkFetch';
import { flushConferenceCheckpoint } from '../lib/conferenceCheckpoint';

const BASE = (import.meta.env.VITE_TELEPHONY_BASE_URL || '').replace(/\/$/, '');
export function useConferenceCall({ getToken, activeCall }) {
  const [enabled, setEnabled] = useState(false);
  const [agents, setAgents] = useState([]);
  const [conference, setConference] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const callSid = activeCall?.params?.twilioCallSid || activeCall?.call?.parameters?.CallSid;
  const conferenceCallId = activeCall?.params?.conferenceCallId;
  const key = conferenceCallId || callSid || '';
  const current = useRef(key);
  current.current = key;
  const request = useCallback(async (path, body) => {
    const response = await fetchWithClerk(getToken, `${BASE}/api/voice/conference-${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Conference controls are unavailable.');
    return result;
  }, [getToken]);
  useEffect(() => {
    let canceled = false;
    request('capabilities').then(result => { if (!canceled) { setEnabled(result.enabled === true); setAgents(result.agents || []); } }).catch(() => {});
    return () => { canceled = true; };
  }, [request, key]);
  useEffect(() => {
    let canceled = false, pending = false;
    setConference(null); setError(''); setBusy(false);
    async function refresh() {
      if (!key || pending) return;
      pending = true;
      try {
        const result = await request('status', conferenceCallId ? { callId: conferenceCallId } : { callSid });
        if (!canceled) { setEnabled(result.enabled); setConference(result.conference); }
      } catch (err) { if (!canceled && enabled) setError(err.message); }
      finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { canceled = true; window.clearInterval(timer); };
  }, [key, callSid, conferenceCallId, request, enabled]);
  const run = useCallback(async input => {
    if (!key || busy) throw new Error('Wait for the call controls to finish.');
    setBusy(true); setError('');
    try {
      if (!conference?.callId && ['dial', 'hold'].includes(input.action)) await flushConferenceCheckpoint(callSid);
      if (current.current !== key) throw new Error('This call has ended.');
      const result = await request('action', { ...(conference?.callId || conferenceCallId
        ? { callId: conference?.callId || conferenceCallId } : { callSid }), ...input });
      if (current.current === key) { setConference(result.conference); setEnabled(result.enabled); }
      return result.conference;
    } catch (err) { if (current.current === key) setError(err.message); throw err; }
    finally { if (current.current === key) setBusy(false); }
  }, [key, callSid, conferenceCallId, conference?.callId, busy, request]);
  return useMemo(() => ({ enabled, agents, conference, busy, error, run }), [enabled, agents, conference, busy, error, run]);
}
