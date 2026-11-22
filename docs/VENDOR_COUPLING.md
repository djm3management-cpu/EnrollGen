# EnrollGen Vendor Coupling Audit

Read-only audit. Date: 2026-11-20. Base: `pilot/release` at `5d24c9e`.
Companion design doc: [PORTABILITY_INTERFACES.md](./PORTABILITY_INTERFACES.md).

The goal: every vendor sits behind its own interface, can be swapped by config, and passes one shared conformance suite per interface. This doc maps where the code is tied directly to a vendor today. The companion doc proposes the interfaces.

Method: `git grep` over `src/`, `telephony/src/`, `netlify/`, `integrations/`, `supabase/functions/`, `scripts/`, `vite.config.js` and the SQL in `supabase/migrations/` and `supabase/bootstrap/`. Test files and Markdown are excluded from touchpoint counts. Line numbers are for `pilot/release` at `5d24c9e`.

---

## 0. Preflight results

| Check | Result |
|---|---|
| Current branch | `pilot/release` ✅ |
| Working tree | Clean, no uncommitted changes ✅ |
| Worktrees | One only: `~/Code/EnrollGen` on `pilot/release`. No other worktrees. |
| Stashes | None. |

| Branch | Local ref | `origin/<branch>` | Ref audited |
|---|---|---|---|
| `pilot/release` | `5d24c9e` 2026-11-16 13:24 -0500 | **No local remote-tracking ref** | local |
| `feature/ping-platform` | `6b332a9` 2026-11-18 17:58 -0500 | **No local remote-tracking ref** | local |
| `feature/gold-standards` | `ef2225b` 2026-11-19 00:23 -0500 | **No local remote-tracking ref** | local |
| `main` | `85d51d9` 2026-11-12 11:40 -0500 | `85d51d9` 2026-11-12 11:40 -0500 (same) | local (identical) |

Notes:
- Only `origin/main` exists as a remote-tracking ref for these four branches. The audit forbids `git fetch`, so the remote state of the other three can't be checked. The local refs were used. **If any of those branches were pushed from another machine, this audit may be stale for them.**
- Branch topology: `feature/ping-platform` is 90 commits ahead of `pilot/release` and 0 behind. `feature/gold-standards` contains all of `feature/ping-platform` plus 4 gold commits. `main` is 0 commits ahead of `pilot/release`, so every `main` commit is already in `pilot/release`. `main` is 29 commits behind.
- `main` deploys to production (AGENTS.md). Touchpoints that appear "only on main" are **older code that `pilot/release` has since replaced**. They describe what production runs today, not new work.

---

## 1. Summary

| # | Seam | Current vendor(s) | Code touchpoints (lines / files)¹ | Severity | Risk to live call routing |
|---|---|---|---|---|---|
| 1 | Phone carrier (voice + SMS) | Twilio (`twilio` ^5.10.3, `@twilio/voice-sdk` ^2.18.3) | 428 / 86, plus Twilio SIDs in ~600 SQL identifier uses | **HIGH** | Direct: this *is* call routing |
| 2 | Speech-to-text | Deepgram (raw WS + REST, no SDK); browser Web Speech API; Twilio `<Gather input=speech>` (ping branch) | 182 / 47 | **MEDIUM** | Indirect: live transcript and Co-Pilot, not routing |
| 3 | AI models | OpenAI (`openai` ^7.12.1, plus raw REST). Anthropic removed on `pilot/release`, **still live on `main`** | 43 / 17 (+ 9 on ping) | **MEDIUM** (LLM client: LOW; embeddings: HIGH) | None on pilot. On ping, the AI screener is in the inbound path. |
| 4 | Database | Supabase Postgres + PostgREST + Vault + Storage + Realtime + Edge | 890 / 212 JS lines; 207 `.rpc(` calls; 110 `auth.jwt()` in 31 migrations; 448 SECURITY DEFINER functions | **HIGH** | Direct: routing claims agents via RPCs |
| 5 | Login | Clerk (`@clerk/clerk-react` ^5.61.3, `@clerk/backend` ^2.33.0). No Supabase Auth code. | 513 / 152 (`clerk_user_id` appears 289× in schema) | **HIGH** | Indirect: agent voice token and WS auth |
| 6 | Recording storage | Twilio-hosted originals → Supabase Storage bucket `call-recordings` | Spread across telephony, netlify, integrations (see §6) | **HIGH** | Low: post-call |
| 7 | Hosting | Netlify (frontend + 72 functions), Railway (telephony, integrations-worker), Supabase Edge (1 function) | 117 / 82 | **MEDIUM** | Telephony host = routing host |
| 8 | Outbound connections | Paragon, GHL, Conversely, Sunfire IX, Stripe, Resend, Giphy, Biblia, FEMA, CSG (dormant), Nextcloud sidecar | Paragon 276/51, GHL 173/57, Conversely 147/24, IX 40/10, Stripe 87 lines, Resend 25/10 | Mixed (see §8) | Paragon is in the routing path |
| — | Noise suppression | DeepFilterNet3 via `@workadventure/noise-suppression` ^0.2.0 | 7 / 3 | LOW | None |
| — | Feature flags / kill switches | In-house `FEATURE_NAMES` registry + env | 14 central, ~95 call sites | LOW | `STICKY_ROUTING_ENABLED`, `CONFERENCE_CALLING_ENABLED`, `PARAGON_*` gate routing |
| — | Logging / error reporting | In-house JSON to stdout; alerts via Resend-shaped email + HMAC webhook. No Sentry/Datadog SDK. | — | LOW | None |

¹ Line-level pattern hits, deduplicated per seam, excluding tests, Markdown, and `scripts/security`. A "touchpoint" is one matching source line.

---

## 2. Seam 1: Phone carrier (Twilio)

**Vendors and versions:** `twilio` ^5.10.3 (telephony/package.json), `@twilio/voice-sdk` ^2.18.3 (package.json). TwiML via `twilio.twiml.VoiceResponse`. Twilio REST via both the SDK and hand-built `https://api.twilio.com/2010-04-01/...` URLs. Voice `<Say>` uses `voice: "Polly.Joanna"` (Amazon Polly through Twilio).

**Severity: HIGH.** TwiML is built inline next to routing, billing and Paragon business rules. Twilio SIDs are the primary identity for calls, legs, recordings, streams and conferences across the schema. 28 SQL CHECK/regex constraints and 26 JS regexes in 20 files enforce the `CA…`/`RE…`/`AC…`/`MZ…` SID format.

### 2.1 SDK imports (`import twilio from 'twilio'`)
- `telephony/src/routes/twilioVoice.js:6`, `:25`
- `telephony/src/routes/voiceOutbound.js:9`, `:22`
- `telephony/src/routes/sms.js:10`
- `telephony/src/conferenceCalling.js:3`, `:22`
- `telephony/src/supervisorWhisper.js:2`, `:30`
- `telephony/src/media/mediaStream.js:19`, `:45`
- `telephony/src/answerAttribution.js:3`, `:13`
- `telephony/src/callStatusRecovery.js:4`, `:22`, `:49`
- `telephony/src/paragonBilling.js:6`, `:30`, `:104`
- `telephony/src/lib/outboundSms.js:1`, `:18`
- `telephony/src/twilioSecurity.js:3`
- `telephony/src/voiceAccessToken.js:1`
- Browser: `src/context/InboundCallContext.jsx:532` (`import("@twilio/voice-sdk")`), `src/lib/browserPhone.js:3` (`new Device(token,{codecPreferences:['opus','pcmu']})`), `src/lib/supervisorWhisperPhone.js:4`
- Scripts: `scripts/pilot/local-load.mjs:12`, `:45`

