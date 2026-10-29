# Live transcript delay investigation

The reproducible defects were in result identity and live-display wiring. Results
were treated as the next arriving line rather than a revision of a specific audio
segment. This investigation used the repository and deterministic provider/network
fixtures; it did not capture a production call.

## End-to-end findings

1. **Deepgram and dual audio.** `telephony/src/media/mediaStream.js` opens separate
   customer and agent tracks. `telephony/src/media/deepgramTrack.js` already requests
   `interim_results=true` and forwards both interim and final `Results` immediately.
   It does not wait for `UtteranceEnd` or `speech_final`. However, it stamped results
   with their arrival time. Independently delayed channels could therefore appear
   in the wrong conversation order, and reconnects reset Deepgram's offsets.
2. **Transport and storage.** Media events go through
   `telephony/src/media/agentSocket.js` and `src/lib/agentPhoneConnection.js` to
   `InboundCallContext.jsx`. Supabase persistence runs separately and saves finals
   through `telephony/src/transcripts.js`. The live panel does not query or poll
   transcript rows, so no Supabase order/limit is dropping the newest live rows.
3. **Browser result state.** `src/hooks/useCustomerAudio.js` appended a final
   without replacing its preceding interim, leaving obsolete partial text behind.
   `src/context/InboundCallContext.jsx` cleared the current agent interim on any
   final and replaced the last customer interim without checking segment identity.
   Reproductions demonstrated an older final deleting newer speech. Both browser
   handlers discarded the audio offsets needed to distinguish those segments.
4. **Timer guard.** `src/lib/llm/transcriptGuard.js` uses captured and acknowledged
   revisions. A segment arriving during an in-flight request stays pending. Its
   timer gates coaching requests in `useCopilotEngineCore.js`, not transcript
   rendering. Existing guard tests cover this race; no guard change was needed.
5. **React display.** MA already forwards `liveTranscript` through
   `ScriptPrompter.jsx` and `ScriptFlow.jsx` to `MiniLiveTranscript.jsx`. Its
   functional state updates and memo dependencies are current. Its existing layout
   and resize effects follow new text unless the user deliberately scrolls up.
   ACA, MedSup, and U65 instead constructed finalized-only arrays, so their latest
   speech was hidden until recognition finalized. Positional widget keys also
   remounted rows as the rolling window or conversation order changed.

## Fix

- Supply stable connection/segment IDs and audio-based timestamps. Both server
  tracks share an origin, use Twilio media offsets, and retain that timeline across
  Deepgram reconnects. Browser capture also preserves Deepgram segment offsets.
- Reconcile results with `src/lib/liveTranscript.js`: replace the matching interim,
  deduplicate finals, reject stale interims, and preserve newer speech when an older
  final arrives. A new connection supersedes old pending text without merging its
  reset offsets into an old segment.
- Preserve segment IDs in `useMergedTranscript.js`, use them as widget keys, and
  feed interim recognition text into ACA, MedSup, and U65's existing live panels.
  Saved evidence and coaching inputs continue to contain only finalized text.

Deepgram documents segment finals as independent of utterance completion:
[Endpointing and interim results](https://developers.deepgram.com/docs/understand-endpointing-interim-results).

## Regression coverage

`tests/customer-audio.test.js` and `tests/phone-stabilization.test.js` first failed
on the original stale-partial and erased-latest-speech cases. They now cover both
speakers, repeated finals, and delayed interims. The latter also executes the real
Deepgram handler, phone provider, merge hook, and transcript widget together and
asserts that the latest partial and final text is rendered in timestamp order
without a speech-final event.

`tests/live-transcript.test.js` covers growing/replaced live text, stable keys,
the rolling display window, all three additional panels, automatic following,
manual scroll preservation, and resuming at the latest line.
`telephony/tests/mediaStream.test.js` covers immediate interim/final delivery,
Twilio offsets, a shared channel origin, and reconnect offset preservation.

Call routing, compliance scoring, Co-Pilot engine logic, and site styling were not
changed.
