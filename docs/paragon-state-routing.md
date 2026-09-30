# Paragon state routing rollout

The Paragon matrix is maintained in **Agency Settings → Paragon state and carrier routing**. A row asserts that an agent is licensed in that state for the configured plan year. Its six carrier flags determine full, partial, or ineligible status. Changing the plan year starts with no eligible rows until that year's matrix is filled. Routing never reads the RTS tracker or compliance profiles.

## Deployment order

1. Apply Supabase migrations 051, 052, and 053 in order. Migration 051 corrects Dylan Maria's exact live roster record from NPN `22167368` to the confirmed `22167358`; review the seeded matrix in admin before enabling traffic.
2. Deploy the `get-availability` Edge Function, Netlify functions, frontend, and telephony service. Keep `PARAGON_STATE_ROUTING_ENABLED=false` in both Edge and telephony until the matrix and shared MA number are verified.
3. Set `PARAGON_PING_FIELD_MAP` on both Edge and telephony when Paragon confirms its field names. Default names are `state`, `phone`, and `call_id`; `caller_phone` and `aggregator_call_id` are also accepted. The caller state in the ping is authoritative. Twilio `FromState` is ignored.
4. Verify a Paragon ping and Twilio call with the same call ID or caller phone. A ping without either identifier returns unavailable because the call cannot safely recover its state. All calls to `TWILIO_PHONE_NUMBER` require a matching accepted ping while the flag is on.
5. Enable `PARAGON_STATE_ROUTING_ENABLED=true` in both Edge and telephony. Check `paragon_ping_decisions`, `paragon_agent_reservations`, call routing events, and the ZIP confirmation gate.

The default reservation TTL is 30 seconds and can be edited per vendor. Repeat pings with the same call ID, or phone when no ID is sent, reuse a live reservation. A call with no matching ping is rejected. If the reserved agent is no longer available, the call tries another eligible agent and rejects if none is free. There is no Paragon voicemail or retry queue.

The agent must confirm ZIP when the call connects. Ambiguous ZIPs require a residence state choice. A wrong state call stays blocked, creates an assigned callback, and appears in the daily CSV and weekly reconciliation. Billing disputes require at least 90 seconds of duration. Warm transfer is deferred until after AEP launch.

With the kill switch off, both ping endpoints return HTTP 200 and `{ "available": false, "reason": "routing_disabled" }` for authenticated Paragon requests. Legacy inbound routing remains active.
