# Outbound call log: migration 066

Deploy the committed Netlify code before running 066. No Railway change is needed.
All three consumers (CALLS, dialer recents, dashboard activity) read the Clerk-authenticated `call-log` endpoint. It resolves an active enrolled agent's tenant or a signed organization administrator's tenant; request parameters cannot choose a tenant. Tenant call-list visibility is preserved, while recording playback and downloads require protected ownership or organization-admin access.

Before 066, the endpoint reads the existing view and replaces displayed browser-timer durations with measured terminal-attempt talk time (or unknown). Outbound orphan rows appear only after 066 expands the view. After 066, direct browser grants on the view are removed; the endpoint's service-key reads continue to work. There are no fallback anonymous reads.

066 links existing outbound records only when CallSid, tenant, contact, outbound direction, and protected session ownership match unambiguously. No synthetic records are created. Attempts with no match remain unlinked but appear in CALLS. Existing 064 triggers propagate recording metadata on successful late links. Outbound row IDs are attempt-based and remain stable after linking. No data is deleted.

CALLS, recents, and dashboard use the same activity view. Display duration is terminal-attempt `talk_seconds`; it is zero for a completed unanswered attempt and unknown for active calls or historical calls without measured evidence. Stored browser timers, inbound duration columns, billing flags, vendor reports, routing, admission, and Paragon functions are untouched. Dashboard duplicate record/activity counting and agent-slug display mapping are corrected.

Recordings can be played and downloaded using an authorized outbound `attempt_id` even without a call record. This also works before 066. Storage and retained Twilio copies use the existing service-only pipeline with or without 065. The CALLS row has Play and Download WAV; its expanded recording panel lists all parts and offers Download Twilio Copy. Existing site styles are reused.

## Operator sequence

1. Approve merge/push, deploy Netlify, and verify CALLS, dialer recents, and dashboard still load before 066.
2. Run `supabase/migrations/066_outbound_call_log.sql` in the SQL Editor.
3. Refresh CALLS: the 2026-10-03 outbound test `CA1d5ed21df86217710c9f86c4ecc2b8c2` should show OUT, mike_shiomos, Mike / +16093201600, 0:31, and Play / Download WAV.
4. Play and download its recording, expand the row and try Download Twilio Copy. Verify the connected inbound test shows 0:31 rather than `--` or the script timer.
5. Check the outbound direction filter, date/search/agent filters, dialer recents and dashboard. Make a new outbound call and verify it appears once, even without starting a script session.

Read-only SQL checks:

```sql
SELECT log_id, attempt_id, call_record_id, direction, agent,
       contact_phone, duration_seconds, recording_storage_path
FROM public.v_call_log
WHERE attempt_id = '3786c868-5be2-481d-97b7-00f6fda3558a';

SELECT role_name,
       has_table_privilege(role_name, 'public.v_call_log', 'SELECT') AS can_read
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) roles(role_name);
-- Expected: false, false, true.
```

Automated validation covers pre-/post-066 endpoint behavior, PostgreSQL view/backfill execution, orphan and linked calls, stable late-link identity, measured duration, preserved stored durations/record counts, pagination/filtering, cross-tenant denial, protected recording ownership, Storage/Twilio download grants, and behavior after 065. No live call, provider audio fetch, deployment, or production migration is performed by these tests.

## Validation results

- Full application suite: 179 passed, 0 failed (11 new call-log tests).
- Full telephony suite: 153 passed, 0 failed; local HTTP transport tests require local-port permission.
- Production Vite build, LLM typecheck, and both Netlify function bundles: passed.
- Changed-file lint and `git diff --check`: passed.
- Full lint: 45 existing errors, 0 warnings; none in changed files.
- Migration 066 and link-only backfill executed in disposable PostgreSQL (PGlite), including rerun safety, ambiguous candidates, existing links, view grants, and late-link recording triggers.
- No live migration, deployment, real call, or Twilio audio download was performed.
