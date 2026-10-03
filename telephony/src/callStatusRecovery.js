import twilio from 'twilio';

export const verifiedTerminalCallStatuses = new Set([
  'completed', 'canceled', 'failed', 'busy', 'no-answer',
]);

const RECOVERY_AGE_MS = 2 * 60 * 1000;
const RECOVERY_INTERVAL_MS = 60 * 1000;

// Only clear an old reservation after reading the exact call from Twilio.
// The database RPC repeats the age check and matches both agent and SID, so a
// callback or worker result for an older call cannot free a newer reservation.
export function startCallStatusRecoveryWorker({
  db,
  config,
  interval = setInterval,
  fetchCall,
  log = console.error,
  now = () => Date.now(),
}) {
  const client = twilio(config.twilioAccountSid, config.twilioAuthToken,
    { timeout: 8000, autoRetry: false });
  const fetchVerifiedCall = fetchCall || (sid => client.calls(sid).fetch());
  let running = null;
  const tick = () => {
    if (running) return running;
    running = (async () => {
      try {
        const cutoff = new Date(now() - RECOVERY_AGE_MS).toISOString();
        const { data: reservations, error } = await db.from('agent_availability')
          .select('agent_id,active_call_sid,last_assigned_at')
          .not('active_call_sid', 'is', null)
          .lt('last_assigned_at', cutoff)
          .limit(100);
        if (error) {
          log('Call status recovery reservation query failed');
          return;
        }
        for (const reservation of reservations || []) {
          const sid = reservation.active_call_sid;
          if (!sid || !reservation.agent_id) continue;
          let call;
          try {
            call = await fetchVerifiedCall(sid);
          } catch {
            // Network errors, not-found responses, and transient Twilio errors
            // are inconclusive; the reservation stays for the next tick.
            continue;
          }
          if (call?.sid !== sid || call?.accountSid !== config.twilioAccountSid ||
              !verifiedTerminalCallStatuses.has(call?.status)) continue;
          try {
            const { error: releaseError } = await db.rpc('release_verified_stale_call_agent', {
              p_agent_id: reservation.agent_id,
              p_call_sid: sid,
              p_twilio_status: call.status,
              p_verified_account_sid: call.accountSid,
              p_verified_call_sid: call.sid,
            });
            if (releaseError) log('Call status recovery release failed');
          } catch {
            log('Call status recovery release failed');
          }
        }
      } finally {
        running = null;
      }
    })();
    return running;
  };
  const timer = interval(() => void tick().catch(() => log('Call status recovery worker failed')),
    RECOVERY_INTERVAL_MS);
  timer.unref?.();
  void tick().catch(() => log('Call status recovery worker failed'));
  return { tick, stop: () => clearInterval(timer) };
}