### 2.2 Vendor wire format: TwiML built in business code
- **Inbound routing response.** `telephony/src/routes/twilioVoice.js:28-44` builds the voicemail: `<Stop><Stream>`, `<Say voice=Polly.Joanna>`, `<Record recordingStatusCallback>`, `<Hangup>`. `:46-50` builds the busy reject: `<Reject reason=busy>`. `:72-123` builds `dialAgentTwiml`: `<Start><Stream track=both_tracks>` with `<Parameter>`, `<Dial answerOnBridge record=record-from-answer-dual action=…>`, `<Client>` with `identity` and ten custom `<Parameter>`s (caller, lead score, Paragon flag, and more). Routing decisions in `:126-289` and `:291-389` return TwiML directly.
- **Outbound dial.** `telephony/src/routes/voiceOutbound.js:71-150` returns `<Say>` for DNC, invalid number or busy; `<Dial>` with `<Number statusCallback>` at `:131-141`.
- **Conference.** `telephony/src/conferenceCalling.js:49-60` uses `<Dial><Conference startConferenceOnEnter beep=false participantLabel waitUrl statusCallbackEvent='start end join leave'>`. `:226-231` redirects the customer to voicemail TwiML on transfer failure. `telephony/src/routes/conferenceCalling.js:129`, `:188` (hold music TwiML). `telephony/src/conferenceGuard.js:22`.
- **Whisper.** `telephony/src/supervisorWhisper.js:17-19` uses `<Conference coach=<agent leg> muted=true>`.
- `telephony/src/routingReplay.js` (`sendRoutingTwiml`) caches and replays TwiML by CallSid.

### 2.3 Vendor REST calls (call control)
| Capability | Location |
|---|---|
| Fetch call status | `answerAttribution.js:13`, `callStatusRecovery.js:24,51`, `paragonBilling.js:30,113-114` (`calls.list({parentCallSid})`), `parentCallStatus.js:4` (raw REST), `postCallStatus.js:12` (raw REST), `media/mediaStream.js:139` |
| Redirect a live call (TwiML swap) | `conferenceCalling.js:166`, `:231` |
| End a call | `conferenceCalling.js:111`, `supervisorWhisper.js:54` |
| Create an outbound call (participant / agent return) | `conferenceCalling.js:197-200`, `:242-244` |
| Conference lookup / end / participants | `conferenceCalling.js:34`, `:256`, `:380` |
| Hold / unhold participant | `conferenceCalling.js:43-44` |
| Coach (whisper) mute/unmute + verify | `supervisorWhisper.js:66`, `:132`, `:151` (`coaching:true, callSidToCoach`) |
| Start/stop media stream on a live call | `conferenceCalling.js:80`, `:88`, `:160`; `media/mediaStream.js:162`, `:167` |
| Start dual-channel recording on a live call | `conferenceCalling.js:99` (`recordingChannels:'dual'`) |
| Recording metadata / list / delete | `recordings.js:158`, `:220-238`; `recordingCompliance.js:41`; `conferenceCalling.js:354`; `integrations/ixUploads.js:56`; `netlify/functions/transcript-gaps-background.js:51` |
| Send SMS | `lib/outboundSms.js:13-15` (`messages.create` with `mediaUrl`, `statusCallback`), called from `routes/sms.js:198-203` |

### 2.4 Webhooks: signature and payload shape
- Signature: `telephony/src/twilioSecurity.js:9-22` (`twilio.validateRequest` over `publicUrl(req.originalUrl)` + form body). Used on every `/twilio/*` route.
- Routes that receive Twilio payloads: `/twilio/voice`, `/twilio/dial-result`, `/twilio/status`, `/twilio/agent-status`, `/twilio/recording`, `/twilio/sms`, `/twilio/sms-status`, `/twilio/conference/{events,exit,hold,join,recording,status,stream-status}`. On the ping branch, add `/twilio/screener/*`.
- Payload fields parsed (count of uses): `CallSid`(23) `From`(10) `To`(5) `RecordingSid`(5) `ParentCallSid`(5) `CallStatus`(5) `AccountSid`(5) `RecordingStatus`(4) `StreamSid`(3) `StatusCallbackEvent`(2) `RecordingSource`(2) `RecordingDuration`(2) `MessageSid`(2) `DialCallStatus`(2) `ConferenceSid`(2) `CallDuration`(2) `Body`(2) `SmsStatus` `SmsSid` `RecordingStartTime` `RecordingChannels` `ParticipantLabel` `NumMedia` + `MediaUrl{n}` `MessageStatus` `FriendlyName` `DialCallSid` `DialCallDuration` `DialBridged`.
- Recording callback validation: `telephony/src/recordings.js:27-46` (`AccountSid` must match, `RecordingDuration=-1` handling, `RecordingSource`).
- Inbound SMS: `telephony/src/routes/sms.js:41-43` (`NumMedia`/`MediaUrl{n}`), `:77-122` (replies with empty `<Response/>`), status `:126-128`.

### 2.5 Media streams wire format
- `telephony/src/media/mediaStream.js:25` maps `track` `inbound`→customer and `outbound`→agent. `:224-260` handles the Twilio Media Streams JSON (`event: connected|start|media|stop`, `start.customParameters`, `start.mediaFormat.encoding === 'audio/x-mulaw'`, `streamSid` must match `/^MZ[0-9a-fA-F]{32}$/` at `:254`, base64 `media.payload`).
- `telephony/src/media/mulaw.js` handles 8 kHz μ-law. `telephony/src/media/conferenceMedia.js:34` (`speakersFor` → `{inbound: speaker}`, one track per conference leg). `telephony/src/media/supervisorTap.js`, `supervisorListen.js` relay μ-law frames to supervisors.

### 2.6 Browser client credential and SDK
- Token minting: `telephony/src/voiceAccessToken.js:4-7` (`AccessToken` + `VoiceGrant{incomingAllow, outgoingApplicationSid: TWILIO_TWIML_APP_SID}`). Served by `telephony/src/routes/voiceToken.js:46`. Whisper coach token: `supervisorWhisper.js:118`.
- Browser device lifecycle: `src/context/InboundCallContext.jsx:507` (`updateToken`), `:528-599` (`registered`, `unregistered`, `error`, `tokenWillExpire`, `incoming`, `call.reject`, `cancel`, `disconnect`, `volume`, `getRemoteStream`), `:109`, `:337-420` (`call.parameters.CallSid`, custom params).

### 2.7 Vendor IDs stored in the database
`twilio_call_sid` (109 uses in bootstrap SQL), `parent_call_sid` (114), `p_call_sid` (134), `active_call_sid` (86), `recording_sid` (56), `call_sid` (39), `matched_call_sid` (30), `twilio_recording_sid` (26), `callback_call_sid` (24), `child_call_sid` (16), `wrap_up_call_sid` (14), `consumed_call_sid` (12), `twilio_number` (7), `expected_call_sid`, `twilio_conference_sid`, `stream_sid`, `twilio_message_sid`, `account_sid`, `twilio_status`. Recording storage path embeds them: `{tenant}/{parent_call_sid}/{recording_sid}.wav` (`telephony/src/recordings.js:185`). The Twilio client identity is the agent UUID (`twilioVoice.js:109`).

SID-format validation: 28 regex checks in 10 migration files; JS regexes in `integrations/recordingComplianceGrant.js`, `netlify/functions/{_recordingAccess,_telephonyLink,call-disposition,evidence-session,paragon-residence,post-call,stt-alert,stt-reconnect,stt-usage,transcript-gaps-background}.js`, `netlify/lib/postCallWork.js`, `src/lib/{debugLog,paragonResidence,telephonyCallIdentity,voiceTelemetry}.js`, `telephony/src/lib/evidenceAudit.js`, `telephony/src/recordings.js:14`, `telephony/src/routes/{conferenceCalling,voiceEvents}.js`.

