# Wrap-up incident — October 20, 2026

## Immediate production mitigation

Migration 106 was applied at **10:38:43 AM Eastern**. Dylan's wrap-up hold was cleared first, followed by every other held agent. Verification found **zero remaining wrap-up holds**, `routing_hold_enabled=false`, and all four migration 105 automation triggers disabled. The availability protection function now clears rather than enforces a wrap-up SID. Active call reservations are preserved; Dylan's then-current reservation was `CA22af0369c1fbf599379b0170833d132f`.

No disposition was fabricated, no transcript/session was bulk closed, and no post-call/scoring job was queued or rerun. Mark's earlier single-call recovery was not repeated.

The kill switch remains off after these changes. Migration 107 was also applied and adds only a service-only explicit save function; it does not enable triggers or change routing policy. Publishing stays locked. The owner will test and publish the frontend manually.

## Why the hold fired mid-call

Dylan's attempt `b2621ab7-1356-4569-b838-deb5697567ca` was marked completed at **10:31:06 AM Eastern**. The retained `dial_result` at 10:31:06.532 contains:

- Parent SID `CAb2885846a59e8744372c761453ef12b8`, `CallStatus=in-progress`.
- Child SID `CAa3789fafe7e3b00858a13672b31fbeca`, `DialCallStatus=completed`, `DialBridged=true`, duration 707 seconds.

The child SID matches the answering agent's persisted attempt. `record_telephony_evidence` turns that Dial result into an ended/completed attempt. Migration 105's trigger treated that attempt completion as enough to create a pending wrap-up and force availability busy. It did not independently require the agent to have no other in-progress call. Its availability protection then prevented ordinary status changes from clearing the hold.

**DB enforcement did not depend on a usable disposition UI:** the owner reported that the production frontend lacked the new UI. Netlify verification shows `585a0e3` was manually published at 6:32 AM Eastern and remains locked. That release contains the older script-section wrap-up control, but server metadata cannot establish which cached bundle Dylan had loaded. Missing deployment alone is therefore not a proven root cause; the confirmed defect is premature DB enforcement without a safe live-call gate.

This proves the premature hold path. It does not establish that a separate `fmo_transfer` leg completed: `fmo_transfer` can be lead-source metadata, and the observed child matches the recorded agent leg. Nor do the retained server events establish what disconnected the browser/SDK or prove a sign-out. A Dial action can report a parent in progress while its child has ended. Those distinctions must not be replaced by an unsupported claim that Twilio or a transfer forcibly disconnected the agent.

## Frontend and explicit save safeguards

- Availability wrap-up metadata no longer navigates to MA, creates a synthetic call identity, remounts a live script, or advances the script to its wrap-up section.
- The script key is pinned to the real SDK call object, including when SID metadata arrives later.
- Clerk token-getter rotation and availability rehydration do not recreate the registered phone device. Genuine identity changes still tear it down.
- Recoverable SDK errors retain call state. Only terminal events for the currently owned call clear it; late events/audio callbacks from a previous call cannot clear a newer call.
- Idle locking also checks the immediate SDK call guard and suppresses its overlay during a call.
- Disposition lives in a small box in the existing dialer panel, using the existing outcome taxonomy and theme. X collapses it to a pending button; it does not save or discard the task. The script's enrollment wrap-up form has no duplicate Call Outcome dropdown.
- Browser guards exclude ringing, dialing and active calls, including calls reserved before React updates. Late lookup responses cannot reopen a box during a new call.
- Server checks require a completed, answered owned attempt, its bound inbound agent child leg (or a completed outbound parent/browser-leg status event), no live reservation, and no other answered open attempt. Unknown leg identity fails closed. Missed calls and already-disposed voicemail are skipped. Discovery starts at the stabilization timestamp to avoid creating a historical backlog.
- The atomic save locks the same availability row used for call claims, rechecks live calls and ownership, and updates the one call record, transcript disposition and session together. A concurrent new claim causes the save to refuse; it never releases that new call. Retries preserve an already-saved outcome. No scoring request is issued.
- Connected calls under 15 seconds can auto-save `short_call_hangup` only after the same terminal/live-call checks; the database checks the duration again.

## Verification

Regression coverage includes back-to-back inbound/outbound calls, delayed SID hydration, late old-call callbacks, recoverable SDK errors, auth/availability refresh, idle lock, X collapse/reopen, late disposition lookup, under-15-second calls, missed/voicemail exemptions, outbound child-only completion, ownership, service-only permissions, transcript/session closure and a new reservation racing the disposition save.

Production build, targeted lint and whitespace checks pass. Final full suite: **410/411 pass**. All lifecycle, phone, disposition and outbound tests pass. The one unrelated existing diagnostic-style failure remains in `tests/housekeeping.test.js:76` (`src/lib/sepCms.js:128`, unchanged single-quoted diagnostic).

Private incident snapshots are under `/private/tmp/enrollgen-dylan-*`; no transcript text, phone number or beneficiary data is included here.
