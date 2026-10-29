import { conferenceService } from './conferenceCalling.js';
import { config } from './config.js';
import { enqueueBillingCallback } from './paragonBilling.js';
import { supabase } from './supabase.js';
import { conferenceRuntime } from './conferenceRuntime.js';

// Run before legacy attribution/replay/release. A Dial ending during upgrade
// is not a call ending; terminal agent callbacks must not finalize a customer
// conversation that continues after a transfer.
export function conferenceGuard(kind, serviceProvider = conferenceService) {
  return async (req, res, next) => {
    if (!config.conferenceCallingEnabled && !conferenceRuntime.draining) return next();
    try {
      const service = serviceProvider();
      const sid = kind === 'child' ? req.body.ParentCallSid : req.body.CallSid;
      const c = sid && await service.store.byParent(sid);
      if (!c) return next();
      if (req.body.AccountSid !== config.twilioAccountSid) return res.status(403).end();
      if (kind === 'dial') {
        const p = (await service.store.participants(c.call_id)).find(item => item.twilio_call_sid === c.parent_call_sid);
        if (c.ended_at || !p || p.left_at) return res.type('text/xml').send('<Response><Hangup/></Response>');
        return res.type('text/xml').send(service.twiml(c, p));
      }
      await enqueueBillingCallback(supabase, config, req.body);
      const p = (await service.store.participants(c.call_id)).find(item => item.twilio_call_sid === req.body.CallSid);
      if (p) await service.status(p.id, req.body);
      return res.status(204).end();
    } catch (error) {
      // Before migration 121, default-off installations retain their exact
      // legacy behavior. Never fail open on a database outage after rollout.
      if (!config.conferenceCallingEnabled && ['42P01', 'PGRST205'].includes(error.code)) return next();
      return res.status(503).end();
    }
  };
}