### 2.8 Env vars
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_PHONE_NUMBER` (and `DEPLOYMENT_PROFILE_JSON.textSender`), `DIRECT_AGENT_NUMBERS`, `DIAL_TIMEOUT_SECONDS`, `DELETE_TWILIO_RECORDINGS_AFTER_COPY`. `telephony/src/config.js:11-21` hard-requires the five Twilio secrets at boot.

### 2.9 Number config
Phone numbers live in `DEPLOYMENT_PROFILE_JSON` (`agencyLine`, `textSender`), `TWILIO_PHONE_NUMBER` and `DIRECT_AGENT_NUMBERS`. Twilio-console-side config (voice URL → `/twilio/voice`, status callback, TwiML App voice URL → `/api/voice/outbound`, messaging webhook → `/twilio/sms`, A2P 10DLC brand and campaign) is **not in the repo**. See `telephony/CONTACTS_SMS_SETUP.md`. A new carrier needs these recreated by hand.

---

## 3. Seam 2: Speech-to-text (Deepgram)

**Vendors:** Deepgram, called directly over WebSocket and REST with no SDK. Model `nova-2` is hard-coded in five places. Other STT in use: the browser Web Speech API (`src/hooks/useSpeechRecognition.js:80`, used by the ACA, MedSup and U65 Co-Pilots, `PracticeVoice.jsx` and `AncillaryFlow.jsx`), and Twilio speech `<Gather>` on the ping branch only.

**Severity: MEDIUM.** The live server path is isolated in one module. But the browser opens Deepgram directly, three batch paths duplicate the Deepgram request and response parsing, and vendor labels are stored as data values.

### 3.1 Streaming (live)
- Server: `telephony/src/media/deepgramTrack.js:11-13` (URL + query: `encoding=mulaw&sample_rate=8000&channels=1&model=nova-2&punctuate&smart_format&interim_results&utterance_end_ms=1500&vad_events`), `:117` (`Authorization: Token`), `:145` (`KeepAlive`), `:157-163` (parses `channel.alternatives[0].transcript`, `words[0].start`, `is_final`), `:207` (`CloseStream`), `:48` (usage metadata `model:'nova-2'`). Channel assumption: **one mono track per Deepgram socket.** Dual audio is handled by opening one socket per speaker (`inbound`/`outbound` from Twilio's `both_tracks`), not by Deepgram multichannel.
- Browser (customer audio via screen capture): `src/hooks/useCustomerAudio.js:21` (`wss://api.deepgram.com/v1/listen?...`), `:28`, `:50-81` (token fetch), `:396-405` (`type==='Results'`, `channel.alternatives`, `is_final`), `src/lib/recoveringSttSocket.js:28` (same shape).
- Temporary key grant: `netlify/functions/deepgram-token.js:15` (`/v1/auth/grant`), `:50-66`.
- CSP: `scripts/security/browser-headers.mjs:56` allows `wss://api.deepgram.com`.

### 3.2 Batch (pre-recorded)
Three near-duplicate implementations:
- `netlify/functions/transcribe.js:245-323`: `model=nova-2&diarize&utterances`, `multichannel=true` when whispered. Parses `results.channels[0].alternatives[0]`, `results.utterances[]`, `detected_language`.
- `netlify/functions/backfill-deepgram-intelligence.js:242-302`: same shape, plus talk-time, WPM, pause and confidence-by-channel derived from `utterances[].channel/confidence/start/end`.
- `netlify/functions/transcript-gaps-background.js:58-59`: `multichannel` when stereo.
- `netlify/lib/transcriptRecovery.js:16,42`: channel→speaker mapping that assumes Twilio `DialVerb` dual-channel recordings.
- Diarization assumption: mono recordings use `diarize=true` speaker indexes. Dual-channel recordings use `multichannel` channel index = speaker.

### 3.3 Stored vendor data
- `transcript_source = 'deepgram_server'` (`supabase/migrations/121_conference_calling.sql:105,220`).
- `usage_records.record_type IN ('deepgram_minutes','claude_tokens',…)` CHECK (`035_llm_silence_counters.sql:3`, `129_stt_cost_controls.sql:4`).
- `transcript_diarized` JSON is EnrollGen's normalized shape, which is good. But `call_intelligence` metrics are computed from Deepgram `utterances`.

### 3.4 Env vars
`DEEPGRAM_API_KEY` (telephony, Netlify), `STT_WAIT_FOR_ANSWER`, `VITE_ENABLE_CUSTOMER_AUDIO`.

---

## 4. Seam 3: AI models (OpenAI; Anthropic residue)

**Vendors:** `openai` ^7.12.1 (Responses API). Embeddings call `https://api.openai.com/v1/embeddings` directly. **Anthropic: zero touchpoints on `pilot/release`**, but `main` (production) still has `@anthropic-ai/sdk` ^0.124.0, `src/lib/llm/anthropic.ts`, and Anthropic calls in `_knowledgeUpdate.js` and `rts-ingest.js`. See §11.

**Severity: MEDIUM overall.** The chat path is LOW: an `Adapter` interface already exists. Embeddings are HIGH: they bypass the adapter in 5 places, and 1536-dimension vectors from one vendor model are stored in the database.

### 4.1 Existing abstraction (good)
- `src/lib/llm/types.ts:1-48`: `Adapter { complete, stream }`, `CompletionRequest`, `Completion`, `Usage`. But `type Provider = 'openai'`.
- `src/lib/llm/client.ts:56`: `adapters = runtime.adapters || { openai: createOpenAIAdapter(env) }`. Retry, fallback, telemetry, redaction and feature gates are vendor-neutral.
- `src/lib/llm/config.js:30-33`: `resolveProvider` **throws for anything but `openai`**. The comment at `client.ts:54` says compliance scoring must stay on OpenAI.
- `src/lib/llm/openai.ts:116-128` is the only SDK import in app code. `:100-113` maps OpenAI Responses stream events to an **Anthropic-Messages-shaped** internal event protocol (`message_start`, `content_block_delta`, `message_stop`). Callers consume that shape, so the internal stream protocol is a leftover of the earlier vendor.

### 4.2 Callers of the LLM client
Co-Pilot (MA/MEDSUP/ACA/U65/ANCILLARY/ANNUITY engines via `netlify/functions/coach.js:5,85`), compliance scoring (`score-call-background.js:12`, `compliance-review-background.js:10`, `scripts/rescore-calls.js:4`), coaching (`post-call-coaching-background.js:7`, `weekly-coaching.js:8`), practice caller (`netlify/lib/practice/work.js:1`), knowledge update (`_knowledgeUpdate.js:4`), RTS ingestion (`rts-ingest.js:5`). Client recap (`client-recap.js`) is template-rendered (`src/lib/clientRecap.js`) with no LLM call. It sends SMS through Twilio in `netlify/lib/recap/delivery.js`, a second SMS-send site outside telephony.

### 4.3 Bypasses (direct vendor calls)
- Embeddings: `netlify/functions/embeddings.js:11,64-77`; `netlify/functions/transcript-import.js:14-18`; `netlify/functions/post-call-background.js:49` (sends `model:'text-embedding-3-small'` to the embeddings function); `src/lib/embeddings.js:1,15,26`; `scripts/embed_cms_landscape_2027.mjs:4,11,36` (SDK).
- `netlify/lib/postCallProvider.js:30` sends an alert labelled "OpenAI quota or billing failure".
- **ping branch:** the AI screener calls `https://api.openai.com/v1/chat/completions` directly (`telephony/src/ping/screenerProviders.js:12,20,27,87`). This bypasses the shared client and lives in the telephony service.

### 4.4 Model names: code vs config
| Model | Where | Configurable? |
|---|---|---|
| `gpt-5.6-luna` (primary, all live/summary/scoring) | `src/lib/llm/config.js:38` | **Hard-coded** |
| `gpt-5.6-terra` (fallback) | `src/lib/llm/client.ts:58` | `LLM_FALLBACK_MODEL` overrides |
| RTS ingestion | `config.js:37` | `RTS_INGESTION_OPENAI_MODEL` (required) |
| Knowledge update | `config.js:37` | `KNOWLEDGE_UPDATE_OPENAI_MODEL` (required) |
| `text-embedding-3-small` | 5 places (§4.3) | **Hard-coded** |
| Screener (ping) | `screenerProviders.js:20` | `SCREENER_OPENAI_MODEL` (required) |

### 4.5 Stored vendor data
- `vector(1536)` columns tied to `text-embedding-3-small`: `transcript_chunks.embedding` (`supabase/bootstrap/sql/base-transcripts.sql:78`), `cms_plan_embeddings_py2027.embedding` (`m054.sql:83`). Search functions `search_transcript_chunks`, `match_cms_plans_py2027` use `<=>`. **Changing the embedding vendor or model means re-embedding everything.**
- Telemetry rows store `provider`, `model` and usage (`034_llm_telemetry.sql`). `usage_records.record_type='claude_tokens'` is a stale vendor label still in the CHECK.
- JSON schemas in `src/lib/llm/schemas/*` target "OpenAI strict structured output" (`jobs.js:1`).

### 4.6 Env vars
`OPENAI_API_KEY`, `LLM_PROVIDER`, `LLM_PROVIDER_{MA,MEDSUP,ACA,U65,ANCILLARY,ANNUITY}`, `LLM_FALLBACK_MODEL`, `RTS_INGESTION_OPENAI_MODEL`, `KNOWLEDGE_UPDATE_OPENAI_MODEL`, `SCORING_DAILY_TOKEN_CAP`, `SCORING_ENABLED`, `POST_CALL_COACHING_ENABLED`, `PRACTICE_CALLER_ENABLED`, `PRACTICE_VOICE_ENABLED`, `KNOWLEDGE_AUTO_UPDATE_ENABLED`. On ping, add `SCREENER_OPENAI_MODEL`. On main only: `ANTHROPIC_API_KEY`, `KNOWLEDGE_UPDATE_MODEL`, `RTS_INGESTION_MODEL`.

