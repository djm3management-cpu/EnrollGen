# F34 FEMA county and freshness handoff

Branch: `fix/fema-county`. All work performed in the isolated clone
`/private/tmp/EnrollGen-fema-county`. No merge, push, live database migration,
production import, or scheduled-function invocation was performed.

## Root cause

The exact left-rail NJ banner came from `STATE_SEP_DATA.NJ.femaEnd: "10/31"`
in `src/data/stateSepData.js`, consumed by `getStateSepInfo()` and
`SEPQualifier`'s `getFemaEndStatus()`. That helper used the current year and
returned an availability label without checking ZIP, county, declaration,
feed success, or freshness. The state fallback map and `SEPGuide2026.jsx`
had duplicate static NJ dates. This banner was a static reference assertion,
not evidence from the April database or a live FEMA declaration.

Separate defects compounded the problem: the browser fetched only 1,000
OpenFEMA designated-area rows, matched disasters by state, and substituted
`sepFemaDb` seeds on failure or an empty response. The SQL lookup matched
counties but accepted the April-stale `fema_disasters` copy without a
freshness gate.

## Changes

- `src/lib/sepFema.js`: complete 1,000-row pagination with stable ID ordering;
  include older ongoing/recently ended declarations; validate responses;
  discard partial results on failure; accept a successful empty feed;
  use county FIPS and per-designated-area program flags; UTC calendar-month
  window calculation with inclusive final day; shared in-flight requests;
  verified timestamps and 24-hour freshness checks; browser RPC overlay.
- `src/lib/sepEngine.js`: county FIPS required for FEMA results; state-only
  browsing cannot establish a county SEP; seed/stale evidence excluded.
- `src/hooks/useSEPLookup.js`: ZIP crosswalk matching, live FEMA evidence in
  RPC results, feed freshness state, and removal/recalculation after refresh.
- `src/hooks/useFemaCounty.js` and `src/components/leftRail/SEPQualifier.jsx`:
  live ZIP/county status, periodic refresh, unavailable failure state, and
  guards against displaying a previous ZIP's status.
- `src/components/SEPFinder.jsx`: live feed replaces old DB FEMA evidence.
- `src/components/SEPLookup.jsx` and `src/components/sep/FemaFeed.jsx`:
  freshness timestamp and explicit "FEMA data unavailable" display.
- `src/data/stateSepData.js` and `src/components/SEPGuide2026.jsx`: remove
  static FEMA end dates; retain reference guidance for county verification.
- `netlify/functions/sync-fema.js` and `netlify.toml`: daily 09:00 UTC
  authoritative snapshot refresh using the existing scheduled-function pattern.
- `supabase/migrations/078_fema_county.sql`: SQL changes described below.
- `tests/sep-fema.test.js`: seven focused browser/feed/refresh/Postgres tests.
- `docs/fema-county-handoff.md`: this handoff.

Existing CSS and styling conventions preserved. No tracked telephony,
routing, billing, or recording files changed.

## SQL 078

Adds an RLS-protected `fema_feed_snapshot` singleton writable only by the
service role. A single upsert publishes a complete snapshot atomically,
including removal of withdrawn designations. A failed feed publishes an
unavailable status and no active records. Missing/unavailable snapshots,
or snapshots older than 24 hours, cannot establish a SEP.

Renames the existing deployed `get_available_seps(text)` to a private,
non-publicly-callable base function and wraps it to replace only the FEMA
result. All other current SEP rules remain intact. The FEMA result uses the
ZIP crosswalk's county FIPS and state to match designated areas, adds source
status and timestamps, and labels missing/stale data unavailable. Reapplying
078 does not wrap recursively. The historical April table remains intact
but is no longer authoritative in returned FEMA results.

County-specific IA/IH evidence is required, preserving the existing app's
program qualification policy. PA-only rows remain feed information and do
not create an active SEP. Missing/000/tribal FIPS cannot be inferred as a
county designation; verify unsupported areas directly with FEMA.

## Validation

- Full root suite: 266 passed, zero failed (`npm test`). The first run lacked
  the existing telephony test dependency `twilio`; installing isolated-clone
  dependencies resolved it without any tracked telephony change.
- FEMA + existing dual/LIS regression suite: 18 passed, zero failed.
- Final FEMA suite: 7 passed, zero failed after the in-flight request change.
- Production Vite build passed.
- ESLint passed for every changed JS/JSX file and the new test/function.
- `git diff --check` passed.

Required cases: NJ with no NJ declaration yields no FEMA SEP; the designated
county yields the SEP; another county in the same state does not; feed
failure yields "FEMA data unavailable". Additional checks cover amendments
on later pages, partial-feed failure, empty success, stale/seed suppression,
per-county program isolation, date boundaries, atomic refresh, SQL reruns,
base-function access revocation, and preservation of unrelated SEP results.

Validation used deterministic fixtures and local PGlite, not production
credentials. Live OpenFEMA availability and scheduled execution must be
checked during rollout; no production feed/import was invoked here.

## Rollout order

1. Apply migration 078 after the existing SEP migrations, including 068.
   Until the first successful snapshot, SQL deliberately reports FEMA data
   unavailable. Do not replay an older lookup-function migration afterward.
2. Deploy the frontend and `sync-fema` function/schedule together. The function
   uses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment
   variables; browser code uses its existing crosswalk read permissions.
3. Run the deployed scheduled refresh through the normal operations workflow,
   or wait for 09:00 UTC. Verify snapshot status, fetched timestamp, and a
   complete successful refresh. Do not import the old seed/April copy as live.
4. Verify NJ/no declaration, a current designated county, another county in
   that state, and simulated feed failure in the Intelligence and left-rail
   views and SQL lookup. Confirm unavailable behavior on a >24-hour snapshot.
