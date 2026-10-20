# Callbacks Only availability

The pre-implementation review found no per-agent vendor pause. `vendor-pause.js`
calls `set_vendor_pause(tenant_id, paused, actor)`, a tenant-wide control. The
Paragon matrix controls licensing/carrier eligibility, not an agent pause mode.

`callbacks_only` is a manual status with `available=false`. Vendor feeds,
Paragon ping/reservation/arrival selection, vendor sticky preferences and general
rotation continue requiring `available`. Customer sticky selection uses the new
service-only `claim_customer_call_agent` RPC, which also accepts `callbacks_only`.
It requires an idle phone, phone presence when enforced, and an active roster
entry. Offline and Busy agents cannot receive these calls. Outbound behavior is
unchanged, including allowing an agent to initiate an outbound call while Offline.

The status appears in the top-bar dropdown and cockpit buttons using the existing
theme. Like Available, selecting it waits for the phone's server acknowledgment.
An active call retains its reservation; manual changes set the after-call mode.
Completion restores Callbacks Only without exposing vendor capacity. Disconnect
or expired presence takes the phone Offline when presence enforcement is enabled.

Customer history/owner precedence and `STICKY_ROUTING_ENABLED` remain unchanged.
Publisher/aggregator-tagged traffic uses the original vendor preference RPC;
a recent matched Paragon ping uses the existing Paragon path. Untagged shared
number calls use normal customer routing. The existing provider metadata or
matched ping is therefore required to identify a vendor delivery as such.

The normal ring timeout is unchanged (`DIAL_TIMEOUT_SECONDS`, default 20 seconds).
After no answer, Busy, or failure, ordinary customer calls use Available-only
rotation with tried-agent exclusions. Other Callbacks Only agents are not overflow
targets. Exhausted capacity goes to voicemail. Matched Paragon deliveries retain
their existing rejection behavior on dial failure.

## Direct calls

There was no dedicated-number mapping in the previous inbound handler. The
telephony service now accepts optional `DIRECT_AGENT_NUMBERS`, a JSON object:

```json
{"+16095550101":"agent_slug"}
```

Only configure actual owned dedicated numbers and active roster slugs. Point those
numbers at the existing signed `/twilio/voice` webhook. No numbers are provisioned
by this feature. The signed `To` field selects the destination; arbitrary query or
body agent IDs are ignored. A dedicated number cannot be the shared
`TWILIO_PHONE_NUMBER`. Vendor traffic cannot use this direct customer path.

Direct routing works independently of the sticky feature flag or caller history.
An unavailable direct destination goes to voicemail; an eligible destination rings
with the normal timeout and then uses the existing Available-only overflow.
Without the environment mapping, existing shared-number behavior is unchanged.

## Rollout and verification

Apply only `109_callbacks_only_availability.sql` before the new telephony/frontend
release. The transaction adds customer-specific predicates and reservations, and
extends presence guards to the new status. It does not edit agent status rows,
release active calls, change vendor controls, or enable Wrap-up holds. Keep the
existing sticky feature flag and presence policy as configured. Deploy the updated
Railway service along with the frontend/Netlify functions through the normal Git
workflow. Configure direct numbers separately when their assignments are known.

Regression tests execute the new migration in PostgreSQL/PGlite and exercise the
signed voice and Dial-result routes, API authorization/persistence, dropdown and
cockpit selection, connection readiness, presence loss, call completion, repeated
claims, stale releases, vendor preferences, actual Paragon ping/arrival functions
(including a reservation made before the agent changed mode), timeout overflow,
voicemail, Available behavior, Offline exclusion and service-only RPC permissions.
