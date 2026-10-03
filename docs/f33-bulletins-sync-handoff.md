# F33 bulletin sync handoff

Work performed only in `/private/tmp/enrollgen-bulletins-sync` on `fix/bulletins-sync`. No production sync, database writes, merge, push, or deployment was performed.

## Root cause and repair

Production's `bulletins.source_id` has no matching unique constraint, so Postgres rejects `ON CONFLICT (source_id)` (74 reported failures). The standalone bootstrap SQL declared uniqueness but the deployed schema did not have it. Migration 079 locks writers, ranks duplicates by latest update/create time and ID, archives the full removed rows in an RLS-protected service-role-only table, deletes only archived duplicates, and adds the unique constraint. Null source IDs remain untouched.

Six stale feed endpoints caused three 404s and three fetch errors. All six have verified official replacements. Feed fetches run independently in parallel so several 15-second timeouts do not accumulate. CMS and BCBS require explicit HTML listing adapters; their layout changes produce visible errors instead of silent success. Existing Google News feeds remain unchanged. Undated/invalid/future stories are skipped rather than assigned today's date.

Per-feed status persists last attempt, error, upsert/skip counts, and last success (retained on failure). The UI shows latest successful feed sync, expandable feed statuses and their individual success/check times, and a stale marker after 36 hours. Empty/unreachable bulletin data falls back to explicitly dated historical samples from 2025, with a section warning. Existing stylesheet classes are reused; no CSS changed.

## Official source verification

Read-only HTTP and parser checks on 2026-10-03; all six replacements returned HTTP 200. These checks do not demonstrate deployed Netlify access or successful production ingestion. Humana RSS returned 200 initially, timed out on a later probe, then returned 200 again with the sync user agent; it remains subject to transient failures, which are surfaced per feed.

| Source | Official reference/replacement | Parsed dated items |
| --- | --- | --- |
| CMS Newsroom | https://www.cms.gov/about-cms/contact/newsroom | 6 / 6 |
| MLN | https://www.cms.gov/training-education/medicare-learning-network/newsletter links RSS https://www.cms.gov/rss/31241 | 550 / 550 |
| Humana | https://humana.gcs-web.com/rss-feeds links https://humana.gcs-web.com/rss/news-releases.xml | 10 / 10 |
| BCBS | https://www.bcbs.com/about-us/association-news | 6 / 6 |
| Cigna | https://newsroom.thecignagroup.com/latest-press-releases?pagetemplate=rss | 5 / 5 |
| Centene / Wellcare | https://investors.centene.com/press-releases?pagetemplate=rss | 5 / 5 |

RSS content/availability and HTML layouts may change; monitor the per-feed status after rollout. Zero matching recent Medicare stories can be a healthy feed result; success means fetch/parse/write completed, not that every feed necessarily yielded a new bulletin.

## Validation

- `node --test tests/bulletins-sync.test.js`: 6 passed, 0 failed. PostgreSQL/PGlite executes the full 079 migration and real conflict-key upserts; fixtures cover feed isolation, last-success preservation, malformed/404 responses, publication dates, write failures, official listing adapters, and dated fallback labels.
- `npm run build`: passed.
- Targeted ESLint for all five modified JS/JSX implementation files: passed.
- `git diff --check`: passed.
- Six read-only source/parser checks: passed; no ingestion to any remote database.

## Rollout order

1. Back up/review duplicate source IDs in staging, apply 079 to staging, and review the duplicate archive and constraint. The migration takes a write-blocking lock; choose a quiet window for production. It is a one-time migration, not an independently repeatable maintenance script.
2. Deploy the function and UI to staging after the schema. Run ingestion twice; confirm one row per non-null source key, populated status rows, and no ON CONFLICT errors. Verify an unavailable feed does not prevent healthy feeds from syncing, and that historical samples and dates are visible when no bulletin rows are returned.
3. Apply the same 079 migration to production before deploying the function/UI through the normal release process.
4. Observe the next daily run (`0 10 * * *`, UTC), verify bulletin counts, per-feed errors and last-success times. Roll back application code if needed; retain the compatible unique constraint and archive. Production rollout remains unperformed.

Full migration SQL: `supabase/migrations/079_bulletins_sync.sql`.
