# Short-call display and outbound reservation recovery

The scorer intentionally stores `overall_score = 0`, `overall_grade = N/A`, and
`pass_fail = N/A` for calls below its 120-second minimum. The call-log view
returned only the number, so the browser rendered these as red zero scores.
The call-log endpoint now includes the linked scorecard's grade and pass/fail.
Call rows, contact history, expanded scores, and the review banner honor those
fields. Genuine zero-percent failures retain their warning. No rescore or data
repair is required for call `24e11660-0c5d-4f33-8c5f-da68ef876632`.

Outbound reservations belong to PostgreSQL, not the tab. A browser refresh does
not release one. The existing watchdog runs every minute and checks reservations
older than two minutes against Twilio before releasing the exact terminated call.
The observed recovery after a hard refresh alone does not establish whether the
original incident was an old browser bundle, a delayed callback, or that watchdog.

The outbound dial handler now also recovers a blocked reservation on demand:

1. Attempt the normal atomic claim.
2. If blocked, fetch the agent's reserved call from Twilio with an eight-second
   timeout and no automatic provider retries.
3. Release only if the returned account and SID match and the call is terminal.
   The database release matches both the old SID and agent, so a concurrent newer
   reservation cannot be freed. Provider errors and 404s retain the reservation.
4. Retry the claim once. If it is still blocked, reject the dial as before.

The outbound identity endpoint formerly returned 404 while the attempt was
missing. A rejected dial also has no attempt, although Twilio accepts its browser
leg to play the rejection message. New clients advertise support for a 202
pending response, stop polling after disconnect, and wait for a verified attempt
before auto-starting transcript persistence. This prevents the rejected browser
leg from creating a transcript-save error for a nonexistent call attempt. Actual
connected-call controls remain available while identity is pending. Old clients
continue receiving their original response during a Railway-first rollout.

No automatic page reload is introduced; it could interrupt a live call. These
changes do not prove the exact historical cause of the post-publish incident.

Validation: 515 app tests passed; all 218 telephony tests passed across the full
run and a rerun of socket-based tests with localhost permission (the sandbox
initially denied local HTTP/WebSocket listeners). Lint, telephony import checks,
and the production build passed. Tests include neutral N/A versus genuine zero,
tenant-scoped score metadata, immediate recovery, live-call preservation, a
newer-reservation race, bounded identity polling, rolling-version compatibility,
and rejected-leg transcript startup.

No migration is needed. When rolling out, push once to let Railway deploy, then
publish the completed Netlify build. Older open tabs need a normal reload when
idle to acquire the new client behavior. Leave legacy API keys unchanged.
