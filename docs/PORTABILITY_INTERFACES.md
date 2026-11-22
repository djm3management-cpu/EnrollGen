# EnrollGen Portability Interfaces

Design only. Nothing here is implemented. Companion to [VENDOR_COUPLING.md](./VENDOR_COUPLING.md), which has the touchpoint map and evidence. Base: `pilot/release` at `5d24c9e`.

## Ground rules

1. **One interface per seam, one adapter per vendor, one conformance suite per interface.** Every adapter, including a `fake` one used by unit tests, must pass the same suite.
2. **Selected by config.** `<SEAM>_PROVIDER=<name>`, read once at boot. An unknown value is a boot failure, never a silent default. That matches today's `featureFlags.js` strictness.
3. **Interfaces cover only what the code uses today.** Nothing speculative. Where a vendor-neutral choice depends on what an alternative vendor can do, it is written as an **Open question (verify in vendor docs)**. No claims are made about Telnyx, Bandwidth, SignalWire, AWS, Azure, GCP or any other vendor.
4. **Business code never sees vendor wire formats.** No TwiML, Deepgram JSON, OpenAI events, `auth.jwt()` claim paths, or `CA…`/`RE…` SID regexes outside an adapter.
5. **Vendor IDs become opaque.** Store `provider` + `provider_<thing>_id` next to EnrollGen's own UUID. Existing `twilio_*` columns stay as read-only aliases until a backfill removes them.

Shared types used across seams:

```ts
type Uuid = string;
type E164 = `+${string}`;
type IsoTime = string;
type ProviderName = string;                    // 'twilio' | 'deepgram' | 'openai' | 'fake' | …
interface ProviderRef { provider: ProviderName; id: string }   // opaque vendor id
interface HttpRequestLike { method: string; url: string; headers: Record<string,string>; rawBody: Uint8Array; form?: Record<string,string> }
interface HttpResponseLike { status: number; headers: Record<string,string>; body: string | Uint8Array }
```

---

## 1. Telephony (voice + SMS)

### 1.1 Design
Today, routing code builds TwiML inline (`twilioVoice.js:72-123`). The interface replaces that with a small **vendor-neutral call-instruction IR**. Routing returns `CallPlan`; the adapter renders it (TwiML for Twilio). Webhooks are parsed into normalized `CallEvent`s. The rule that one request yields one response, plus the replay cache (`routingReplay.js`), stays in EnrollGen.

