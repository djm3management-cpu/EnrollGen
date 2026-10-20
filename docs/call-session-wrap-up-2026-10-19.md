# Call sessions, mandatory disposition, and Mark's recovery

The Medicare script previously retained its session and call-record pointers when a second accepted Twilio call arrived. Mark's second call therefore failed the database's `Transcript session mismatch` guard. Netlify's background worker recorded actual handler HTTP 503s at October 19, 2026, 18:43:08 and 18:43:11 UTC; these were not service-worker responses.

## Resulting behavior

- Each new inbound/outbound attempt creates a SID-bound session. A verified call reconnect or repeated start adopts that same session. Different SIDs cannot share it. The cockpit resets its script state, notes and transcript for each accepted call and retains the completed cockpit through hang-up for disposition.
- The post-call queue repairs a stale tab's old-session/new-SID submission by selecting the new call's verified session and canonical record. Ownership checks remain enforced; the previous transcript is never rebound.
- Connected calls land on the existing `SectionWrapUp` after hang-up. Call Outcome is required. Non-enrollment dispositions do not require invented beneficiary details; enrollment validation and existing ancillary product selection remain in place.
- Agent availability displays **WRAP-UP** and remains unavailable for routing until a disposition is saved. The database hold survives refresh, other tabs, availability changes, explicit outbound dialing, and duplicate/late release callbacks. Saving the outcome closes its session and restores the agent's prior availability preference, subject to phone presence.
- Missed/unanswered/voicemail calls are exempt. Connected calls under 15 seconds automatically save **Short call/hang-up** and close their session. Exactly 15 seconds requires disposition. Late transcript segments retain the automatic outcome.

Forward migrations `104_call_session_identity` and `105_mandatory_call_wrap_up` were applied to the linked production project and registered in migration history. They do not sweep or rescore historical calls. Existing styles are used without CSS changes.

## One-call recovery

Only Mark's second call was recovered:

| Item | Identifier |
| --- | --- |
| Second call SID | `CAc5c31087f2ab0bffae56b289c5767d98` |
| Attempt | `ae2e8bab-051c-4278-a6d3-3c4cdde75b9d` |
| New session | `30b965a2-e6cd-43f2-ab6e-c0c44a1f7595` |
| Call record | `7f324073-49de-4a21-ab9b-f594db32ea61` |
| Transcript | `1d119267-6002-481b-8166-e2454d28dc0b` |
| Scorecard | `f87eaa8d-c00f-4875-b8b3-d2aabbfaff25` |

The retained source was the failed browser post-call request: **95 characters**, with no retained server transcript segments. Provenance is recorded in call metadata; it is not labeled as a recovered Deepgram transcript. Signed telephony evidence records an answer at 18:43:05 UTC and an end at 18:43:05.629 UTC, with zero whole talk seconds. The recovered record is automatically disposed as `short_call_hangup`; its session is closed at the actual call end.

One `recover` request was dispatched at **October 20, 10:10:54 UTC** and completed with transcript, embeddings and scorecard output. Netlify request ID: `01M5CCNRYC0J2X5813ARQJM1FB`. No other session was queued or rescored by this recovery.

The original session `0409b058-a62b-4460-9ac7-3b34584246da` remains bound to its first call. Full before/after hashes of that call record and transcript matched. The two failed requests carrying the second call SID were reconciled to the new recovery result; their original errors and retry history remain in the audit trail. No original transcript or scorecard was replaced.

Operator script: `scripts/post-call/recover-mark-second-call.mjs`. Its default mode is read-only; a completed recovery is detected and never dispatched again.

## Verification

- 74 focused tests pass, covering back-to-back inbound/outbound sessions, stale-tab queue submissions, delayed session/end responses, wrap-up routing holds, manual status changes, late releases, the 15-second boundary, late transcript binding, ownership and service-only permissions, disposition closure, and existing ancillary behavior.
- Targeted ESLint, production build and whitespace checks pass.
- Broader suite: 399/400 pass. The remaining pre-existing failure is `tests/housekeeping.test.js:76`: untouched `src/lib/sepCms.js:128` uses a single-quoted static diagnostic while that test requires double quotes. The same line exists in the parent commit.

Private recovery evidence and exact-window Netlify logs are retained under `/private/tmp/enrollgen-mark-second-*`; no transcript text or beneficiary data was added to this document or repository.
