# Incoming-call rejection audit — October 21, 2026

Reported incident: four Paragon calls rejected at 10:44, 10:49, 10:58,
and 11:26 AM ET, lasting 2–4 seconds. This source audit does not establish
which branch ran for those individual calls; that requires incident telemetry.

## Browser Voice SDK `call.reject()` paths

1. `InboundCallContext.jsx`, Device `incoming` handler: another call is
   already ringing, dialing, connected, or an outbound connection is being
   requested. Previously this trusted `callInProgressRef` alone. A closed
   SDK leg whose terminal event was missed could leave that flag set and
   reject the next call. The handler now reconciles the owned SDK leg's
   `closed` status before deciding. A repeated incoming event for the same
   owned object is ignored. Pending disposition, manual availability status,
   and wrap-up metadata are never rejection conditions.
2. `InboundCallContext.jsx`, `declineCall`: the agent invokes Decline on the
   incoming toast, and the displayed call is still the owned call. This is
   the sole caller of `declineCall` in application source.

The inbound terminal listeners now also handle SDK `reject` events so a
rejected leg cannot leave local ownership stuck. Device destruction can
implicitly end calls; the existing live-call retirement protection remains.

## Server TwiML rejection (separate from browser SDK rejection)

`twilioVoice.js` has one `response.reject({ reason: "busy" })` helper,
`busyRejectTwiml`, with three invocation sites:

- Initial matched Paragon route: the matched ping is unavailable, or no
  eligible agent can be claimed (`decideMatchedParagon`).
- Matched Paragon dial result: the dial failed, excluding completed,
  answered, or canceled results; an already-ended parent is also handled
  before this branch.
- Dial-result exception: the handler has already identified the call as
  matched Paragon and an exception occurs. Other calls get voicemail.

Server routing behavior is unchanged by this fix.

## Pending disposition behavior

An unfinished disposition keeps its task and selected outcome while another
call rings or connects. The full form collapses to a navigation pill using
the existing phone theme variables. It can be reopened after the call. No
automatic save or manual save can start during a ringing/dialing/live call.
A server response reporting a call in progress also preserves the prior task.
Once the next call ends, the original displayed task remains until saved;
the next poll can then offer the newer call's disposition.

## Regression coverage

`tests/phone-stabilization.test.js` exercises closed inbound and outbound
legs without terminal callbacks or device rebuilds, wrap-up delivery,
duplicate incoming events, concurrent-call and explicit declines, SDK reject
cleanup, retained disposition selections, blocked saves during calls, and
the collapsed pill through ringing, live, and idle transitions.

Validation: all 467 application tests pass, including 14 phone stabilization
tests; production build and ESLint on the changed JavaScript components pass.
The full suite also exposed a pre-existing single-quoted static log label in
`sepCms.js`; its quotes were normalized to satisfy the diagnostics check.