---

## 5. Seam 4: Database (Supabase)

**Vendor:** `@supabase/supabase-js` ^2.97.0 (root and telephony), `npm:@supabase/supabase-js@2.97.0` (edge). Postgres 18.3 baseline per `supabase/bootstrap/README.md`. That README states the bootstrap **requires `auth`, `storage`, platform roles and Supabase Vault**.

**Severity: HIGH.** Every service, plus the browser, talks to PostgREST through supabase-js. Authorization lives in RLS and SECURITY DEFINER functions that read Clerk-shaped JWT claims through Supabase's `auth.jwt()`.

### 5.1 Plain Postgres (portable)
Tables, indexes, triggers, PL/pgSQL, `sha256()`, and the 448 SECURITY DEFINER functions themselves (their bodies are portable except where noted below). `pgcrypto` and `pgvector` are standard extensions. The schema placement `extensions.` (Supabase convention) is not standard; see 5.2. Availability on any particular managed host is an **open question** to check with that host.

### 5.2 Supabase-only features: break on plain Postgres
| Feature | Evidence | Breaks because |
|---|---|---|
| PostgREST data API via supabase-js | 539 `.from('table')` + 207 `.rpc()` calls. Browser: 114 calls in 37 `src/` files. Server: netlify 288 `.from`/83 `.rpc`; telephony 99/64; integrations 27/18; scripts 50/10 | No HTTP data API on plain PG. The browser has no server in between. |
| `auth.jwt()` / `auth.role()` | 110 `auth.jwt()` uses in 31 migrations; `auth.role()` 30. Claims read: `sub` (92), `org_id`, `o.id`, `o.rol`, `org_role`, `role`, `public_metadata.role`, `private_metadata.role`, `metadata.role`. Central: `public.current_deployment_identity()`, `is_current_tenant()`, `deployment_is_admin()` (`152_protected_deployment_identity.sql:41-60`) | `auth` schema functions are Supabase-provided |
| `current_setting('request.jwt…')` | 2 migrations | PostgREST GUC |
| Roles `anon`, `authenticated`, `service_role` | 423 / 607 / 395 mentions in migrations (GRANT/REVOKE/policy `TO`). Checks like `current_setting('role',true)<>'service_role'` (`161_operational_logging_alerts.sql:284`) | Roles don't exist on plain PG. GRANTs fail. |
| RLS policies (154 `ENABLE RLS`, 197 policies in bootstrap) | Policies call `is_current_tenant()` → `auth.jwt()` | Depend on the two rows above |
| Supabase Vault | `vault.create_secret`, `vault.decrypted_secrets`: `022_pii_protection_phase1.sql:64,89,106`. Ping: `176_exchange_ping.sql:31-46`. Gold: `188_gold_standards_member_status.sql:45-60` | `supabase_vault` extension |
| Supabase Storage | Buckets `call-recordings`, `message-media` (`018_inbound_calls.sql:109`, `153_scoped_table_and_storage_access.sql:228-232`). `storage.objects` policies in 018/065/153/157. Client calls: `telephony/src/recordings.js:140,190`; `recordingCompliance.js:32`; `routes/sms.js:63,192-194`; `netlify/functions/_recordingAccess.js:148`; `evidence-media.js:21`; `transcript-gaps-background.js:47`; `netlify/lib/lifecycle/packet.js:41`; `telephony/src/lib/evidenceAudit.js:83` (audit wrapper) | `storage` schema + Storage API |
| Realtime | `ALTER PUBLICATION supabase_realtime ADD TABLE carrier_rts` (`029_create_carrier_rts.sql:61-65`). Subscribers: `src/components/RTSTab.jsx:261-279`, `src/components/medsup/RateComparisonPanel.jsx:148-157` | Realtime server |
| `extensions.` schema qualifier | `extensions.digest/hmac/pgp_sym_encrypt/gen_random_bytes` in 11 migrations | Needs `CREATE SCHEMA extensions` and extensions installed there |
| Edge Functions (Deno) | `supabase/functions/get-availability/index.ts:2-20` (`Deno.serve`, `Deno.env.get`, `npm:` import). `supabase/functions/_shared/*` | Deno runtime + `SUPABASE_SECRET_KEYS` injection |
| API key formats | `sb_secret_…` / `sb_publishable_…` / legacy JWT handling: `telephony/src/lib/supabaseKeys.js:10-48`, `src/lib/supabaseKeys.js`, `integrations/supabase.js`, `supabase/functions/_shared/supabaseKeys.js` | Supabase gateway semantics (`apikey` header) |
| Service role usage | Every server component authenticates as service role (`SUPABASE_SECRET_KEY` / legacy `SUPABASE_SERVICE_ROLE_KEY`). `createSupabaseClient` wraps it with audit + feature headers (`telephony/src/lib/supabaseKeys.js:35-49`) | Bypasses RLS; the replacement must keep a trusted server identity |

### 5.3 Vault secrets: rotation and portability
| Secret | Branch | Used for | Rotate without re-keying stored data? | Portable alternative needs |
|---|---|---|---|---|
| `pii_encryption_key_v1` (row in `pii_vault.encryption_keys` → Vault) | pilot/release | `encrypt_pii_value`/`decrypt_pii_value` (pgcrypto `pgp_sym_encrypt` AES-256). Ciphertext JSON stores key id `k`. | **Encryption: yes.** Insert a new active key. Old rows still decrypt by `k` as long as the old Vault secret is kept. **Blind index: no.** `pii_vault.blind_index_key()` derives from the *active* key (`022:171-178`), so rotation silently breaks every `contacts.phone_hash` / `name_search` lookup (used by `match_contacts_by_phone`, contact search, sticky routing) until all rows are decrypted and re-indexed. | A `KeyProvider` (KMS / secret manager) supplying key material by id. Blind-index key versioned separately from the encryption key, with index rows tagged by key version. Either app-side encryption or a session-scoped GUC set by a trusted server. |
| `ping_phone_pepper` (`ping_platform_secrets`) | ping-platform | `ping_phone_hash = sha256(pepper‖phone)` for exchange loser rows and pooled `shopper_history` | **No.** `provision_ping_phone_pepper` refuses a second call (`176:38-46`). Raw phones are deliberately *not* stored for losers, so re-keying is **impossible**. Rotation = loss of history matching. | Versioned pepper (`hash_version` column), dual-write/dual-read window, KeyProvider source |
| `mbi_pepper` (`member_match_secrets`) | gold-standards | `member_mbi_key = HMAC(pepper, normalized MBI)` (`188:41-83`) | **No, by design** (`188:50`: second provision refused). Re-keying *is* possible because MBI is stored encrypted: decrypt then recompute via `member_backfill_mbi_keys` (`188:391`). | Same as above |

### 5.4 Env vars
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (legacy), `SUPABASE_SERVICE_KEY` (legacy, worker), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `ENROLLGEN_SUPABASE_SECRET_KEY` (edge), `SUPABASE_SECRET_KEYS` (edge, platform-injected), `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_CMS_URL`, `VITE_SUPABASE_CMS_PUBLISHABLE_KEY`, `VITE_SUPABASE_CMS_ANON_KEY`, `VITE_ENABLE_CMS_SUPABASE`.

---

## 6. Seam 5: Login (Clerk)

**Vendor:** `@clerk/clerk-react` ^5.61.3, `@clerk/backend` ^2.33.0 (root + telephony). **No Clerk webhooks (no svix), no Clerk Backend API client in app code, no Supabase Auth code.** Scripts use `CLERK_ADMIN_TOKEN`.

**Severity: HIGH.** The Clerk session JWT is the database's identity token. Clerk claim shapes are baked into 31 migrations, and Clerk user/org ID formats are stored as keys.

### 6.1 Frontend components and hooks
`src/main.jsx:7,120` (`ClerkProvider`); `src/App.jsx:29` (`SignIn`, `useClerk`); `src/context/AuthContext.jsx:2` (`useAuth`, `useOrganization`, `useUser`); `src/context/SessionLockContext.jsx:2` (`useClerk`, `useSession`); `src/components/{ProfileMenu,RTSIngestionPanel,RTSTab,ScriptEditor,contacts/MessagesThread,medsup/RateComparisonPanel,phone/DialerPanel}.jsx`. Role from `user.organizationMemberships[0].role` in `src/App.jsx:515`, `ScriptEditor.jsx:25`, `TenantSettings.jsx:149`. Token plumbing: `src/lib/clerkFetch.js`, `src/lib/supabase.js:53-160` (Clerk JWT passed as the supabase-js `accessToken`).

