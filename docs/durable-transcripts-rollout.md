# F11 + F56: durable transcripts rollout

Prepared in an isolated clone of main `51fccc305356662ff809f85f2b36e2b6df49fdbf`, on `fix/durable-transcripts`. No production migration, call, deployment, push, or merge was performed. Site styling is unchanged.

## Behavior

Authenticated inbound media saves scrubbed final segments for each verified attempt, independently of the agent socket/browser. Attempt locking provides one canonical call record shared with browser init; records and transcripts retain enrolled-agent ownership and tenant identity. Browser checkpoints/finalization cannot overwrite server-owned evidence. Disposition and notes remain editable.

Terminal parent status finalizes available evidence and creates a durable scoring dispatch. Railway reconciles persisted terminal parent/attempt evidence every 15 seconds, including late finals and linked outbound checkpoints. Dispatch retries every minute; Netlify acceptance is not completion. The current transcript snapshot must have a completed 072 scoring job before dispatch is marked delivered. Late finals and snapshot changes trigger another revision. Existing subscription, seat, scoring-template, short-call and idempotency gates remain in force.

Outbound browser checkpoints now run every 15 seconds. Hidden/tab-close events send the latest snapshot using authenticated fetch keepalive with a token cached while the page is live. Unload delivery is best effort: browser termination, network loss, and the browser's keepalive payload quota can still prevent a flush. Outbound is still browser capture.

`telephony_missing_transcripts` is a service-only, tenant-bearing exception view for answered attempts that ended more than two minutes ago with missing/empty transcripts, including historical attempts. It does not invent evidence or rewrite historical identity conflicts. `transcript_score_dispatch` exposes undelivered work and transport errors for operations monitoring.

Sanctioned Plan in `cms_plans_PY2027` reads Unknown. No sanctions dataset is implied or imported.

## Rollout order

1. Verify the deployed catalog against the forward delta and take the normal database backup. Confirm 045/048 attempt/link fields, 063 evidence ownership, 072 scoring jobs/snapshot RPC, and the PY2027 landscape exist. Apply only the reviewed **084_durable_transcripts.sql** in staging, then production after operational sign-off. Do not run a blind `supabase db push` or replay 054; the review documents ledger drift and destructive historical migrations.
2. Confirm Netlify's existing `score-call-background` has migration 072 support and `SCORE_CALL_JOB_SECRET`. Configure Railway `TRANSCRIPT_SCORING_URL` to the canonical HTTPS Netlify `/.netlify/functions/score-call-background` URL, and set Railway `SCORE_CALL_JOB_SECRET` to the same secret. This is a server credential, never a VITE variable. Existing Supabase service credentials are reused.
3. Deploy Railway telephony from this commit during a call-free window. A deploy restarts media connections. Start the worker only after 084 exists and the URL/secret are configured. Check transcript persistence/reconciliation logs and dispatch backlog; `/healthz` alone does not establish transcript readiness.
4. Deploy Netlify frontend/functions from the same commit. The canonical inbound-init RPC requires 084. Existing browser wrap-up continues to edit disposition/notes; the new frontend uses faster checkpoints and exit flushes.
5. In staging, exercise a short inbound call and close its browser mid-call, end the call without wrap-up, then verify owned call/transcript links and completed current-snapshot scoring job. Exercise late final/duplicate callbacks, outbound hidden/tab-close flush, editable wrap-up, and the PY2027 Unknown value. Review `telephony_missing_transcripts` and undelivered dispatch rows by tenant, then repeat the operational acceptance check after production deployment.

Database failure before a final is acknowledged is retried in Railway memory. A process crash during that outage can lose unacknowledged segments; acknowledged segments and dispatch survive restart. Deepgram shutdown allows a bounded final flush. Tests use local fixtures and mocked transports; no live Twilio/Deepgram/Railway/Netlify acceptance was performed.

## Rollback

Roll back Railway and Netlify together to the baseline commit. Leave additive 084 evidence/queue tables in place to preserve captured evidence; disable the new worker by rolling back its code. Keep Unknown in the plan view. Do not drop captured evidence as part of rollback. Assign an operator to monitor missing-evidence and dispatch backlog during rollout.

## Local validation

- Final root suite: **291 passed, 0 failed** (`npm test`).
- Final telephony suite: **191 passed, 0 failed** (`cd telephony && npm test`).
- Frontend production build: **passed** (`npm run build`).
- ESLint on all changed JavaScript/JSX files: **passed**, no errors/warnings.
- Final repository-wide lint reports **50 existing errors, 0 warnings** outside the changed files. No general lint cleanup was included.
- `git diff --check`: **passed**.

Acceptance coverage includes server persistence without any browser session, both speakers, a 45-second call, scoring dispatch without wrap-up, stable-ID persistence retry/redaction, duplicate segment idempotency, late-final revision, completion confirmation, missing-transcript reconciliation/access denial, authenticated outbound exit/visibility keepalive, last Deepgram final after media stop, browser evidence preservation with editable wrap-up, and PY2027 sanctions Unknown.
