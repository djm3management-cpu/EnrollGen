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

## October 20, 2026 rollout

Migration 109 was applied to the EnrollGen production database before the Git push
and recorded in `supabase_migrations.schema_migrations`. The reviewed migration's
SHA256 is `8471a47338ac790f150fe294f2308be2f6731ca25fac14f5e330a801a0d62d39`.
Preflight found no availability status constraint requiring an enum expansion,
presence enforcement enabled, and Wrap-up holds disabled. No agent status rows or
active reservations were changed by the migration. Live read-only assertions
confirmed Offline exclusion, vendor exclusion, callback eligibility matching phone
presence, and service-only customer reservation RPC permissions. Existing
`STICKY_ROUTING_ENABLED` and direct-number assignments were not changed.

Validation: `npm run build` and `npm run lint` passed. All 210 telephony tests
passed (local test servers need permission to listen outside the sandbox). The
final app suite passed 430 of 431 tests; its only failure is the existing
`tests/housekeeping.test.js` diagnostic assertion in unchanged `src/lib/sepCms.js`
(8 `debugLog` occurrences versus 7 recognized static labels). The updated focused
API/routing/UI tests pass. No production test calls were placed and no
`netlify deploy --prod` command was run.
