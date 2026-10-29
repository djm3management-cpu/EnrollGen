# Agent microphone processing

The app installs `@workadventure/noise-suppression` 0.2.0, using its
`/deepfilternet` entry point and DeepFilterNet3 at 48 kHz. See the
[upstream README](https://github.com/workadventure/noise-suppression#readme)
and [Twilio AudioProcessor contract](https://www.twilio.com/docs/voice/sdks/javascript/twilioaudioprocessor).

The shared inbound/outbound Twilio Device registers an `AgentAudioProcessor`
before registration. Its graph is microphone → DeepFilterNet3 → RMS gate →
MediaStreamDestination. The Device's capture override and AudioHelper constraints
request mono audio with `noiseSuppression: false`, `echoCancellation: true`, and
`autoGainControl: false`, including the SDK's default-device capture path.

The package's Vite plugin serves the upstream worklet, Wasm and model unchanged in
development. Vite emits the three assets with hashed URLs for production; they
are served by this app, without a runtime CDN dependency. The custom gate is
also bundled through its URL. The model archive remains gzip data, rather than
being explicitly served with `Content-Encoding: gzip`.

## Settings and calibration

Every agent can open the top-bar settings button and use **Your microphone**.
Noise suppression defaults on. The gate defaults to −50 dBFS, with a configurable
−80 to −10 dBFS range, 5 ms attack, 150 ms release, and 200 ms hold. These are
gain-envelope timings; the gate has no lookahead buffer.

Preferences live in the signed-in user's Clerk `unsafeMetadata.audioPreferences`,
with a user-keyed local cache. Auth-disabled development uses the local agent ID.
Changing these preferences does not confer any authorization. No database
migration is needed. Existing profile metadata is preserved when saving.
Settings apply to the next call and cannot be edited during a call.

**Calibrate** opens a separate, locally processed microphone stream. Follow the
prompts: speak normally for three seconds, then stay silent for three seconds.
There is a one-second transition before silence sampling. Samples are collected
after suppression and before gate gain. The threshold is the midpoint in dB
between the 65th percentile speech RMS and 95th percentile silence RMS, subject
to the settings range. Insufficient separation or nearly silent speech rejects
calibration and preserves the previous setting. Audio stays in the browser;
only the numeric threshold is saved. Canceling, closing settings, or starting a
call releases calibration resources.

## Fallback, cleanup and latency

Initialization failure or an eight-second initialization timeout logs an audio
error and returns the original microphone stream. A runtime processor error or
sustained CPU overload disconnects suppression and the gate and routes raw mic
audio into the same destination, preserving Twilio's live transmitted track.
Turning suppression off returns the original stream without creating a context.

Twilio's `destroyProcessedStream` disconnects nodes, stops destination tracks,
removes listeners, and closes the context to release the model's Wasm heap.
Each stream owns its own context, including overlapping device replacements.
Input tracks belong to Twilio and are not stopped by the processor. Device
teardown also removes/disposes the processor; a retired Device keeps its
processor until its live call ends. Late initialization after teardown disposes
its handle rather than publishing it.

**The requested ~20 ms total added latency is not achievable with this package's
DeepFilterNet3 model.** Upstream reports 30 ms model delay plus about 10.7 ms
reframing, even without its built-in pause gate. This integration disables that
pause gate (`pauseAttenuationDb: 25`, matching `speechAttenuationDb`) and post-gain,
uses an interactive context, and adds no custom audio buffering. Expect roughly
41 ms algorithmic delay plus browser/device scheduling. Model download and
initialization can also delay call setup; they are separate from steady-state
audio latency. A strict 20 ms budget requires a different model/implementation.

## Verification

Run:

```sh
node --test tests/agent-audio.test.js tests/phone-stabilization.test.js tests/housekeeping.test.js
npm test
npm run build
```

The automated tests cover gate timing, calibration separation, profile saving,
capture constraints, registration order, repeated-call cleanup, overlapping
streams, load failures, teardown while loading, runtime errors and CPU fallback.

A real headless Google Chrome 156.0.8078.48 smoke test with a synthetic microphone
passed against both Vite development serving and production-built assets. It
loaded the actual model and worklets, collected 1,125 RMS windows over three
seconds, and created/destroyed four successive processed streams. Every context
closed and every destination track ended while the input remained live. A
runtime failure retained the destination track. Blocking the model request
returned raw audio with zero processor sessions. Reported microphone settings
confirmed 48 kHz and all requested browser-processing flags. These checks do not
measure end-to-end call latency or replace headset listening tests.

Manual acceptance in current Chrome **and Edge**:

1. Sign in as an ordinary agent, open settings, and verify suppression defaults
   on. Calibrate with a headset, save, refresh, and verify the user-specific value.
   Check another user keeps separate preferences.
2. Make outbound and accept inbound calls. Listen at the other end while typing,
   speaking softly, pausing, and finishing words. Adjust the threshold if needed.
3. Toggle suppression off between calls and compare the next call. Confirm the
   mic track's browser-processing flags in `chrome://webrtc-internals` or
   `edge://webrtc-internals`.
4. In DevTools Network, verify the app serves the worklet, `.wasm`, and model
   `.gz` successfully. Block the model URL in a fresh page, then make a call:
   raw microphone audio should work and an `[AgentAudio]` error should appear.
5. Make/hang up at least ten calls, replace the headset, and cancel calibration
   during loading and sampling. Inspect WebAudio contexts and memory after GC;
   closed calls must not retain running contexts or calibration mic tracks.
6. Record a shared reference signal at input and at the remote end to measure
   actual call delay on target hardware. Expect the documented model minimum,
   not a 20 ms result.

Edge and real Twilio/headset listening have not been executed in this environment.

## Files

- `src/lib/audio/AgentAudioProcessor.js`: Twilio processor, capture constraints,
  fallback and lifecycle.
- `src/lib/audio/noiseGate.worklet.js`: gate and three-second RMS sampling.
- `src/lib/audioPreferences.js`: normalization, user persistence, calibration math.
- `src/components/AgentAudioSettings.jsx`: agent controls and calibration prompts.
- `src/context/InboundCallContext.jsx`: Device setup and teardown integration.
- `src/components/TenantSettings.jsx`, `src/App.jsx`: settings access for agents,
  using existing `styles.css` classes.
- `src/lib/debugLog.js`: limited production audio-error diagnostic.
- `package.json`, `package-lock.json`, `vite.config.js`: dependency and assets.
- `tests/agent-audio.test.js`, `tests/phone-stabilization.test.js`: verification.
