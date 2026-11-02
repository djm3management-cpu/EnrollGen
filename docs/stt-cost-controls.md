# STT cost controls

Branch: `fix/stt-cost-leaks`. No production changes are applied by this branch.

Apply `supabase/migrations/129_stt_cost_controls.sql` before deploying either service.
It adds the `stt_seconds` record type and recording verification/deletion/retention
metadata. It does not update or delete existing Storage audio.

| Service | Variable | Recommended initial value |
| --- | --- | --- |
| Railway | `STT_WAIT_FOR_ANSWER` | `true` (default) |
| Railway | `DELETE_TWILIO_RECORDINGS_AFTER_COPY` | `false` (default) |
| Netlify frontend build | `VITE_ENABLE_CUSTOMER_AUDIO` | `true` |

No new Netlify server secrets are required: `/api/stt-usage` uses existing Clerk
and Supabase server credentials. Keep existing Deepgram credentials in place.
Railway variable changes require a service restart/redeployment of the current
build to be read; no code change is necessary. Vite variables require a frontend
rebuild.

## Behavior

- The live call context owns server transcription state. A server stream-start
  event marks actual activity; inbound/conference ownership reserves the path
  even while waiting for answer or reconnecting. Conference upgrades reserve it
  before the API request. Browser manual share, automatic capture and START all
  honor the feature flag and this ownership. Pending browser starts are canceled;
  active capture stops on handoff and logs a warning containing only the call SID.
- Inbound TwiML still starts a stream before Dial. This preserves existing signed
  stream binding, rerouting and callback behavior. Deepgram opens only after
  the child attempt's persisted `answered_at` exists and `ended_at` is null.
  Answer callbacks notify local streams immediately; a one-second database poll
  handles callbacks delivered to another replica. Frames received before answer
  are dropped, including during binding. This saves Deepgram usage, **not Twilio
  Media Streams ringing minutes**. `STT_WAIT_FOR_ANSWER=false` restores immediate
  Deepgram connections. Reroutes terminate the old local stream, replace the
  named Twilio stream, and start a fresh answer gate. Voicemail explicitly stops
  the named stream before the greeting/recording. Stream stop, terminal callbacks,
  lease loss and transport close also close Deepgram.
- Each new Storage copy is immutable (`upsert:false`). Verification downloads the
  stored WAV and compares its size and SHA-256 with the downloaded Twilio source.
  Only after verification and durable copy metadata may Twilio DELETE run. Failed
  verification keeps Twilio audio and logs the recording SID. Deletion retries
  are independent of upload; each retry verifies Storage again. Verification,
  deletion-attempt and deletion timestamps are recorded in `recording_ingestion`.
  Turning deletion on also processes existing stored copies, two per worker tick.
- Supabase Storage audio is never removed or overwritten by this code. New copies
  carry a `retention_until` date ten years after storage. Keep external bucket
  lifecycle rules, administrator operations and backups consistent with ten-year
  retention; the database date is retention metadata, not a Storage object lock.
  WAV playback remains available from Storage. Existing Twilio-only MP3 downloads
  and provider-hosted links require the Twilio copy and will stop working after
  deletion; review those workflows before enabling deletion.
- Server usage counts binary mu-law audio bytes actually handed to each socket
  (8,000 bytes/second), excluding keepalives and unsent queues. Browser usage
  counts sent PCM bytes (32,000 bytes/second). One idempotent `usage_records` row
  per connection records `stt_seconds`, source, track, model and call SID. Browser
  reports are authenticated and tenant-scoped; they remain client-reported usage,
  not independently verified billing. Manual sharing outside a tracked softphone
  has a null call SID. Abrupt process/browser termination or failed reporting can
  lose usage; safe diagnostics identify failed reports. Existing token-allocation
  `deepgram_minutes` logging is unchanged.

## Manual verification

1. **Inbound:** let the agent ring for 15 seconds; verify no Deepgram connection
   or transcript before answer. Answer and speak on both sides; verify two server
   tracks and no browser customer socket. Try Share Customer Audio; it must refuse.
   Hang up; verify stream closure and one `stt_seconds` row per Deepgram connection,
   with roughly connected audio seconds per track rather than ringing time.
2. **Outbound:** with `VITE_ENABLE_CUSTOMER_AUDIO=true`, connect and speak; verify
   browser customer capture and one browser usage report on stop. With the flag
   false in a separate preview build, automatic capture, START and manual sharing
   must all refuse customer capture. Agent/browser speech recognition is separate.
3. **Conference:** upgrade an outbound call while browser capture is live. Verify
   it stops before server participant capture; no replacement browser socket may
   start. Verify the warning includes the parent call SID and browser usage is
   finalized once. Speak with a third party, remove one participant and confirm
   the remaining server tracks/transcripts continue.
4. **No answer/voicemail:** test direct voicemail with no agents, and an unanswered
   first agent followed by reroute and voicemail. Verify no Deepgram during either
   ring and stream stop before the voicemail greeting; voicemail recording remains.
5. **Recording safety:** initially leave deletion false. Verify stored WAV playback,
   `copy_verified_at`, byte count/hash and ten-year retention metadata; Twilio must
   still retain the recording. In a controlled preview/test account, enable deletion,
   create a new recording, verify `twilio_deleted_at` appears only after verification,
   and confirm Storage WAV playback/download still works. Simulate a failed Storage
   read or size mismatch with test doubles (do not corrupt retained audio); confirm
   no provider DELETE, an SID-specific error and a retry. Restore deletion to false
   until satisfied with provider-link/MP3 workflow impacts.
