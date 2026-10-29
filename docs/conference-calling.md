# Conference calling

Branch: `feat/conference-calling`. The feature is off unless Railway has `CONFERENCE_CALLING_ENABLED=true`. No production migration, deployment, or environment change is part of this branch's implementation.

## Design decision

This uses **approach (b): upgrade a connected direct call on demand**. Normal inbound selection, sticky preferences, round-robin, licensing checks, overflow, voicemail, outbound admission/DNC checks, reservations, Twilio tokens, and phone heartbeats keep their existing path. Add Person, Warm Transfer, Blind Transfer, and actual customer Hold request conversion only after both original legs have answered.

The conference name is `enrollgen-<call_records.id>`. Migration 121 atomically saves the conference and its initial participants before any redirect. The service verifies the real parent/child relationship and in-progress statuses with Twilio, starts recording/participant streams, then redirects the **child first**, followed by the parent. Redirecting the parent first risks terminating the Dial child. The original Dial action, agent-status callback, and parent-status callback now check persisted conference ownership before the existing attribution/release/finalization code. A Dial action during conversion returns conference TwiML instead of hanging up, rerouting, or prematurely completing the call. Unconverted calls use their old handlers.

Source references: [Twilio Call resource](https://www.twilio.com/docs/voice/api/call-resource), [Conference](https://www.twilio.com/docs/voice/twiml/conference), [participant controls](https://www.twilio.com/docs/voice/api/conference-participant-resource). Child/parent redirect timing and actual audio continuity still require the staging telephone test below; local provider tests cannot prove Twilio network timing.

## Controls and recovery

- **Add Person:** one US E.164 number, called from `TWILIO_PHONE_NUMBER`; the customer is not held. Country metadata rejects Canadian/Caribbean `+1` numbers. Existing tenant DNC checks also apply. All participants show ringing/connected/left; the third party has a Remove control that leaves the original conversation intact.
- **Warm Transfer:** customer is held with music; agent and destination share the conference privately. Complete Transfer unholds the customer; the original agent may then Leave Call. Cancel Transfer removes the destination and unholds the customer. Only confirmed conference membership enables completion.
- **Blind Transfer:** destination starts ringing, then the original agent leg is ended. On failure, a still-online and eligible original agent is reserved and rung again. An unavailable/busy original agent or a failed return call leads to voicemail. The customer leg remains the anchor throughout.
- **End Call** terminates all conference legs. **Leave Call** removes only the current agent and requires another connected person. After an internal warm handoff, the original agent's end control becomes Leave Call.
- A 15-second recovery sweep verifies provider leg state, repairs missed join/terminal callbacks and interrupted participant streams, and enforces transfer deadlines. A new browser invite has the configured ring timeout plus a 15-second callback allowance. Browser presence must remain absent for an additional 45 seconds after the server detects its lease loss before a surviving provider agent leg is removed; multiple live tabs count as online. If another person remains, customer/third-party conversation continues; otherwise the customer reaches voicemail.
- PostgreSQL operation leases serialize controls across Railway instances. Participant terminal state is monotonic; late callbacks cannot resurrect a removed person. Reservations remain call-SID scoped, including releases.

## Recording and three separate transcript sources

The old two-track parent stream cannot identify a third speaker once its outbound track becomes a conference mix. Each participant therefore gets a separate authenticated **inbound-only** Media Stream and its own Deepgram connection. Together, the customer and agent sources continue the existing dual-audio model; third-party speech is a third independent source, labeled `third_party` and tied to `participant_id`.

Twilio documents unidirectional streams as independently controlled [Stream resources](https://www.twilio.com/docs/voice/api/stream-resource); they can be stopped explicitly or when the call ends. The implementation **does not assume** an existing TwiML stream survives a redirect: participant streams start through REST before conversion, the old mixed stream is explicitly stopped, active streams are checked again after both redirects, and recovery restarts a missing stream under a new generation. Missed audio cannot be reconstructed from a failed live stream; stream failures are logged and the telephone acceptance test must check for gaps. [Media Streams overview](https://www.twilio.com/docs/voice/media-streams).

Continuous dual-channel recordings are started on the individual legs before conversion. They continue beyond TwiML changes and end with their respective legs; the customer's recording includes the shared conference after the original agent leaves, while the agent's recording also covers the private warm consultation. The original Dial recording is retained. This produces **overlapping recording artifacts on the same call record**, not one concatenated WAV. The existing recordings list exposes those artifacts. Signed recording callbacks preserve the real provider CallSid, while a service-only RPC binds every artifact to the original internal record and tenant. A recovery queue also fetches known RecordingSids after call closure if callbacks are missed. [Start a recording on a live call](https://www.twilio.com/docs/voice/api/recording).

Transcript persistence uses participant leases rather than the original agent reservation, so removing the agent or closing their browser does not stop customer/third-party persistence. Finals survive browser loss and late Deepgram flushes. A mounted outbound workspace flushes its latest browser checkpoint before conversion; failure blocks the handoff so it can be retried. Existing outbound transcript text/diarization is then captured before switching to the server writer, and existing inbound segments stay in the same aggregation. A call without a linked record first adopts/creates its canonical server session record. Third-party labels are retained in the live transcript, Calls playback transcript, call detail, and compliance review.

For an internal warm handoff, participant **role** changes to agent after completion, but its immutable **speaker** identity remains separate from the original agent. Record, session, transcript ownership, and the canonical attempt's disposition agent move atomically to the receiving EnrollGen agent. External warm transfers and all blind transfers retain the original disposition owner. The receiving agent should start/adopt the call workspace after Complete Transfer; before completion, the original agent still owns the canonical session.

## Data and access

Apply only the forward migration [121_conference_calling.sql](../supabase/migrations/121_conference_calling.sql), after migrations through 120 are present. It adds:

- `call_conferences`: canonical record/attempt, original/current owner, provider room, phase, hold/transfer deadlines, operation lease.
- `call_participants`: `call_id`, `role`, immutable `speaker`, `phone`, `twilio_call_sid`, `joined_at`, `left_at`, `added_by_agent_id`, internal agent slug, status, stream/recording bookkeeping. IDs are UUIDs; agent identifiers are existing telephony slugs.
- `conference_media_leases`: participant-specific, expiring stream ownership.
- `telephony_transcript_segments.participant_id` and the additional `third_party` speaker value. The existing positional transcript writer is upgraded to name its original columns.
- Service-only RPCs for preparation, reservations, locking, event logging, media leases, recording attribution, transcript persistence, internal attribution transfer, and finalization.

Participant/control tables and RPCs are inaccessible to `anon` and `authenticated`. Browser controls require Clerk authentication, active service-managed membership, tenant ownership, and current call ownership. Webhooks require Twilio signatures and matching account/participant IDs. Transfer events append to `call_records.metadata.conference_events` and the existing `telephony_events` ledger.

Turning the flag off blocks new conversion/dial operations and disables Add Person/Warm/Blind controls. Already converted calls retain cleanup/hold/end controls and drain through the callback/recovery path. With no active conferences and the flag off, the legacy handlers are used without conference lookups.

## Twilio console changes

No existing production number webhook or TwiML App URL needs changing. The existing account credentials must permit Calls updates/creation, Conferences participant updates, Streams, and Recordings. US outbound geographic permissions and the configured Twilio caller ID must already allow the destination numbers. Provider-created callbacks/streams get their URLs from `PUBLIC_BASE_URL`; no new Console callback registration is needed. A trial account may require verified test destinations.

For a separate staging number/account, configure that number's incoming Voice URL to the **staging** `/twilio/voice`, its call-status callback to the staging `/twilio/status`, and the staging TwiML App's Voice URL to `/api/voice/outbound`, matching the existing setup. Do not point a production number at a local development server.

## Two-phone manual acceptance script

Use a staging deployment and staging database, a browser/headset signed in as Agent A, Phone 1 as customer, and Phone 2 as the third party. Enable recording playback access and keep the provider/debugger and service logs available. Use consenting testers and distinct spoken markers. Do not run this against production as part of this branch review.

1. In staging, apply migration 121, configure the existing service variables plus `CONFERENCE_CALLING_ENABLED=true`, and point a staging frontend at the staging telephony service. Set the original agent Available with the phone registered. The same steps must be repeated with the flag false to verify disabled buttons and unchanged normal calling/routing.
2. **Baseline inbound:** Phone 1 calls the staging number. Answer in the browser; confirm both directions, separate agent/customer live transcript, and a normal disposition on hang-up. Verify a declined/unanswered first agent still overflows to another agent/voicemail, and verify sticky/direct-number routing with your existing staging roster.
3. **Add Person:** repeat inbound, say “customer before add” and “agent before add.” Click Add Person; enter Phone 2 as `+1...`. While Phone 2 rings, verify Phone 1 and the agent can still talk. Answer Phone 2. Say “third party joined,” “customer after add,” and “agent after add.” Check all three statuses and speaker labels. Remove Phone 2; confirm Phone 1/agent remain connected. End the call.
4. **Warm complete:** call again, choose Warm Transfer to Phone 2. Phone 1 must hear hold music and must not hear the private exchange; say “private consultation” on the agent/Phone 2 side. Complete Transfer; all three must hear each other. Click Leave Call. Phone 1 and Phone 2 must continue talking and producing customer/third-party transcript finals. Hang up Phone 1 and confirm Phone 2 is ended and the original record finalizes.
5. **Warm cancel:** repeat the consultation, then Cancel Transfer before completing. Phone 2 must disconnect, Phone 1 must resume with the original agent, and customer hold must clear. Repeat while Phone 2 is still ringing.
6. **Blind answered:** choose Blind Transfer to Phone 2. The agent leg must end immediately after the destination call is created; Phone 1 must stay connected. Answer Phone 2 and speak distinct customer/third-party markers for 20 seconds. Hang up Phone 1; verify cleanup and retained recording/transcript.
7. **Blind no answer, agent online:** leave Phone 2 unanswered. Keep Agent A's browser/phone registered and eligible. Within the ring timeout, callback allowance, and one recovery interval, Agent A must receive a return invite. Answer and confirm the customer is still there. Repeat without answering the return invite; Phone 1 must reach voicemail.
8. **Blind no answer, agent offline/busy:** while Phone 2 rings, make Agent A unavailable or disconnect their registered phone. Phone 1 must reach voicemail rather than an empty room. Leave a message and check it is attached to the same internal call record.
9. **Customer first:** during each of ringing-third-party, three-way, and warm consultation, hang up Phone 1. All other legs must close, hold and reservations must clear, and no invite may keep ringing. Replay a provider terminal callback in your staging tool if available; finalization must remain idempotent.
10. **Browser/heartbeat:** during three-way, close Agent A's browser or disconnect its network. Continue a Phone 1/Phone 2 conversation. They must remain connected with ongoing server transcript/recording. After the presence lease and recovery grace, the orphaned provider agent leg must be removed. Repeat during warm consultation and while the third party is still ringing; the customer must be reconnected to a remaining person or reach voicemail.
11. **Outbound:** have Agent A call Phone 1. Repeat Add Person, warm complete/cancel, and blind answered/no-answer using Phone 2. Check the outbound customer child survives removal of the original browser parent. Verify pre-conference speech is still retained in the saved transcript and recording artifacts.
12. **Internal warm transfer:** optionally use a second signed-in EnrollGen browser agent instead of Phone 2. Complete the warm handoff, let the original agent leave, and have the receiver adopt the workspace. Verify record/session/transcript/disposition ownership changed to that agent. Cancel a separate internal warm transfer and confirm ownership remains original and the receiver's reservation clears.
13. **Media evidence:** for every completed scenario, open that same internal call record's recordings list and transcript. Listen to the initial segment, the private consultation where applicable, the third-party section, and post-agent-departure speech. Check every spoken marker, actual role labels, timestamps and continuous customer audio around conversion. Confirm no Twilio media/participant errors, no permanently missing recordings, and no transcription gaps. If continuity fails, keep the flag off and retain the CallSid/StreamSid/RecordingSid evidence for investigation.

Local automated checks cover the state transitions, database authorization and leases, audio WebSocket routing with stubbed Deepgram tracks, provider recording requests/reconciliation, and unchanged legacy telephony behavior. They do not place real phone calls or prove real provider audio continuity.

Validation at implementation: all **247 telephony tests** passed (including the existing 222); **51 related frontend, session, transcript and checkpoint tests** passed; production Vite build and targeted ESLint passed. Re-run with:

```sh
npm --prefix telephony test
node --test tests/conference-checkpoint.test.js tests/crm-workspace.test.js tests/live-transcript.test.js tests/transcription-health.test.js tests/transcript-source.test.js tests/transcript-exit-flush.test.js tests/durable-transcripts.test.js tests/call-session-lifecycle.test.js
npm run build
```

## Changed files

Backend: `telephony/src/conferenceCalling.js`, `conferenceStore.js`, `conferenceGuard.js`, `conferenceRuntime.js`, `routes/conferenceCalling.js`, `media/conferenceMedia.js`; integration changes in `server.js`, `config.js`, `routes/twilioVoice.js`, `routes/twilioStatus.js`, `routes/voiceOutbound.js`, `media/mediaStream.js`, `media/deepgramTrack.js`, `transcripts.js`. Configuration/dependency files: `telephony/.env.example`, `telephony/package.json`, `telephony/package-lock.json`.

Frontend: `src/hooks/useConferenceCall.js`, `src/lib/conferenceCheckpoint.js`, `src/components/phone/ConferenceControls.jsx`, `ActiveCallExpanded.jsx`, `ActiveCallBar.jsx`, `src/context/InboundCallContext.jsx`, `src/hooks/useMergedTranscript.js`, `src/lib/transcriptionHealth.js`, `src/components/ScriptFlow.jsx`, `ScriptPrompter.jsx`, `MiniLiveTranscript.jsx`, `callLog/CallTranscriptPlayer.jsx`, `callDetail/CallDetailPanel.jsx`, `callDetail/ComplianceReviewModal.jsx`, `src/styles.css`.

Data/tests: `supabase/migrations/121_conference_calling.sql`, `telephony/tests/conferenceCalling.test.js`, `telephony/tests/helpers/conferenceHarness.js`, `telephony/tests/helpers/conference-schema.sql`, `tests/helpers/evidenceDb.js`, `tests/crm-workspace.test.js`, `tests/conference-checkpoint.test.js`, and this document.