```ts
// ---------- Identity ----------
interface CallRef   extends ProviderRef {}    // Twilio CallSid today
interface LegRef    extends ProviderRef {}    // child/participant leg
interface RecordingRef extends ProviderRef {}
interface ConferenceRef extends ProviderRef {}
interface StreamRef extends ProviderRef {}
interface MessageRef extends ProviderRef {}

// ---------- Webhook verification + normalization ----------
interface WebhookVerifier {
  /** Must use the externally visible URL (today publicUrl(req.originalUrl)). */
  verify(req: HttpRequestLike, publicUrl: string): Promise<boolean>;
}

type CallStatus = 'queued'|'ringing'|'in-progress'|'completed'|'busy'|'no-answer'|'canceled'|'failed';
type DialOutcome = 'answered'|'completed'|'busy'|'no-answer'|'failed'|'canceled';

type CallEvent =
  | { kind: 'inbound_call'; call: CallRef; from: E164; to: E164; vendorMetadata: Record<string,string>; receivedAt: IsoTime }
  | { kind: 'dial_result'; call: CallRef; leg?: LegRef; outcome: DialOutcome; bridged: boolean; durationSec?: number }
  | { kind: 'call_status'; call: CallRef; parent?: CallRef; status: CallStatus; durationSec?: number; timestamp?: IsoTime }
  | { kind: 'recording'; call: CallRef; recording?: RecordingRef; status: 'completed'|'absent';
      channels?: 1|2; durationSec?: number|null; startedAt?: IsoTime; source?: 'dial'|'conference'|'api'|'voicemail' }
  | { kind: 'conference'; conference: ConferenceRef; event: 'start'|'end'|'join'|'leave';
      leg?: LegRef; participantLabel?: string }
  | { kind: 'stream_status'; call: CallRef; stream: StreamRef; status: 'started'|'stopped'|'failed' }
  | { kind: 'sms_inbound'; message: MessageRef; from: E164; to: E164; body: string; media: { url: string; contentType?: string }[] }
  | { kind: 'sms_status'; message: MessageRef; status: 'queued'|'sent'|'delivered'|'undelivered'|'failed'|'received' };

interface WebhookCodec {
  /** Path-agnostic: the route tells the codec which event family to expect. */
  parse(family: 'voice'|'dial'|'status'|'recording'|'conference'|'stream'|'sms'|'sms_status', req: HttpRequestLike): CallEvent;
  /** Empty acknowledgement in the vendor's expected shape (Twilio: '<Response/>' or 204). */
  ack(family: CallEvent['kind']): HttpResponseLike;
}

// ---------- Inbound / outbound routing response (the IR) ----------
type CallInstruction =
  | { op: 'say'; text: string; voice?: string }                      // 'Polly.Joanna' becomes a config value
  | { op: 'hangup' }
  | { op: 'reject'; reason: 'busy'|'rejected' }
  | { op: 'record_voicemail'; maxSeconds: number; beep: boolean; callbackPath: string }
  | { op: 'start_stream'; name: string; url: string; tracks: 'inbound'|'outbound'|'both'; params: Record<string,string> }
  | { op: 'stop_stream'; name: string }
  | { op: 'dial_agent'; agentIdentity: string; timeoutSec: number; answerOnBridge: boolean;
      record: 'none'|'dual_from_answer'; actionPath: string; recordingCallbackPath?: string;
      statusCallbackPath: string; statusEvents: ('answered'|'completed')[]; params: Record<string,string> }
  | { op: 'dial_number'; to: E164; callerId: E164; timeoutSec: number; actionPath: string;
      statusCallbackPath: string; statusEvents: ('answered'|'completed')[] }
  | { op: 'join_conference'; room: string; participantLabel: string; startOnEnter: boolean; endOnExit: boolean;
      beep: boolean; muted?: boolean; coachLeg?: LegRef; waitPath?: string; exitPath: string;
      statusCallbackPath: string; statusEvents: ('start'|'end'|'join'|'leave')[] }
  | { op: 'hold_music'; loop?: boolean }
  | { op: 'gather'; input: ('speech'|'dtmf')[]; numDigits?: number; prompt: CallInstruction[]; actionPath: string;
      speechTimeout?: 'auto'|number };                                // ping-platform screener only
type CallPlan = CallInstruction[];

interface CallPlanRenderer {
  render(plan: CallPlan, baseUrl: string): HttpResponseLike;         // Twilio: TwiML XML
}

// ---------- Live call control (REST today) ----------
interface CallControl {
  fetchCall(call: CallRef): Promise<{ status: CallStatus; direction: 'inbound'|'outbound';
    parent?: CallRef; createdAt: IsoTime; endedAt?: IsoTime; account: string }>;
  listChildLegs(parent: CallRef, limit: number): Promise<{ leg: LegRef; status: CallStatus; createdAt: IsoTime }[]>;
  redirect(call: CallRef, plan: CallPlan): Promise<void>;           // used by conference upgrade and voicemail fallback
  end(call: CallRef, how: 'complete'|'cancel'): Promise<void>;
  dial(input: { to: E164 | { clientIdentity: string }; from: E164; answerPath: string;
    statusCallbackPath: string; statusEvents: ('initiated'|'ringing'|'answered'|'completed')[]; timeoutSec?: number }): Promise<LegRef>;
}

// ---------- Conference, hold, whisper ----------
interface ParticipantState { leg: LegRef; label?: string; muted: boolean; held: boolean; coaching: boolean;
  coachedLeg?: LegRef; startOnEnter: boolean; endOnExit: boolean; status: 'connected'|'ringing'|'left' }
interface ConferenceControl {
  findActive(room: string): Promise<ConferenceRef | null>;
  end(conf: ConferenceRef): Promise<void>;
  listParticipants(conf: ConferenceRef, limit: number): Promise<ParticipantState[]>;
  fetchParticipant(conf: ConferenceRef, leg: LegRef): Promise<ParticipantState>;
  setHold(conf: ConferenceRef, leg: LegRef, held: boolean, holdMusicPath: string): Promise<void>;
  /** Whisper: supervisor leg hears both sides and speaks only to coachedLeg. muted=true is listen-through-conference. */
  setCoaching(conf: ConferenceRef, supervisorLeg: LegRef, input: { coachedLeg: LegRef; muted: boolean }): Promise<void>;
}

// ---------- Media streaming (server receives call audio) ----------
interface MediaFrame { track: 'inbound'|'outbound'; encoding: 'mulaw/8000'; payload: Uint8Array; timestampMs?: number }
interface MediaStreamSession {
  stream: StreamRef; call: CallRef; customParams: Record<string,string>;
  onFrame(cb: (f: MediaFrame) => void): void;
  onStop(cb: () => void): void;
}
interface MediaStreamCodec {
  /** Parses the vendor's WebSocket messages (Twilio: connected/start/media/stop JSON) into sessions and frames. */
  accept(socket: WebSocketLike, expected: { call: CallRef; params: Record<string,string> }): Promise<MediaStreamSession>;
}
interface MediaStreamControl {
  start(call: CallRef, input: { name: string; url: string; tracks: 'inbound'|'outbound'|'both'; statusCallbackPath?: string }): Promise<StreamRef>;
  stop(call: CallRef, streamOrName: StreamRef | string): Promise<void>;
}

// ---------- Recording ----------
interface RecordingControl {
  startDualChannel(call: CallRef, input: { callbackPath: string }): Promise<RecordingRef>;    // conference legs, screener
  stop(call: CallRef, rec: RecordingRef): Promise<void>;
  fetchMeta(rec: RecordingRef): Promise<{ call: CallRef; channels: 1|2; durationSec: number|null; status: 'completed'|'absent'|'processing'; startedAt?: IsoTime; source?: string }>;
  listForCall(call: CallRef): Promise<RecordingRef[]>;                                       // backfill / reconcile
  /** Streams media. Range support is required (compliance links do byte ranges). */
  openMedia(rec: RecordingRef, input: { format: 'wav'; channels: 1|2; range?: string; signal?: AbortSignal }): Promise<Response>;
  delete(rec: RecordingRef): Promise<void>;                                                  // DELETE_*_RECORDINGS_AFTER_COPY
}

// ---------- Browser client credential ----------
interface BrowserClientCredentials {
  /** Today: Twilio AccessToken + VoiceGrant (incomingAllow, outgoingApplicationSid). */
  issue(input: { identity: string; allowIncoming: boolean; ttlSec: number }): Promise<{ token: string; expiresAt: IsoTime; provider: ProviderName }>;
}

// ---------- SMS ----------
interface Messaging {
  send(input: { from: E164; to: E164; body?: string; mediaUrls?: string[]; statusCallbackPath: string }): Promise<{ message: MessageRef; status: string }>;
  normalizeStatus(vendorStatus: string): 'queued'|'sent'|'delivered'|'undelivered'|'failed'|'received'|null;
}

// ---------- The bundle ----------
interface TelephonyProvider {
  name: ProviderName;
  verifier: WebhookVerifier;
  webhooks: WebhookCodec;
  renderer: CallPlanRenderer;
  calls: CallControl;
  conferences: ConferenceControl;
  media: MediaStreamCodec & MediaStreamControl;
  recordings: RecordingControl;
  credentials: BrowserClientCredentials;
  sms: Messaging;
  /** Validates an id string this provider issued (replaces 26 JS + 28 SQL SID regexes). */
  isId(kind: 'call'|'recording'|'conference'|'stream'|'message'|'account', value: string): boolean;
}
```

Browser side (`src/`). This replaces direct `@twilio/voice-sdk` use in `InboundCallContext.jsx` and `supervisorWhisperPhone.js`:

```ts
interface BrowserPhone {
  register(token: string): Promise<void>;
  updateToken(token: string): void;
  destroy(): void;
  on(ev: 'registered'|'unregistered'|'tokenWillExpire', cb: () => void): void;
  on(ev: 'error', cb: (e: { code?: number; message: string }) => void): void;
  on(ev: 'incoming', cb: (call: BrowserCall) => void): void;
  connect(params: Record<string,string>): Promise<BrowserCall>;    // outbound + whisper coach leg
  setInputDevice(deviceId: string): Promise<void>;
}
interface BrowserCall {
  readonly callRef: string;                                        // today call.parameters.CallSid
  readonly customParams: Record<string,string>;                    // today the <Client><Parameter> set
  accept(opts?: { inputStream?: MediaStream }): void; reject(): void; disconnect(): void;
  mute(on: boolean): void; sendDigits(d: string): void;
  remoteStream(): MediaStream | null;
  on(ev: 'accept'|'disconnect'|'cancel'|'reject', cb: () => void): void;
  on(ev: 'volume', cb: (input: number, output: number) => void): void;
}
```

