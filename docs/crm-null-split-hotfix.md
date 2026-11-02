# CRM null transcript hotfix

## Cause

The production `ContactOpportunities-C3jqm_rA.js` shared chunk contains the transcript
player. Its `qe` function is `CallTranscriptPlayer.transcriptLines`; its `Be` function
calls that formatter inside `useMemo` with `row.transcript_preview`.

The call-log view uses `left(c.transcript_raw,200)` with a LEFT JOIN to call records.
A voicemail or unanswered call without transcript evidence can therefore have a
null preview and no raw transcript. `(detail?.transcript_raw || preview).split(...)`
then calls `split` on null. The parameter default `preview=''` only covers undefined.
This also happens during detail loading, before the player's loading UI is rendered.

The unsafe expression dates to commit `b1bfc12a` (October 24, 2026), before the
STT cost changes in `6ad8a67`. Those changes did not change CRM serializers or
introduce nullable names/agents/dispositions. Waiting for answer can make absent
transcripts more common; absence of a transcript is a valid state, not an error.
The actual offending field is `transcript_preview`, not the contact name or agent.
No production records were queried or modified to establish this reproduction.

## Fix and checks

- Normalize missing/non-string transcript text to empty text; skip null diarized
  entries. The player shows its existing loading/empty states.
- Audit Calls, Opportunities and their detail helpers for nullable strings; harden
  recording status, agent labels/search, dispositions and linked-record labels.
- Keep separate error boundaries around Calls, Contacts, Opportunities, Follow-ups,
  call rows/details/transcripts/notes and opportunity details. A call-row fallback
  uses valid table markup. Existing CSS classes are reused, with Retry and reset
  when the selected record changes.
- A regression fixture has no agent, contact name, phone, disposition or transcript,
  and covers both initial loading and an empty loaded record. It reproduced the
  exact production exception before the fix.

## Publish from Netlify UI after pushing main

1. Open the Netlify project whose production domain is `enrollgen.com`, then Deploys.
2. If builds are stopped and Trigger deploy is unavailable, select Activate builds.
   Keep publishing locked if you want to review the build before release; use
   Lock to stop auto publishing if needed. Activation alone does not trigger a build.
3. Select Trigger deploy > Deploy site. The production branch must be `main`.
   Verify the new deploy identifies the hotfix commit. The repository build config
   is `npm run build`, publish directory `dist`, functions `netlify/functions`.
4. Wait for the deploy to succeed. Open its deploy permalink and check `/crm/calls`
   if your authentication settings allow that preview hostname.
5. On that successful deploy's detail page select Publish deploy and confirm.
   Verify the production deploy now points at the hotfix commit.
6. Hard-refresh `https://enrollgen.com/crm/calls`, expand the voicemail/unanswered
   call and a normal call, and switch among Contacts, Calls and Opportunities.
   Verify there is no null `split` error and the empty transcript message appears.
   If you temporarily activated stopped builds, you can stop builds again afterward.

This frontend hotfix needs no database migration or new environment variables.
The separate STT cost migration 129 remains a prerequisite for the earlier STT
telemetry/recording-worker release; this hotfix does not apply it.

Sources: [Netlify deploy management](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/)
and [stopping/activating builds](https://docs.netlify.com/build/configure-builds/stop-or-activate-builds/).