### 6.2 Server JWT verification
`netlify/functions/_clerkAuth.js:5,58-66` (`verifyToken`, returns `sub`, `sid`, `org_id`); `telephony/src/clerkAuth.js:5,19-27` (`org_id || o.id`); `telephony/src/media/supervisorListen.js:3,16-57`; `telephony/src/lib/browserBoundary.js:8` (`azp`, `aud` checks). Netlify functions import `requireClerkAuth` widely (155 Clerk-pattern lines in `netlify/functions`).

### 6.3 ID formats stored
`clerk_user_id` (289 uses in bootstrap SQL), `clerk_org_id` (22), `clerk_session_id` (4). `DEPLOYMENT_PROFILE_JSON.organizationId` must match `/^org_[a-zA-Z0-9]+$/` (`telephony/src/lib/deploymentProfile.js:25`). `resolve_deployment_subject` joins on `clerk_user_id` and `clerk_org_id` (`152:19-37`). Claim parsing in SQL is listed in §5.2.

### 6.4 Env vars
`CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_ADMIN_TOKEN` (scripts), `VITE_DISABLE_CLERK_AUTH` (dev bypass guarded by `integrations/authSafety.js`). Profile: `authorizedParties`, `tokenAudiences`, `browserOrigins`.

---

## 7. Seam 6: Recording storage

**Today:**
1. Twilio records (`record-from-answer-dual` on `<Dial>`; REST `recordings.create` dual for conferences). Callback → `enqueue_recording` RPC (`telephony/src/recordings.js:47-64`).
2. A worker copies media from `https://api.twilio.com/.../Recordings/{RE}.wav?RequestedChannels={1|2}` (`recordings.js:18-26`, Basic auth with Account SID + Auth Token; redirect following restricted to `*.twilio.com` at `:78-91`) into the Supabase Storage bucket `call-recordings` at `{tenant}/{parent_call_sid}/{recording_sid}.wav` (`:185-190`).
3. If `DELETE_TWILIO_RECORDINGS_AFTER_COPY=true`, the Twilio original is deleted (`:149-158`). Otherwise both copies remain.
4. Backfill and reconciliation: `recordings.js:220-238` lists `Recordings.json` per call and re-enqueues. `telephony/src/backfillConnections.js`.

**Link generation and protection:**
- Internal playback: `netlify/functions/_recordingAccess.js:148` creates a Supabase signed URL with a 300 s TTL. The legacy URL regex for Twilio media is at `:92`.
- Capability links (Conversely and other processors): `integrations/recordingComplianceGrant.js` mints a random 32-byte token (stored only as a SHA-256 hash in `recording_compliance_tickets`) with a 24 h expiry. Redeemed at `telephony/src/recordingCompliance.js:52-110` (`/api/recordings/media/:token`), which streams from Storage (WAV) **or** from Twilio (`:41-47`). **MP3 is only available while the Twilio original is retained** (Twilio transcodes on fetch). See `recordingComplianceGrant.js` "MP3 requires a retained Twilio recording", `integrations/complianceUploads.js:71`, `integrations/ixUploads.js:87`. Every access is evidence-audited (`telephony/src/lib/evidenceAudit.js`). Links are not password-protected. Protection comes from the unguessable token, the hash at rest, expiry, whisper-hold revalidation and the audit log.
- Message media: bucket `message-media`, signed URL with 86400 s TTL for GIFs (`telephony/src/routes/sms.js:194`).
- Retention/purge: `scripts/retention/recordingDeletion.js`, `scripts/retention/planner.js`.

**Severity: HIGH.** Recording identity is the Twilio `RecordingSid`, the storage path embeds Twilio SIDs, and MP3 delivery depends on the carrier's transcoding.

---

## 8. Seam 7: Hosting

### 8.1 Netlify (frontend + functions)
- `netlify.toml`: build `npm run build` → `dist`. `functions = "netlify/functions"`, esbuild bundler, `external_node_modules = ["read-excel-file","papaparse"]`. Redirects: `/vendor/paragon` → `/.netlify/functions/paragon-vendor-report`; `/api/*` → `/.netlify/functions/:splat`; `/calls` → `/crm/calls`; `/assets/*` 404; SPA fallback. Cache headers. Global security headers. CSP is generated into `dist/_headers` by `scripts/security/browser-headers.mjs` (Netlify `_headers` file format). `[dev]` port 5173.
- Scheduled functions: `nightly-analytics` (hourly), `weekly-coaching` (hourly), `sync-bulletins` (daily 10:00 UTC), `paragon-daily-email` (`0,15,30 * * * *`), `sync-fema` (daily 09:00 UTC), `practice-sweep` (`* * * * *`), set in `netlify.toml` and/or `export const config={schedule}`.
- Background functions (Netlify `-background` suffix: 202 immediately, long timeout): `compliance-review-background`, `post-call-background` (also `config={background:true}`), `post-call-coaching-background`, `score-call-background`, `transcript-gaps-background`.
- 72 functions use the v2 `export default (Request) => Response` signature, which is portable to most Fetch-API runtimes. 21 declare `export const config={path:'/api/…'}`, which is Netlify routing.
- Hard-coded Netlify paths: `/.netlify/functions/…` appears 28× in `src/` (e.g. `src/hooks/useCopilotEngine.js:802,1064`, `useAcaCopilotEngine.js:499,644`, `TenantSettings.jsx:322,330`) and 9× in `netlify/` for server-to-server fan-out (`compliance-review.js:81,97`, `post-call.js:77`, `post-call-admin.js:30`, `post-call-background.js:46`).
- Platform headers and context: `netlify/functions/paragon-vendor-report.js:59` (`x-nf-client-connection-ip`), `netlify/functions/_llmTelemetry.js:9` (`context.waitUntil`). Env: `URL`, `SITE_URL`, `CONTEXT`, `DEPLOY_ID`, `NETLIFY`, `COMMIT_REF`.