Supervisor **listen** stays EnrollGen-owned: it is a WS relay of `MediaFrame`s (`supervisorTap.js`, `supervisorListen.js`). It only needs `MediaStreamCodec` to be vendor-neutral.

### 1.2 Config switch
`TELEPHONY_PROVIDER=twilio|fake`. The browser gets `provider` from the token response (no `VITE_` var). Vendor secrets keep their vendor prefix (`TWILIO_*`). The `voice` for `say` moves to the profile (`telephony.voice`, default `Polly.Joanna` for `twilio`).

### 1.3 Data migration
Add `provider text NOT NULL DEFAULT 'twilio'` and `provider_call_id` / `provider_recording_id` / `provider_conference_id` / `provider_stream_id` / `provider_message_id` beside the existing `*_sid` columns. Replace SQL SID regex CHECKs with `provider`-scoped checks or drop them. Storage paths move to `{tenant}/{call_uuid}/{recording_uuid}.wav`; keep the old path in a column for backfilled rows.

### 1.4 Conformance suite: `tests/conformance/telephony.*`
Run against `twilio` with recorded fixtures and HTTP mocked, and against `fake`:
1. **Verifier:** a valid signature passes. Tampered body, URL or header fails. Proxy/scheme/port variations of the public URL are handled as documented.
2. **WebhookCodec:** every fixture family (`voice`, `dial`, `status`, `recording` incl. absent and duration `-1`, `conference` start/end/join/leave, `stream`, `sms` with 0–10 media, `sms_status`) parses to the exact `CallEvent`. An unknown account id is rejected.
3. **Renderer golden tests:** each `CallInstruction` renders to the stored golden output (byte-for-byte for Twilio, like the existing "screener bypass returns the S6 TwiML byte for byte" test on ping). `dial_agent` keeps all ten custom params. `join_conference` with `coachLeg` sets whisper.
4. **Round-trip routing:** `voicemail`, `busy reject`, `dial agent → no-answer → next agent`, `dial agent → answered → hangup` through the router with the provider swapped. The same agent-claim RPC calls happen in the same order.
5. **CallControl:** `fetchCall` and `listChildLegs` map statuses. `redirect` sends a rendered plan. `end` maps in-progress→complete and ringing→cancel. 404/20404 for an already-ended call is treated as success.
6. **Conference:** upgrade a 2-leg call to a conference; warm transfer holds then unholds the customer; blind transfer; third-party dial; departure; finish ends the room. Coaching set/verify for whisper, including the fail-closed `coachingConfirmed` invariants (`supervisorWhisper.js:24-27`).
7. **Media:** a fixture WS session yields a `MediaStreamSession` with matching params. Frames come out per track. A wrong stream id or non-μ-law format is rejected. `stop` is delivered once.
8. **Recording:** `startDualChannel` returns a ref. `fetchMeta` channels map correctly. `openMedia` honors `Range` with 206/416. Redirects stay on the provider's allowed hosts. `delete` is idempotent.
9. **Credentials:** the token decodes with the given identity, TTL and incoming flag. Secrets are never logged.
10. **SMS:** send with and without media. Status normalization table. Inbound media URLs pass `messageMediaHosts` validation.
11. **isId:** accepts provider-issued formats and rejects everything else.

`fake` provider: in-memory call graph, deterministic ids (`fake-call-1`), and a renderer that emits JSON. A `FakeMediaStream` emits scripted frames. Recordings come from fixtures. It powers `pilot:load:*` and all routing unit tests without network access.

