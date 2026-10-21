// Best-effort diagnostics are independent of the voice connection. Never send
// caller details, transcript text, tokens, URLs, or raw exception messages.
export function createVoiceTelemetry({ baseUrl, agentId, getToken, transport = globalThis.fetch }) {
  let clientSessionId = null;
  try { clientSessionId = globalThis.crypto?.randomUUID?.() || null; } catch { /* Diagnostics remain optional. */ }
  let pending = [], scheduled = false, sending = false;
  async function flush() {
    scheduled = false;
    if (sending || !pending.length) return;
    sending = true;
    const events = pending.splice(0, 20);
    try {
      const token = await getToken();
      if (!token) return;
      await transport(`${baseUrl}/api/voice/events`, {
        method: 'POST', keepalive: true, signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agent_id: agentId, client_session_id: clientSessionId, events }),
      });
    } catch { /* Telemetry must never interrupt the call or surface as a call error. */ }
    finally {
      sending = false;
      if (pending.length) schedule();
    }
  }
  function schedule() {
    if (scheduled || sending) return;
    scheduled = true;
    queueMicrotask(() => void flush());
  }
  return (event, details = {}) => {
    try {
      if (!baseUrl || !agentId) return;
      const sid = value => /^CA[0-9a-f]{32}$/i.test(value || '') ? value : null;
      pending.push({ event, client_at: new Date().toISOString(),
        call_sid: sid(details.callSid), sdk_call_sid: sid(details.sdkCallSid),
        phase: details.phase, reason: details.reason, device_sequence: details.deviceSequence,
        error_code: Number.isInteger(details.errorCode) ? details.errorCode : null });
      if (pending.length > 40) pending.shift();
      schedule();
    } catch { /* Diagnostic formatting is also isolated from call handling. */ }
  };
}