### 8.2 Railway (telephony, integrations-worker)
- `telephony/railway.json`: Dockerfile builder, `startCommand node src/server.js`, `healthcheckPath /healthz`, `ON_FAILURE` restart ×5. `telephony/Dockerfile` (node:22-alpine, `EXPOSE 8080`). Port from `PORT` (`telephony/src/config.js:55`, default 8080). One HTTP server handles Express routes plus WebSocket upgrades on `/media`, `/agent`, `/conference-media/*`, `/supervisor-listen` (`telephony/src/server.js:131-136`). **Requires a host that supports long-lived inbound WebSockets** (Twilio Media Streams and the agent sockets).
- `integrations/Dockerfile`: builds from the repo root. Copies selected `src/lib/*` and `telephony/src/{recordings.js,lib}`. `CMD node integrations/worker.js`. Long-running, with a self-scheduler (`integrations/worker.js:141`, `setInterval(…,1000)`), so no platform cron.
- `RAILWAY_*` reads: `integrations/authSafety.js:8` and `telephony/src/authSafety.js` (treat `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `NETLIFY`, `CONTEXT`, `DEPLOY_ID`, `AWS_LAMBDA_FUNCTION_NAME`… as "hosted" to forbid dev auth bypass); `telephony/src/lib/browserBoundary.js:11` (`RAILWAY_REPLICA_COUNT`, `WEB_CONCURRENCY`, `TELEPHONY_REPLICAS`, `REPLICAS`, used for a single-replica assertion). **Telephony assumes one replica.** In-memory state such as stream leases and the WS registry must stay on one process.
- Health: `/healthz` route in telephony.

### 8.3 Supabase Edge
One function, `get-availability`. Thin Deno shell (`index.ts`) over a portable `handler.js`. Reads `SUPABASE_URL`, `ENROLLGEN_SUPABASE_SECRET_KEY` / `SUPABASE_SECRET_KEYS`, `PARAGON_*`, `DEPLOYMENT_PROFILE_JSON`.

### 8.4 Other
`infra/office-nextcloud/`: docker-compose sidecar (Nextcloud + MariaDB + `sync/sync.py`) that polls Supabase Storage and tables and pushes over WebDAV. Its own env (§10).

**Severity: MEDIUM.**

---

## 9. Seam 8: Outbound connections

| Vendor | Purpose | Touchpoints (key) | Coupling | Severity |
|---|---|---|---|---|
| **Paragon** (lead vendor) | Availability feed, ping, arrival billing, postbacks, CSV reports, vendor report page | Profile section `paragon` with `pushUrl`, `postbackUrl`, `pushSecret`, `postbackSecret`, `pingKeyHash`, `availabilityKeyHash`, `reportTokenHash` (`telephony/src/lib/deploymentProfile.js:47,57-66`). Push/postback/report delivery `integrations/worker.js:23-40`, `integrations/payloads.js`. Routing `telephony/src/routes/twilioVoice.js:127,156-218`, `paragonRouting.js`, `paragonBilling.js`, `paragonEligibility.js`, `paragonPingAdapter.js` (+ `supabase/functions/_shared/paragonPingAdapter.js`), `routes/vendorPing.js`. Netlify: `paragon-vendor-report.js`, `paragon-daily-email.js`, `paragon-zip-confirm.js`, `paragon-residence.js`, `_paragonControls.js`, `vendor-routing.js`, `vendor-pause.js`. Edge `get-availability`. 37+ `paragon_*` tables/columns. | Vendor-specific logic in the routing path. Partly generalized on ping (`telephony/src/ping/adapter.js`). | **HIGH** |
| **GHL** (GoHighLevel CRM) | Post-call and enrollment webhooks | `netlify/lib/postCallWork.js:497` (`sendEnrollmentWebhook`), `integrations/enrollmentWebhook.js:7`, `netlify/functions/test-ghl-webhook.js:59`, `src/lib/ghlFields.js`. Profile `ghl.{postCallUrl,enrollmentUrl,locationId}`. Tables `ghl_enrollment_deliveries`, `ghl_sync_log`; columns `ghl_contact_id`, `ghl_user_id`, `ghl_location_id` | Payload shaped to GHL custom fields | MEDIUM |
| **Conversely** (compliance QA) | Weekly sampled recording submissions | `integrations/complianceUploads.js` (41 lines; `:152` POST to `profile.conversely.endpoint`), `converselyRuns.js`, `converselySelection.js`, `netlify/functions/compliance-uploads.js`. Capability links §7. Tables `conversely_*` (9). | Depends on Twilio MP3 URLs (`:71-72`) | MEDIUM |
| **Sunfire IX** (UHC enrollment recordings) | Upload every UHC MA enrollment | `integrations/ixClient.js` (`SunfireIxClient`, Bearer token, `:26-77`), `integrations/ixUploads.js:42-141` (PUT `audio/mpeg`, Twilio MP3 `:87`) | Already a class; Twilio-coupled media source | MEDIUM |
| **Stripe** | Billing | `stripe` ^22.1.0. `netlify/functions/stripe-checkout.js:27,101`, `stripe-portal.js:27,83`, `stripe-webhook.js:25,56-87` (`constructEvent`). Columns `stripe_customer_id`, `stripe_subscription_id`. Gated by `STRIPE_BILLING_ENABLED`. | 3 files | LOW |
| **Resend** (email) | Paragon daily report, IX report, alerts, client recap | Raw HTTP POST to `profile.email.endpoint` with `Bearer RESEND_API_KEY` and a Resend-shaped body: `integrations/worker.js:36-40`, `integrations/ixUploads.js:116-118`, `integrations/alerts.js:29-30`, `netlify/functions/paragon-daily-email.js`, `netlify/lib/recap/delivery.js`, `netlify/lib/postCallProvider.js` | Endpoint configurable, payload not | LOW |
| **Giphy** | SMS GIF picker | `telephony/src/giphy.js:21`, `routes/sms.js:192-194`. `GIPHY_API_KEY` | Isolated | LOW |
| **Biblia / bible-api.com / bibleengine.org** | Daily Verse | `netlify/functions/biblia.js:20`, `src/lib/originalLanguageApi.js:5-6`, `src/components/DailyVerse.jsx`. `BIBLIA_API_KEY` (+ allow-listed `VITE_BIBLIA_API_KEY`) | Isolated, flag `DAILY_VERSE_ENABLED` | LOW |
| **FEMA OpenFEMA** | SEP disaster lookups | `src/lib/sepFema.js:3`, `netlify/functions/sync-fema.js`, `scripts/sep-data/ingest-fema-disasters.js:12` | Public data | LOW |
| **CMS / HUD** | Plan landscape, crosswalk | `scripts/sep-data/*`, `HUD_USER_TOKEN` | Offline scripts | LOW |
| **CSG Actuarial** | Med Supp rate quotes (dormant) | `src/services/rateQuoteService.js:1-30` reads `VITE_CSG_API_KEY` / `VITE_CSG_API_URL` **in the browser** | ⚠ `assertNoPublicApiKeys` (`src/lib/llm/config.js:10-20`) will fail the build if `VITE_CSG_API_KEY` is set. It needs a server proxy before activation. | LOW (dormant) |
| **Carrier feeds / sites** | Static reference links and bulletin scraping | `netlify/functions/sync-bulletins.js`, `src/data/*` (hundreds of carrier URLs as data) | Data, not integration | LOW |
| **Inbound lead vendors (generic)** | `/api/leads/incoming`, `/api/leads/ping` | `telephony/src/routes/leads.js:20`, `routes/vendorPing.js:17` (`x-api-key`, `INBOUND_VENDOR_API_KEY`) | Generic | LOW |

---

## 10. Noise suppression, flags, logging

- **DeepFilterNet3:** `src/lib/audio/AgentAudioProcessor.js:5,16-17,53` (dynamic `import('@workadventure/noise-suppression/deepfilternet')`, bypass on overload), `vite.config.js:10,21` (`noiseSuppressionAudioWorkletVitePlugin`). Browser `getUserMedia` constraints at `AgentAudioProcessor.js:5` and `useCustomerAudio.js:42`. **LOW**: one module, with a natural `NoiseSuppressor` seam.
- **Feature flags / kill switches:** the registry is `telephony/src/lib/featureFlags.js:2-9` (`FEATURE_NAMES`, 20 flags, strict `true`/`false`/unset parsing). `deploymentFeatures.js` fails at boot on invalid values. Browser features come from `x-enrollgen-features` and `netlify/functions/deployment-features.js`. **Outside the registry:** `STICKY_ROUTING_ENABLED` (`telephony/src/config.js:68`, lenient parse), `KNOWLEDGE_AUTO_UPDATE_ENABLED`, `PRACTICE_CALLER_ENABLED`/`PRACTICE_VOICE_ENABLED` (`src/lib/practiceCaller.js:6-9`), `RESHOP_LIST_ENABLED`, `RETENTION_PURGE_ENABLED` (in registry, also read by scripts), and the `VITE_*` build-time flags (`VITE_INBOUND_CALLS_ENABLED`, `VITE_ENABLE_CUSTOMER_AUDIO`, `VITE_ENABLE_CMS_SUPABASE`, `VITE_SHOW_ACA_REFERENCE_DETAILS`). The mechanism is env-only: **no runtime kill switch** without a redeploy, except DB-backed `vendor-pause` and `paragon_*` controls. **LOW.**
- **Logging and error reporting:** `telephony/src/lib/logger.js:8` (JSON lines to stdout, secret-pattern scrubbing at `:34`), `operationalTelemetry.js` (metrics into Postgres via RPC), `integrations/alerts.js:26-35` (email via Resend-shaped POST + HMAC-signed generic webhook from `profile.alerting.webhook`). No Sentry, Datadog, Logtail or similar SDK. Log shipping depends on whatever the host collects from stdout. **LOW.**

---

## 11. Config inventory (names only)

Services: **FE** = browser bundle (Vite, build time). **NF** = Netlify functions. **TEL** = telephony (Railway). **WRK** = integrations-worker (Railway). **EDGE** = Supabase edge function. **BUILD** = Vite build. **SCR** = ops scripts. **NC** = Nextcloud sidecar. "Shared lib" means read by `telephony/src/lib/*`, which is bundled into TEL, NF, WRK, EDGE and BUILD.

### 11.1 Deployment identity and platform
| Name | Read by | Seam |
|---|---|---|
| `DEPLOYMENT_PROFILE_JSON` (contains **secrets**: `paragon.pushSecret`, `paragon.postbackSecret`, `alerting.webhook.secret`; plus hashes and URLs) | TEL, NF, WRK, EDGE, BUILD, SCR | Core config |
| `DEPLOYMENT_ID`, `COMMIT_REF` | Shared lib | Hosting/telemetry |
| `PORT` | TEL | Hosting |
| `NODE_ENV` | TEL, WRK, FE | Runtime |
| `URL`, `SITE_URL`, `ENROLLGEN_APP_URL` | NF | Netlify |
| `NETLIFY`, `CONTEXT`, `DEPLOY_ID`, `AWS_LAMBDA_FUNCTION_NAME` | Auth-safety guards (TEL, WRK, BUILD) | Hosting detection |
| `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID` | TEL, WRK | Railway |
| `RAILWAY_REPLICA_COUNT`, `WEB_CONCURRENCY`, `TELEPHONY_REPLICAS`, `REPLICAS` | Shared lib (`browserBoundary.js`) | Hosting |
| `CSP_MODE` | SCR (build headers) | Netlify headers |
| `TELEPHONY_BASE_URL` | WRK (`.env.example`) | Hosting |
| `ENROLLGEN_DEBUG_LOGS` | FE | Logging |

### 11.2 Telephony (Twilio)
`TWILIO_ACCOUNT_SID` (TEL, NF, WRK), `TWILIO_AUTH_TOKEN` (TEL, NF, WRK), `TWILIO_API_KEY_SID` (TEL), `TWILIO_API_KEY_SECRET` (TEL), `TWILIO_TWIML_APP_SID` (TEL), `TWILIO_PHONE_NUMBER` (TEL), `DIRECT_AGENT_NUMBERS` (TEL), `DIAL_TIMEOUT_SECONDS` (TEL), `MIN_CONNECTED_SECONDS` (TEL), `DELETE_TWILIO_RECORDINGS_AFTER_COPY` (TEL), `RECORDING_MAX_BYTES`, `RECORDING_STORAGE_MAX_BYTES`, `RECORDING_TIMEOUT_MS` (TEL), `AGENT_WS_SIGNING_SECRET` (TEL), `INBOUND_VENDOR_API_KEY` (TEL), `STICKY_ROUTING_ENABLED`, `STICKY_LOOKBACK_DAYS` (TEL), `TRANSCRIPT_SCORING_URL` (TEL), `SCORE_CALL_JOB_SECRET` (TEL, NF), `VITE_INBOUND_CALLS_ENABLED` (FE).

### 11.3 STT
`DEEPGRAM_API_KEY` (TEL, NF), `STT_WAIT_FOR_ANSWER` (TEL), `VITE_ENABLE_CUSTOMER_AUDIO` (FE).

### 11.4 AI
`OPENAI_API_KEY` (NF, SCR; via `src/lib/llm` bundled into NF), `LLM_PROVIDER`, `LLM_PROVIDER_MA`, `LLM_PROVIDER_MEDSUP`, `LLM_PROVIDER_ACA`, `LLM_PROVIDER_U65`, `LLM_PROVIDER_ANCILLARY`, `LLM_PROVIDER_ANNUITY`, `LLM_FALLBACK_MODEL`, `RTS_INGESTION_OPENAI_MODEL`, `KNOWLEDGE_UPDATE_OPENAI_MODEL`, `SCORING_DAILY_TOKEN_CAP`, `COMPLIANCE_RULES_VERSION`, `KNOWLEDGE_UPDATE_SECRET`, `BACKFILL_SECRET` (NF).

### 11.5 Database (Supabase)
`SUPABASE_URL` (all servers), `SUPABASE_SECRET_KEY` (all servers), `SUPABASE_SERVICE_ROLE_KEY` (legacy fallback), `SUPABASE_SERVICE_KEY` (WRK legacy), `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` (WRK), `ENROLLGEN_SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEYS` (EDGE), `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `PGDATABASE` (SCR), `VITE_SUPABASE_URL` (FE, NF, SCR), `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_CMS_URL`, `VITE_SUPABASE_CMS_PUBLISHABLE_KEY`, `VITE_SUPABASE_CMS_ANON_KEY`, `VITE_ENABLE_CMS_SUPABASE` (FE).

### 11.6 Auth (Clerk)
`CLERK_SECRET_KEY` (TEL, NF), `CLERK_JWT_KEY` (TEL, NF), `VITE_CLERK_PUBLISHABLE_KEY` (FE, SCR), `CLERK_ADMIN_TOKEN` (SCR), `VITE_DISABLE_CLERK_AUTH` (guarded; TEL, WRK, BUILD), `AGENT_API_KEY`, `VITE_AGENT_API_KEY` (SCR, legacy).

### 11.7 Outbound
`RESEND_API_KEY` (WRK, NF), `INTEGRATIONS_REPORT_FROM` (WRK `.env.example`), `CONVERSELY_API_KEY`, `CONVERSELY_CARRIERS`, `CONVERSELY_AGENT_EXCLUSIONS`, `CONVERSELY_SAMPLES_PER_AGENT` (WRK), `IX_USERNAME`, `IX_PASSWORD`, `IX_ENV` (WRK), `GHL_ENROLLMENT_WEBHOOK_URL` (WRK `.env.example`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID` (NF), `PARAGON_PING_FIELD_MAP` (TEL, EDGE), `GIPHY_API_KEY` (TEL), `BIBLIA_API_KEY` (NF), `VITE_BIBLIA_API_KEY` (FE, allow-listed), `VITE_CSG_API_KEY`, `VITE_CSG_API_URL` (FE, dormant), `HUD_USER_TOKEN` (SCR), `ACCESS_REVIEW_MAX_ADMINS` (NF), `VITE_SHOW_ACA_REFERENCE_DETAILS` (FE).

### 11.8 Feature flags (registry, `true`/`false`)
`SUPERVISOR_FLOOR_ENABLED`, `SUPERVISOR_LISTEN_ENABLED`, `SUPERVISOR_WHISPER_ENABLED`, `CLIENT_RECAP_ENABLED`, `POST_CALL_COACHING_ENABLED`, `CONSUMER_LIFECYCLE_ENABLED`, `RETENTION_PURGE_ENABLED`, `PARAGON_ENABLED`, `PARAGON_STATE_ROUTING_ENABLED`, `GHL_ENABLED`, `STRIPE_BILLING_ENABLED`, `DAILY_VERSE_ENABLED`, `CONVERSELY_UPLOAD_ENABLED`, `IX_UPLOAD_ENABLED`, `IX_REPORT_ENABLED`, `CONFERENCE_CALLING_ENABLED`, `SCORING_ENABLED`, `TRANSCRIPT_GAP_FILL_ENABLED`, `TRANSCRIPT_AUTO_RECOVERY_ENABLED`, `OPERATIONAL_EMAIL_ENABLED`. Outside the registry: `STICKY_ROUTING_ENABLED`, `KNOWLEDGE_AUTO_UPDATE_ENABLED`, `PRACTICE_CALLER_ENABLED`, `PRACTICE_VOICE_ENABLED`, `RESHOP_LIST_ENABLED`.

### 11.9 Nextcloud sidecar (`infra/office-nextcloud`)
`NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_APP_TOKEN`, `NEXTCLOUD_TRUSTED_DOMAINS`, `DB_PASSWORD`, `SUPABASE_CALLS_TABLE`, `SYNC_TIME_COLUMN`, `SUPABASE_PAGE_SIZE`, `SYNC_INTERVAL_SECONDS`, `INITIAL_SYNC_SINCE`, `ADVANCE_ON_MISSING_ARTIFACTS`, `SUPABASE_SUMMARY_BUCKET`, `SUPABASE_TRANSCRIPT_BUCKET`, `SUPABASE_SUMMARY_PATH_FIELDS`, `SUPABASE_TRANSCRIPT_PATH_FIELDS`, `SUPABASE_TRANSCRIPT_TEXT_FIELDS`, `STATE_DB`, `LOG_FILE`, `RUN_ONCE`.

### 11.10 Secrets held in Supabase Vault (not env)
`pii_encryption_key_v1` (pilot). `ping_phone_pepper` (ping branch; provisioned by `provision_ping_phone_pepper`). `mbi_pepper` (gold branch; provisioned by `provision_member_mbi_pepper`).

### 11.11 Secrets held outside the repo, in vendor consoles
Twilio console: number voice/SMS webhooks, TwiML App voice URL, A2P 10DLC brand and campaign. Clerk: JWT template / session token claims, allowed origins. Stripe: webhook endpoint. Supabase: third-party auth (Clerk) configuration, `SUPABASE_SECRET_KEYS`.

### 11.12 Stale names in `.env.example` files (not read by code)
`telephony/.env.example`: `PUBLIC_BASE_URL`, `CORS_ALLOW_ORIGIN`, `DEFAULT_TENANT_ID` (superseded by `DEPLOYMENT_PROFILE_JSON`).

---

## 12. Secrets committed to the repo or history

Scanned `git log -p` across all four branches for provider key patterns (OpenAI, Stripe, Supabase `sb_secret_`, Resend, PEM private keys, JWTs, `NAME=value` assignments for every secret env var) and Twilio SIDs in current trees.

| Finding | File | Commit(s) | Assessment |
|---|---|---|---|
| ⚠ **Literal database password** (`SUPABASE_DB_PASSWORD=` with a literal value, inside allowed Bash command strings) | `.claude/settings.local.json` | Added in `70b2d1a`. Last changed on `main` in `b6cca31`. **Still present in `main`'s current tree.** Removed from `pilot/release`, `feature/ping-platform` and `feature/gold-standards` trees by `0a89288`, but in the history of all four branches. | **Treat as compromised. Rotate the Supabase DB password.** History rewrite is optional once rotated. Value not reproduced here. |
| Supabase **anon** (`role=anon`) JWTs hard-coded | `src/lib/supabase.js` (commits `0d5201d`, `2a3a403`, `450241d`, `479d37b`, `727984a`, `b550695`, `ed9e7ac`), `src/lib/supabaseTranscripts.js` (`727984a`), `scripts/upload_cms_data.js` (`76a4350`) | Historical | Public by Supabase design, not a secret. They identify the project. Low risk. Revoke if the legacy anon JWT is retired in favour of publishable keys. |
| `.env.example` secret names | `.env.example` (`0a89288`, `fac8fef`) | — | Placeholders (`replace-…`). Not secrets. |
| Test fixtures | `tests/*.test.js`, `scripts/pilot/local-load.mjs` | — | Empty or fake values. Twilio SIDs in trees are placeholder patterns. |

No OpenAI, Stripe, Twilio auth-token, Deepgram, Clerk secret, Resend or `sb_secret_` values were found.

---

## 13. Cross-branch differences

### 13.1 `feature/ping-platform` only (90 commits over `pilot/release`)
| Seam | Touchpoint | Notes |
|---|---|---|
| Telephony | `telephony/src/ping/screener.js:11,20,60-62` (`<Gather input='speech dtmf' speechTimeout=auto>` + `<Say voice=script.voice>`), `:146` (stop recording), `:180` (`recordings.create` dual), `:199` (`SpeechResult`), `:289` (call fetch) | **New STT dependency: Twilio speech recognition.** New TwiML in business code. |
| Telephony | `telephony/src/routes/screener.js:10,44,62,71,80` (`/twilio/screener/start`, `/{step}/{attempt}`, `/recording`; `requireTwilioSignature`) | New webhook routes |
| Telephony | `telephony/src/ping/billing.js:5,35,99` (`twilio().calls().fetch()`, `calls.list({parentCallSid})`); `telephony/src/ping/arrival.js` (`twilio_call_sid` writes) | Generalizes Paragon billing. Still Twilio-coupled. |
| AI | `telephony/src/ping/screenerProviders.js:12,20,27,87` (OpenAI Chat Completions via raw `fetch`, strict JSON schema, 3 s timeout) | **Bypasses `src/lib/llm`. In the inbound call path.** Env `SCREENER_OPENAI_MODEL`. |
| Outbound | `telephony/src/ping/dataVendors.js:72-97` (`createDataVendors`, stub provider). Used in `routes/pingV1.js:10,55,91`, `routes/leadV1.js:17,144,194`, `routes/exchangeV1.js:13,71,101` | **Already an interface slot.** Env `PING_DATA_VENDORS`. |
| Database | Migrations 171–187. `176_exchange_ping.sql`: **Vault `phone_pepper`** (§5.3), `ping_platform_secrets`. `telephony/src/ping/{buyerOps,operatorOps}.js`: 47 `.from`/`.rpc` calls. `netlify/functions/_pingPortal.js` | New Supabase-only dependency (Vault) |
| Auth | `netlify/functions/ping-buyer.js`, `ping-operator.js` (`requireClerkAuth`); `src/components/exchange/exchangeApi.js` (`fetchWithClerk`) | Same Clerk pattern |
| Hosting | `src/components/exchange/exchangeApi.js` (`/.netlify/functions/ping-operator`, `ping-buyer`) | Hard-coded Netlify path |
| Env | `PING_FIELD_MAPS`, `PING_DATA_VENDORS` (`telephony/src/config.js:82,84`), `SCREENER_OPENAI_MODEL`, `PING_LOAD_DATABASE_URL` (scripts), `VITE_PING_DEMO` (dev) | |
| Flags | `PING_PLATFORM_ENABLED`, `PING_EXCHANGE_ENABLED`, `PING_SCREENER_ENABLED`, `PING_SCORECARD_ENABLED`, `PING_SHADOW_ENABLED`, `PING_RETENTION_ALERTS_ENABLED` | Added to registry |

### 13.2 `main` only
`main` has no commits that `pilot/release` lacks. Its differing touchpoints are **older code that pilot replaced**, but they are what production runs until pilot merges:
- **Anthropic in production:** `@anthropic-ai/sdk` ^0.124.0 (`main:package.json:18`); `src/lib/llm/anthropic.ts:1-2,41`; `src/lib/llm/client.ts:11` (`claude-sonnet-4-6`); `netlify/functions/_knowledgeUpdate.js:107-121` and `netlify/functions/rts-ingest.js:165-179` (raw Anthropic calls; `ANTHROPIC_API_KEY`, `KNOWLEDGE_UPDATE_MODEL`, `RTS_INGESTION_MODEL`); Co-Pilot hooks reference the provider in `useCopilotEngine.js`, `useAcaCopilotEngine.js`, `useMedSupCopilotEngine.js`, `useU65CopilotEngine.js`, `useCopilotEngineCore.js`.
- `.claude/settings.local.json` with the committed DB password (§12).
- Root data files `calls_500.jsonl`, `eval_report.json` are tracked on `main` only. They were not reviewed for PII in this audit.

---

## 14. `feature/gold-standards` (parked; drop this section if it never merges)

Gold = ping-platform + 4 commits (`7adac43`, `3c7bfc9`, `0159234`, `ef2225b`).

| Seam | Touchpoint | Notes |
|---|---|---|
| Database | `supabase/migrations/188_gold_standards_member_status.sql:34-92,391`: **Vault `mbi_pepper`** (`member_match_secrets`, `member_mbi_pepper()`, `provision_member_mbi_pepper()`, `member_mbi_key()` via `extensions.hmac`, `member_backfill_mbi_keys`). Enforces `mbi_pepper ≠ phone_pepper` (`:57-58`). `189_gold_standards_metrics.sql`, `190_ping_source_attestations.sql` | Second Vault secret; rotation analysis in §5.3 |
| Database / Auth | `netlify/functions/gold-standards.js` (15 lines: `.rpc('read_ctm_records')`, `resolve_ctm`, CSV export), `netlify/functions/activation-tasks.js` (8), `src/components/gold/goldApi.js` (4), `telephony/src/ping/operatorOps.js` (+4) | Same Supabase + Clerk patterns |
| Scripts | `scripts/gold/backfill-mbi-keys.mjs` | Off by default; operator backfill |
| Flags | `MEMBER_STATUS_IMPORT_ENABLED`, `CTM_IMPORT_ENABLED`, `BENEFIT_ACTIVATION_ENABLED`, `GOLD_STANDARDS_METRICS_ENABLED`, `SOURCE_ATTESTATIONS_ENABLED` | |

No new carrier, STT, AI or hosting vendor touchpoints beyond ping-platform.

---

## 15. Not covered by this audit
- Remote state of `pilot/release`, `feature/ping-platform` and `feature/gold-standards`. There are no `origin/` refs locally, and fetching was out of scope.
- Other local branches (`audit/*`, `pilot/dependency-fixes`) and remote-only branches (`origin/stripe-billing`, `origin/agentic-intelligence`, etc.).
- Vendor console configuration (Twilio, Clerk, Supabase, Stripe, Netlify UI env, Railway UI env).
- Untracked files in the working tree (e.g. root `calls_500.jsonl`, `__pycache__`, `.netlify/` build output).