### 1.5 Effort / risk
**L.** Highest risk to live routing. Order inside the seam: verifier → webhook codec → renderer (golden-tested against today's TwiML) → SMS → recording retrieval → call control → conference/whisper → media streams → browser phone.

### 1.6 Open questions (verify in vendor docs)
- Does a candidate carrier support **coach/whisper** on a conference participant (speak to one leg only)? If not, whisper needs an EnrollGen-side audio mix, which changes the interface.
- Does it deliver **dual-channel** call recordings with a fixed channel→party mapping, and on-demand **MP3** transcoding? If not, MP3 must be produced by EnrollGen (see §6).
- Does it support **bidirectional per-track media streaming over WebSocket** in 8 kHz μ-law, started and stopped mid-call via REST, with custom parameters?
- Does it have **answer-on-bridge** (caller hears ringback until the agent answers) and a dial `action` callback with a bridged flag?
- What is its **webhook signature scheme**, and does it sign form or JSON bodies?
- Does its browser SDK expose per-call custom parameters, `tokenWillExpire`, input device selection, and the remote `MediaStream` (used for waveform and customer-audio capture)?
- Speech `<Gather>` equivalent for the ping screener, and whether caller speech is retained by the vendor.
- A2P 10DLC registration portability: can existing brand and campaign registrations move between carriers?

---

## 2. Speech-to-text

```ts
interface SttWord { text: string; startMs: number; endMs: number; confidence?: number }
interface SttResult { text: string; isFinal: boolean; startMs: number; endMs?: number; words?: SttWord[]; confidence?: number }

interface StreamingStt {
  /** One mono stream per speaker. That is today's design (deepgramTrack.js), so no multichannel live STT is needed. */
  open(input: { encoding: 'mulaw/8000' | 'linear16/16000' | 'linear16/48000'; language?: string;
    interim: boolean; endpointingMs?: number; signal: AbortSignal }): Promise<SttStream>;
}
interface SttStream {
  write(audio: Uint8Array): boolean;          // false when backpressured, like bufferedAmount today
  keepAlive(): void;
  finish(): Promise<void>;                    // flush finals, then close (Deepgram CloseStream today)
  on(ev: 'result', cb: (r: SttResult) => void): void;
  on(ev: 'utterance_end' | 'close', cb: () => void): void;
  on(ev: 'error', cb: (e: { code: string; retryable: boolean }) => void): void;
  readonly sentAudioSeconds: number;          // feeds stt_seconds usage
}

interface BatchStt {
  transcribe(input: { audio: Uint8Array | ReadableStream; contentType: 'audio/wav'|'audio/mpeg';
    channels: 1 | 2; channelRoles?: Record<0|1, 'agent'|'customer'>;   // 2 = multichannel, else diarize
    language?: string; signal: AbortSignal }): Promise<BatchTranscript>;
}
interface BatchTranscript {
  text: string; language?: string; durationSec?: number;
  utterances: { speaker: string; channel?: number; text: string; startMs: number; endMs: number; confidence?: number }[];
}

/** Browser direct-connect (customer audio). Short-lived credential, minted by the server. */
interface BrowserSttCredentials {
  issue(input: { ttlSec: number }): Promise<{ token: string; wsUrl: string; protocol: string; provider: ProviderName }>;
}
```

- The talk-time, WPM, pause, interruption and confidence metrics in `transcribe.js` / `backfill-deepgram-intelligence.js` move to one vendor-neutral function over `BatchTranscript.utterances`. That removes the triplicated Deepgram parsing.
- Stored labels: `transcript_source='deepgram_server'` becomes `'server_stt'` plus a `stt_provider` column. `usage_records.record_type='deepgram_minutes'` becomes `'stt_minutes'` plus `metadata.provider`. Drop the stale `'claude_tokens'` value or map it to `'llm_tokens'`.
- The browser Web Speech path (`useSpeechRecognition.js`) is its own `BrowserSpeechRecognizer` adapter. It's already isolated in a hook, so no change is needed beyond naming.

**Config:** `STT_PROVIDER=deepgram|fake`, `STT_MODEL=nova-2` (today hard-coded ×5), `STT_BATCH_PROVIDER` (defaults to `STT_PROVIDER`). The browser receives `provider` and `wsUrl` from the credential endpoint, so the hard-coded `wss://api.deepgram.com` (`useCustomerAudio.js:21`) and the CSP entry come from config.

**Conformance:**
1. Streaming: feed the fixture μ-law file and get finals in order with monotonically non-decreasing `startMs`; interim results are superseded by finals.
2. `finish()` flushes the last final before `close`.
3. Backpressure: `write` returns false past the limit, and no audio is dropped silently. The existing `transcription_gap` behavior is preserved by the caller.
4. Error mapping: auth error → `retryable:false`; network drop → `retryable:true`. The reconnect budget stays EnrollGen-owned.
5. Batch: a mono fixture diarizes to ≥2 speakers. A stereo fixture maps channel→role exactly. Timings are within tolerance of the golden transcript.
6. Usage: `sentAudioSeconds` equals bytes/8000 for μ-law.
7. Credential: expires at TTL and is never logged.

`fake`: emits scripted results from a fixture transcript keyed by audio length. Batch returns the fixture.

**Effort / risk:** **M.** Low routing risk. The STT failure path already degrades to `transcription_error` without affecting the call.

**Open questions (verify in vendor docs):** μ-law 8 kHz streaming input support; interim results and utterance-end/VAD events; multichannel batch with per-channel utterances; a short-lived browser token mechanism; word-level timestamps.

---

## 3. AI models

The existing `Adapter` (`src/lib/llm/types.ts`) is the right shape. Changes needed:

```ts
type Provider = string;                       // was: 'openai'

interface LlmAdapter {                        // = today's Adapter, unchanged signatures
  complete(req: CompletionRequest, model: string, signal: AbortSignal): Promise<Completion>;
  stream(req: CompletionRequest, model: string, signal: AbortSignal): AsyncIterable<LlmStreamEvent>;
  /** Declares what the adapter supports so config validation fails at boot, not mid-call. */
  capabilities(): { jsonSchemaStrict: boolean; tools: boolean; promptCaching: boolean; reasoningTokens: boolean };
}

/** Internal, vendor-neutral stream protocol. Today's events mirror Anthropic's Messages stream; keep the names but own them. */
type LlmStreamEvent =
  | { type: 'message_start'; message: Pick<Completion,'id'|'model'> }
  | { type: 'content_block_start'; index: number; content_block: { type: 'text' } | { type: 'tool_use'; id: string; name: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: Completion['stop_reason'] }; usage: Usage }
  | { type: 'message_stop'; completion?: Completion };

interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;                // must equal the vector(N) column; checked at boot
  embed(input: string[], signal: AbortSignal): Promise<{ vectors: number[][]; usage: { input_tokens: number } }>;
}

interface ModelRouting {                      // replaces hard-coded names in config.js / client.ts
  model(path: 'live'|'summary'|'scoring', engine: Engine): string;
  model(task: NonNullable<CompletionRequest['task']> | 'screener'): string;
  fallback(): string | null;
}
```

- All five embeddings bypasses (`embeddings.js`, `transcript-import.js`, `post-call-background.js`, `src/lib/embeddings.js`, `scripts/embed_cms_landscape_2027.mjs`) call `EmbeddingProvider`.
- The ping screener (`telephony/src/ping/screenerProviders.js`) calls `LlmAdapter.complete` with `task:'screener'`. That puts it under the same redaction, telemetry and timeouts. Its 3 s deadline becomes a per-task setting.
- `resolveProvider` stops throwing for non-OpenAI providers. Instead, `capabilities()` is checked against what the path needs (scoring needs `jsonSchemaStrict`). The current "scoring must stay on OpenAI" comment becomes an explicit `LLM_PROVIDER_SCORING` with a capability check.

**Config:** `LLM_PROVIDER` (exists), `LLM_PROVIDER_<ENGINE>` (exists), new `LLM_PROVIDER_SCORING`, `LLM_MODEL_LIVE` / `LLM_MODEL_SUMMARY` / `LLM_MODEL_SCORING` (replacing hard-coded `gpt-5.6-luna`), `LLM_FALLBACK_MODEL` (exists), `RTS_INGESTION_OPENAI_MODEL` → `LLM_MODEL_RTS_INGESTION` (keep the old name as an alias), `KNOWLEDGE_UPDATE_OPENAI_MODEL` → `LLM_MODEL_KNOWLEDGE_UPDATE`, `SCREENER_OPENAI_MODEL` → `LLM_MODEL_SCREENER`, `EMBEDDING_PROVIDER=openai|fake`, `EMBEDDING_MODEL=text-embedding-3-small`, `EMBEDDING_DIMENSIONS=1536`.

**Conformance (per adapter, recorded fixtures):**
1. Plain text completion → `content[0].text`, `stop_reason:'end_turn'`, usage populated.
2. Strict JSON schema → `parsed` validates against the AJV schema in `src/lib/llm/schemas/*`.
3. Tool call → `tool_calls[]` with ids. Streamed `input_json_delta` concatenates to valid JSON.
4. Stream event order is exactly the `LlmStreamEvent` grammar and ends with `message_stop` carrying the completion.
5. Error mapping: 429/5xx/timeout → transient (`client.ts` retry/fallback works unchanged); 4xx → non-transient.
6. Abort signal cancels within 100 ms.
7. Redaction: the adapter never receives unredacted payloads. The test asserts on the outbound request body.
8. Embeddings: `vectors.length === input.length`, every vector has length `dimensions`, deterministic for the fake.

`fake`: scripted completions keyed by `task/path`, hash-based deterministic embeddings. This already almost exists: `runtime.adapters` is injectable.

**Effort / risk:** **S** for the chat client (already abstracted). **M** for embeddings: re-embedding is required if the model changes, because `vector(1536)` is stored. **M** for the screener on the ping branch, which is in the inbound path.

**Open questions:** whether a candidate model vendor supports strict JSON-schema output equivalent to the current schemas, prompt caching, and a 1536-dim embedding (otherwise migrate the vector columns).

---

## 4. Database

Postgres itself is portable. The coupling is to **PostgREST + Supabase auth functions + platform roles + Vault + Storage + Realtime**. Five interfaces, in order of payoff:

### 4.1 `DbClient`: the supabase-js subset actually used
The methods in use (counts from all app code): `.from().select` (262), `.eq` (460), `.filter` (113), `.maybeSingle` (106), `.update` (91), `.order` (65), `.single` (64), `.limit` (52), `.insert` (36), `.in` (20), `.range` (15), `.abortSignal` (14), `.is` (12), `.not` (11), `.upsert` (9), `.ilike` (7), `.match` (4), `.delete` (3), `.gte`/`.lte`/`.gt`/`.lt`/`.or` (≤2 each), and `.rpc` (207).

```ts
type Filter = ['eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'ilike'|'is'|'in', string, unknown] | ['not', string, string, unknown] | ['or', string];
interface Query<T> {
  select(cols?: string, opts?: { count?: 'exact'; head?: boolean }): Query<T>;
  eq(c: string, v: unknown): Query<T>; neq(c: string, v: unknown): Query<T>; in(c: string, v: unknown[]): Query<T>;
  is(c: string, v: null|boolean): Query<T>; not(c: string, op: string, v: unknown): Query<T>;
  gt(c: string, v: unknown): Query<T>; gte(c: string, v: unknown): Query<T>; lt(c: string, v: unknown): Query<T>; lte(c: string, v: unknown): Query<T>;
  ilike(c: string, p: string): Query<T>; or(expr: string): Query<T>; match(o: Record<string,unknown>): Query<T>;
  filter(c: string, op: string, v: unknown): Query<T>;
  order(c: string, o?: { ascending?: boolean; nullsFirst?: boolean }): Query<T>;
  limit(n: number): Query<T>; range(from: number, to: number): Query<T>;
  single(): Promise<DbResult<T>>; maybeSingle(): Promise<DbResult<T | null>>;
  abortSignal(s: AbortSignal): Query<T>;
  then: Promise<DbResult<T[]>>['then'];
}
interface DbResult<T> { data: T; error: { code: string; message: string } | null; count?: number }
interface DbClient {
  from<T = any>(table: string): Query<T> & {
    insert(rows: object | object[]): Query<T>; update(patch: object): Query<T>;
    upsert(rows: object | object[], o?: { onConflict?: string; ignoreDuplicates?: boolean }): Query<T>; delete(): Query<T>;
  };
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Query<T>;
}
```
Adapters: `supabase` (today's `createSupabaseClient`, unchanged) and `postgres` (`pg` driver that compiles the builder to parameterized SQL and runs `SELECT fn(...)` for RPCs, inside a transaction that sets the identity GUCs from §4.2). The audit wrapper (`evidenceAudit.js`) and telemetry wrap `DbClient`, not supabase-js.

**Browser (114 calls in 37 files):** the browser cannot hold a `pg` connection. Options: (a) keep a PostgREST-compatible endpoint (self-hosted PostgREST is a component, not a Supabase lock-in), or (b) move browser reads and writes behind server `/api/data/*` handlers that use `DbClient` as the service identity plus an explicit subject. Recommendation: (a) first, since it keeps RLS as the enforcement point; (b) over time for the 37 files. **Open question:** whether the target host runs PostgREST alongside Postgres.

### 4.2 `IdentityContext`: replace `auth.jwt()` / `auth.role()` / platform roles
Introduce `app` schema shims and repoint 31 migrations' claim reads to them. Only three central functions read claims directly (`current_deployment_identity`, `is_current_tenant`, `deployment_is_admin`, in `152`), so most policies already go through them.
```sql
-- Provided per platform. Supabase adapter wraps auth.jwt(); plain-PG adapter reads current_setting('app.subject'...).
app.subject()   RETURNS text    -- was auth.jwt()->>'sub'
app.org_id()    RETURNS text    -- was coalesce(auth.jwt()->>'org_id', auth.jwt()->'o'->>'id')
app.org_role()  RETURNS text    -- was coalesce(auth.jwt()->>'org_role', auth.jwt()->'o'->>'rol')
app.claim(path text) RETURNS text  -- remaining metadata.role reads
app.is_service() RETURNS boolean   -- was auth.role()='service_role' / current_setting('role')='service_role'
```
Roles: create `anon`, `authenticated` and `service_role` on plain Postgres as NOLOGIN group roles so the existing GRANTs keep working. Login roles inherit from them.

### 4.3 `SecretStore` / `KeyProvider`: replace Vault
```ts
interface KeyProvider {
  /** Encryption keys are versioned. Ciphertext already stores key id 'k'. */
  activeKey(purpose: 'pii_encryption'): Promise<{ keyId: Uuid; material: Uint8Array }>;
  key(purpose: 'pii_encryption', keyId: Uuid): Promise<Uint8Array>;
  /** Blind-index and pepper keys MUST be versioned separately from encryption keys. */
  hashKey(purpose: 'pii_blind_index' | 'phone_pepper' | 'mbi_pepper', version?: number): Promise<{ version: number; material: Uint8Array }>;
}
```
- Supabase adapter: today's `vault.decrypted_secrets`.
- Portable adapter: an external KMS or secret manager, with key material passed to SQL via a transaction-local GUC set by the trusted server, or encryption moved app-side. **Open question:** KMS choice and whether pgcrypto exists on the target host.
- Data change required: add `hash_version` to `contacts.phone_hash` / `name_search` (pilot), ping `ping_phone_hash` rows (ping), and `mbi_match_key` (gold). Without it, none of the three can ever be rotated (VENDOR_COUPLING §5.3).

### 4.4 `ObjectStore`: replace Supabase Storage
```ts
interface ObjectStore {
  put(bucket: 'call-recordings'|'message-media'|string, path: string, body: ReadableStream|Uint8Array, o: { contentType: string; upsert?: boolean }): Promise<void>;
  get(bucket: string, path: string, o?: { range?: string; signal?: AbortSignal }): Promise<Response>;
  signedUrl(bucket: string, path: string, ttlSec: number): Promise<string>;     // 300 s today; 86400 s for GIFs
  delete(bucket: string, path: string): Promise<void>;
  list(bucket: string, prefix: string): Promise<{ path: string; size: number }[]>;
}
```
`storage.objects` RLS policies (migrations 018/065/153/157) become ObjectStore-adapter configuration. Browser access to recordings already goes through signed URLs from Netlify functions, so no browser storage SDK use needs to move.

### 4.5 `ChangeFeed`: replace Realtime (2 subscribers)
```ts
interface ChangeFeed { subscribe(table: 'carrier_rts', filter: Record<string,string>, cb: (e: { op: 'INSERT'|'UPDATE'|'DELETE'; row: object }) => void): () => void }
```
Fallback adapter: polling every N seconds. Both consumers (`RTSTab.jsx`, `RateComparisonPanel.jsx`) tolerate latency.

**Config:** `DB_PROVIDER=supabase|postgres`, `DATABASE_URL` (postgres), `OBJECT_STORE_PROVIDER=supabase|s3compatible|fake` (the latter name is a placeholder; capabilities are an open question), `KEY_PROVIDER=supabase_vault|env|kms`, `CHANGE_FEED_PROVIDER=supabase_realtime|poll`.

**Conformance:**
- `DbClient`: a shared fixture DB (PGlite, already in devDeps). Every builder method returns identical `data` / `error.code` across the `supabase` (against local Supabase) and `postgres` adapters. `.single()` errors on 0 and on >1 rows; `.maybeSingle()` errors only on >1. RPC argument mapping and `SETOF` vs scalar returns are covered. Abort propagates.
- `IdentityContext`: for each of agent, manager, admin, service and anonymous, the same rows are visible in the five most sensitive tables (contacts, call_records, recording_ingestion, messages, deployment_authorities) on both platforms. The existing `catalog.expected.json` and drift checker gain a "no `auth.` references outside `app.*` shims" rule.
- `KeyProvider`: encrypt → decrypt round trip; old key ids still decrypt after rotation; blind-index lookup works across a version bump when `hash_version` is honored.
- `ObjectStore`: put/get/range/signedUrl expiry/delete idempotency, plus path traversal rejection (mirrors `recordingCompliance.js:28-30`).
- `ChangeFeed`: an insert is delivered once; unsubscribe stops delivery.

`fake`: in-memory `DbClient` only for unit tests that don't touch SQL. Most DB tests should use PGlite through the `postgres` adapter.

**Effort / risk:** **L** overall (IdentityContext **M**, DbClient server **M**, browser path **L**, KeyProvider **M**, ObjectStore **S**, ChangeFeed **S**). Routing risk: the routing RPCs (`claim_*`, `release_*`, `paragon_ping`, `enqueue_recording`) run through `DbClient`, so swap the server adapter only after the conformance suite is green.

---

## 5. Login

```ts
interface AuthVerifier {                      // server
  verify(bearer: string): Promise<{ subject: string; sessionId: string | null; orgId: string | null;
    orgRole: string | null; roleClaims: Record<string,string|null>; expiresAt: number; authorizedParty?: string; audiences: string[] }>;
}
interface BrowserAuth {                        // client
  Provider: React.ComponentType<{ children: React.ReactNode }>;
  SignIn: React.ComponentType;
  useSession(): { userId: string|null; orgId: string|null; orgRole: string|null; loaded: boolean; signOut(): Promise<void> };
  getToken(o?: { skipCache?: boolean }): Promise<string|null>;       // also feeds DbClient (§4.1)
  useProfile(): { id: string; displayName: string; email?: string; imageUrl?: string } | null;
}
```
- All `@clerk/clerk-react` imports (11 files) go through `src/lib/auth/` exports. `user.organizationMemberships[0].role` (3 sites) becomes `useSession().orgRole`.
- `_clerkAuth.js`, `telephony/src/clerkAuth.js` and `supervisorListen.js` call `AuthVerifier`. `browserBoundary.js` `azp`/`aud` checks move inside the Clerk adapter.
- Data: `clerk_user_id` / `clerk_org_id` become `auth_subject` / `auth_org` plus an `auth_provider` column. The profile `organizationId` regex `^org_` (`deploymentProfile.js:25`) becomes provider-validated.
- The SQL side is covered by `IdentityContext` (§4.2). The JWT claim paths (`o.id`, `o.rol`, `public_metadata.role`) live only in the Clerk adapter's `app.*` shim.

**Config:** `AUTH_PROVIDER=clerk|fake` (server), browser provider fixed at build by the same value through `deployment-public`. Keep `CLERK_*` names.

**Conformance:** valid token → claims; expired, wrong `azp`, wrong `aud` and bad signature → reject; org and non-org sessions; role mapping table (`admin`, `org:admin`, `owner`, metadata role); `dev-bypass` subject is rejected when hosted (`authSafety.js`). The browser `fake` signs tokens with a test key that the `fake` verifier and the PGlite `app.*` shims accept.

**Effort / risk:** **M**. A browser-wide refactor plus a DB identity migration. Routing risk is indirect: agent voice tokens and WS auth depend on it.

**Open questions:** how a candidate IdP expresses org/tenant and org role in its session token, its token lifetime and refresh model in the browser, and how existing user ids would map (export/import of subjects).

---

## 6. Recording storage

Built from `RecordingControl` (§1) + `ObjectStore` (§4.4) + a new transcoder:

```ts
interface RecordingArchive {
  /** Copy provider recording → ObjectStore. Idempotent per recording UUID (replaces per-RecordingSid immutability). */
  ingest(job: { recordingId: Uuid; tenantId: Uuid; callId: Uuid; source: RecordingRef }): Promise<{ path: string; sha256: string; bytes: number }>;
  open(recordingId: Uuid, o: { format: 'wav'|'mp3'; range?: string; signal?: AbortSignal }): Promise<Response>;
  issueCapability(recordingId: Uuid, o: { format: 'wav'|'mp3'; ttlSec: number; purpose: 'compliance'|'download'|'transcription'; actor: string }): Promise<{ url: string; expiresAt: IsoTime }>;
}
interface AudioTranscoder { toMp3(wav: ReadableStream, o: { channels: 1|2 }): Promise<ReadableStream> }
```
- Removes the "MP3 requires a retained Twilio recording" constraint (`recordingComplianceGrant.js`, `complianceUploads.js:71`, `ixUploads.js:87`). Conversely and IX read from `RecordingArchive.open(..., 'mp3')`.
- Capability tokens, hashing, expiry, whisper-hold revalidation and evidence audit stay as-is. They're already vendor-neutral.
- **Backfill path:** for rows with `copy_status != 'stored'`, call `RecordingControl.listForCall` then `ingest`, as today (`recordings.js:220-238`). For already-stored rows, write `provider='twilio'`, `provider_recording_id=recording_sid`, and leave the path alone. New rows use UUID paths.

**Config:** `RECORDING_ARCHIVE_STORE` (defaults to `OBJECT_STORE_PROVIDER`), `AUDIO_TRANSCODER=provider|local` (`provider` = today's Twilio `.mp3` URL).

**Conformance:** ingest is idempotent (same sha256 on replay); `open` WAV and MP3 with Range; a capability URL expires; a revoked whisper-held recording returns 404; a deleted provider original still serves from the archive.

**Effort / risk:** **M**. Low routing risk (post-call only). **Open question:** whether a candidate carrier exposes recordings at a stable authenticated URL with dual channels.

---

## 7. Hosting

```ts
// Functions: already Fetch-API shaped (72/72 use `export default (Request) => Response`).
type Handler = (req: Request, ctx: { waitUntil(p: Promise<unknown>): void; clientIp(): string | null }) => Promise<Response>;
interface FunctionHost {
  route(path: `/api/${string}`, h: Handler): void;
  background(name: string, h: Handler): void;               // 202 + long timeout (5 functions today)
  schedule(name: string, cron: string, h: () => Promise<void>): void;   // 6 schedules today
}
interface PublicPaths { api(name: string): string }          // replaces 37 hard-coded '/.netlify/functions/...'
```
- `clientIp()` replaces `x-nf-client-connection-ip` (`paragon-vendor-report.js:59`). `waitUntil` replaces `context.waitUntil` (`_llmTelemetry.js:9`).
- Netlify adapter: today's layout and `netlify.toml`. Container adapter: one Node server mounting the same handlers (the `serverRequest(...)` wrapper already exists in `telephony/src/lib/adminActions.js`), with an in-process scheduler like the integrations worker's.
- Background calls between functions (`compliance-review.js:81,97`, `post-call.js:77`, `post-call-admin.js:30`) go through a `JobQueue` (`enqueue(name, payload)`). The Netlify adapter is today's self-POST; the container adapter is an in-DB job table (the pattern already used for recordings and Paragon jobs).
- Telephony and worker stay containers. Replace `RAILWAY_*` detection with `ENROLLGEN_HOSTED=true` (keep the Railway names as one adapter's inputs). Make the single-replica assumption explicit: `TELEPHONY_REPLICAS=1` is required at boot until stream leases and the WS registry are externalized.
- Security headers and CSP: emit both `_headers` (Netlify) and a JSON header map consumed by the container adapter. `CSP_MODE` is unchanged.
- Edge `get-availability`: `handler.js` is already portable. Mount it in `FunctionHost` too, so Supabase Edge becomes optional.

**Config:** `FUNCTION_HOST=netlify|node`, `ENROLLGEN_HOSTED`, `TELEPHONY_REPLICAS`.

**Conformance:** for every handler, the same request fixtures produce identical status and body under both adapters; background returns 202 and the job runs; each schedule fires at its cron time under a fake clock; `clientIp` comes from the configured trusted header only; WS upgrade paths (`/media`, `/agent`, `/conference-media/*`, `/supervisor-listen`) are reachable through the telephony host's proxy.

**Effort / risk:** **M**. Routing risk is limited to the telephony container (WebSocket support, health check, public URL). **Open question:** WebSocket idle timeout and max connection duration on any candidate host.

---

## 8. Outbound connections

Most are already thin. The pattern is one interface per *role*, not per vendor:

```ts
interface LeadVendorAdapter {                 // Paragon today; generalized on ping as telephony/src/ping/adapter.js
  name: string;
  parsePing(req: HttpRequestLike): { state?: string; phone?: E164; callId?: string; fields: Record<string,string> };
  pingResponse(decision: { accept: boolean; reason?: string; agentId?: Uuid }): HttpResponseLike;
  availabilityPayload(snapshot: object, format: string): object;
  postback(disposition: object, fieldMap: object): { url: string; body: string; headers: Record<string,string> };
  dailyReport(rows: object[]): { csv: string; subject: string };
}
interface CrmWebhook {                        // GHL
  postCall(payload: object): Promise<{ status: number }>;
  enrollment(payload: object): Promise<{ status: number }>;
}
interface ComplianceProcessor {               // Conversely
  submit(batch: { recordings: { id: Uuid; url: string; format: 'mp3'|'wav' }[]; metadata: object }): Promise<{ status: number; externalId?: string }>;
}
interface EnrollmentRecordingSink {           // Sunfire IX
  authenticate(): Promise<void>;
  upload(job: { callId: Uuid; legs: { filename: string; startTime: IsoTime; endTime: IsoTime; audio: ReadableStream }[] }): Promise<{ externalId: string }>;
}
interface Mailer {                            // Resend-shaped today
  send(m: { from: string; replyTo?: string; to: string[]; subject: string; text?: string; html?: string;
    attachments?: { filename: string; content: Uint8Array }[]; idempotencyKey: string }): Promise<{ id?: string }>;
}
interface Billing {                           // Stripe
  checkout(o: { tenantId: Uuid; plan: 'starter'|'pro'; customerRef?: string }): Promise<{ url: string }>;
  portal(o: { customerRef: string }): Promise<{ url: string }>;
  parseWebhook(req: HttpRequestLike): Promise<{ type: string; subscription?: { ref: string; customerRef: string; status: string; plan: string; seats: number } }>;
}
interface GifSearch { search(q: string, limit: number): Promise<{ id: string; url: string }[]>; fetch(id: string): Promise<Uint8Array> }
interface ScriptureSource { verse(ref: string): Promise<{ text: string; ref: string }> }
interface DataVendor { enrich(i: { state?: string; zip?: string|null; t65?: boolean }): Promise<object|null> }   // already on ping (dataVendors.js)
interface RateQuoteService { medSupRates(i: { zip: string; age: number; gender: string; tobacco: boolean; planLetter: string }): Promise<object[]> }   // CSG; must move server-side
```

**Config:** `LEAD_VENDORS=paragon`, `CRM_WEBHOOK_PROVIDER=ghl|none`, `COMPLIANCE_PROCESSOR=conversely|none`, `ENROLLMENT_RECORDING_SINK=sunfire_ix|none`, `MAILER_PROVIDER=resend|fake`, `BILLING_PROVIDER=stripe|none`, `GIF_PROVIDER=giphy|none`, `SCRIPTURE_PROVIDER=biblia`, `PING_DATA_VENDORS` (exists on ping), `RATE_QUOTE_PROVIDER=csg|none`. Existing feature flags remain the on/off switches. Provider vars only choose the implementation. Stored ids (`ghl_*`, `stripe_*`, `paragon_*`, `conversely_*`) get a `provider` column only where more than one implementation is plausible (CRM, billing). Paragon-named tables stay until a second lead vendor exists. Renaming them is not worth the churn without a second vendor.

**Conformance (per role):** fixture request → exact outbound HTTP (URL host passes `validateDestination`, headers include the idempotency key, HMAC signature verifies); 2xx/4xx/5xx mapping to the existing retry policy (`integrations/worker.js:20-22`); a disabled flag means no network call. `fake` adapters record calls.

**Effort / risk:** S each (Mailer, Billing, GIF, Scripture, CRM). M for Paragon → `LeadVendorAdapter`: it is in the routing path, but ping already started generalizing it. Do it with the ping merge.

---

## 9. Noise suppression, flags, logging

```ts
interface NoiseSuppressor {                    // DeepFilterNet3 today (AgentAudioProcessor.js)
  create(ctx: AudioContext, o: { onOverload(load: number): void }): Promise<AudioWorkletNode>;
}
interface FeatureFlags { enabled(name: FeatureName): boolean; all(): Record<FeatureName, boolean> }
interface Logger { info(event: string, fields?: object): void; warn(...a: any[]): void; error(...a: any[]): void }
interface AlertSink { deliver(alert: { id: string; rule: string; state: string; count: number; threshold: number }): Promise<{ ok: boolean }> }
```
- **NoiseSuppressor:** `NOISE_SUPPRESSOR=deepfilternet3|none`. Conformance: the node passes audio through at the same sample rate; `none` is identity; overload triggers bypass. **S.**
- **FeatureFlags:** move `STICKY_ROUTING_ENABLED`, `KNOWLEDGE_AUTO_UPDATE_ENABLED`, `PRACTICE_CALLER_ENABLED`, `PRACTICE_VOICE_ENABLED` and `RESHOP_LIST_ENABLED` into `FEATURE_NAMES` (strict parsing, boot-time failure). Optional adapter `FLAG_SOURCE=env|db` for runtime kill switches without redeploy (the `vendor-pause` pattern already exists). **S.** ⚠ Moving `STICKY_ROUTING_ENABLED` to strict parsing changes behavior for values like `TRUE`/`1`, so audit the deployed values first.
- **Logger / AlertSink:** already vendor-neutral (stdout JSON). `AlertSink` adapters `email` (via `Mailer`) and `webhook` (exists). **S.**

---

## 10. Migration order

Lowest risk first, live call routing last. Each step = interface + `fake` + current-vendor adapter + green conformance suite + no behavior change. Commit per step; push once at session end (AGENTS.md).

| Phase | Steps (can run in parallel within a phase) | Effort | Routing risk |
|---|---|---|---|
| **0. Hygiene** (do first, independent) | Rotate the Supabase DB password committed in `.claude/settings.local.json` (`70b2d1a`, still in `main`'s tree). Move stray flags into `FEATURE_NAMES`. Add `ENROLLGEN_HOSTED`. Create a `tests/conformance/` harness. | S | None |
| **1. Leaf vendors** | `Mailer`, `Billing`, `GifSearch`, `ScriptureSource`, `RateQuoteService` (server proxy), `NoiseSuppressor`, `AlertSink`, `CrmWebhook` | S each | None |
| **2. AI** | `EmbeddingProvider` (5 bypasses) ∥ `ModelRouting` (remove hard-coded `gpt-5.6-luna`, `text-embedding-3-small`) ∥ open `Provider` type + `capabilities()`. On ping: route the screener through `LlmAdapter`. | S–M | None (pilot). Low on ping (screener). |
| **3. STT batch** | `BatchStt` + shared metrics; delete the triplicated Deepgram parsing; relabel `deepgram_server` / `deepgram_minutes` | M | None |
| **4. Hosting (functions)** | `PublicPaths` (37 hard-coded paths), `FunctionHost` with `waitUntil`/`clientIp`, `JobQueue` for background fan-out | M | None |
| **5. Storage + recordings** | `ObjectStore` → `RecordingArchive` + `AudioTranscoder`; Conversely/IX read via archive; add `provider` + `provider_*_id` columns and backfill | M | Low (post-call) |
| **6. Identity in SQL** | `IdentityContext` `app.*` shims (Supabase adapter = today's behavior); repoint `current_deployment_identity`/`is_current_tenant`/`deployment_is_admin` and the remaining claim reads; `KeyProvider` with `hash_version` on blind indexes and peppers | M | Medium: RLS and routing RPCs. Run the full identity conformance matrix. |
| **7. Login** | `AuthVerifier` (server) ∥ `BrowserAuth` (client); `auth_subject` columns | M | Low–Medium (voice token, WS auth) |
| **8. DbClient (server)** | Wrap all server supabase-js in `DbClient`; add the `postgres` adapter; run the routing RPCs through it under load (`pilot:load:long`) | M | Medium |
| **9. STT live** | `StreamingStt` (server) ∥ `BrowserSttCredentials` (customer audio) | M | Low (transcription degrades gracefully) |
| **10. Telephony** (last; serial) | 10a `WebhookVerifier` + `WebhookCodec` → 10b `CallPlanRenderer` (golden TwiML parity, then switch `twilioVoice.js` / `voiceOutbound.js` to `CallPlan`) → 10c `Messaging` → 10d `RecordingControl` → 10e `CallControl` → 10f `ConferenceControl` (transfer, hold, whisper) → 10g `MediaStreamCodec`/`Control` → 10h `BrowserPhone`; SID columns → `provider_*_id`; SQL SID regex CHECKs replaced. | L | **High.** Gate each sub-step behind `TELEPHONY_PROVIDER` with `twilio` default, shadow-compare rendered plans in staging, and use a draft `netlify deploy` (never `--prod`) for UI parts. |
| **11. Browser data path** (optional, long tail) | Move the 114 browser `.from/.rpc` calls behind `/api/data/*` or self-hosted PostgREST; `ChangeFeed` | L | Low |

**Parallel tracks:** phases 1, 2, 3 and 4 are independent and can run concurrently. Phase 5 needs `ObjectStore` only. Phase 6 must precede 7 and 8. Phase 9 can start any time after 3. Phase 10 starts only after 6–8 are stable, since the routing RPCs and auth must already be on their interfaces. Branch note: Paragon → `LeadVendorAdapter`, the screener's LLM route and the `phone_pepper` `hash_version` should ride with the `feature/ping-platform` merge. The `mbi_pepper` work belongs to `feature/gold-standards` and should be dropped with it if that branch never merges.
