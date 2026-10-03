# Deployed set-availability v11 (review archive)

Downloaded read-only from the linked Supabase project on 2026-10-03.
`metadata.json` records the management metadata and the downloaded source hash.
`index.ts` is the exact downloaded source, retained outside `supabase/functions`
to prevent accidental redeployment of the vulnerable writer.

The deployed endpoint has JWT verification disabled. It compares `x-api-key`
with `AGENT_API_KEY` and updates whichever `agent_id` appears in the body.
It writes only `status`, `available` and `toggled_at`; PostgreSQL triggers own
presence enforcement, reservation protection and availability logging.

The replacement is `netlify/functions/set-availability.js`. Retire the deployed
edge writer after replacement smoke tests, following `docs/availability-auth-rollout.md`.
This archive contains no credential value and must never be deployed.
