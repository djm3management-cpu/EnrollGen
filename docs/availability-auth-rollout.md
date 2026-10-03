# Availability authorization: F43 and availability-only F04

The browser now uses `/.netlify/functions/set-availability` for GET (own status)
and POST (`status`, optional `agent_id`). Every request requires a verified
Clerk session token. Omitted IDs resolve from the subject; a supplied foreign ID
is denied for agents. Development auth bypass flags do not bypass this endpoint.

Authorization uses the service-managed `availability_agent_subjects` mapping,
not names, client metadata, mutable CRM roles or caller-supplied tenant IDs.
An enrolled membership must remain active. Organization admins can target agents
in their verified organization; signed `public_metadata.isAdmin === true` grants
the existing global-admin convention. Clerk session token v1 and v2 organization
claims are supported. Admins send an explicit `agent_id` for an override.

The new mapping pins the subject, slug, tenant, organization and active state.
Service operators must maintain it for onboarding, relinking, org changes and
deactivation; browser roster edits cannot grant or reactivate availability access.
Deactivate enrolled membership or this mapping to revoke access. Ambiguous
subjects without an organization claim fail closed.

POST preserves the deployed v11 update fields (`status`, `available`, `toggled_at`)
and lets the existing triggers produce the actual stored status. Presence leases,
heartbeat handlers, claim/release functions, resume intent, routing selection,
hours/caps, recording code and the Paragon feed are unchanged. The UI's read now
returns the same agent's stored manual status through Clerk rather than using a
shared feed credential. No browser key is needed for reads or writes.

## Rollout order

1. Confirm migration 063 is installed: enrolled membership must be service-managed.
   Read the live roster and organization bindings before snapshotting, since the
   legacy CRM roster was browser-writable. Confirm each intended subject/slug pair
   independently against Clerk. Check duplicate global slugs and duplicate subjects
   within tenants; 073 skips ambiguous pairs and the endpoint denies unmapped agents.
   No live writes or migrations were performed during this batch.
2. Apply only `supabase/migrations/073_availability_auth.sql`, once, in a transaction.
   This snapshots reviewed membership and removes table AND column grants and all
   combined legacy policies on availability, its log and the new mapping. It grants
   service-role access only. Existing edge/telephony/feed service clients keep working.
   Verify expected mapping coverage and active state before deploying clients.
3. Configure Netlify `CLERK_SECRET_KEY` or `CLERK_JWT_KEY`, the existing Supabase URL
   and service-role key, plus the deployment's Clerk audience/authorized parties.
   Global admin metadata must be included in the signed session token; otherwise use
   a Clerk organization admin role. Remove `VITE_AGENT_API_KEY` from Netlify's build
   environment. The build guard now rejects a nonempty value. Ignored local env files
   retain the old key only as server-side `AGENT_API_KEY`, never as a Vite variable.
4. Deploy Netlify endpoint and frontend together. Verify own GET/POST, foreign-agent
   denial, admin override and inactive-agent denial with real sessions. Verify
   available waits for the phone acknowledgment, heartbeat renewal still works,
   an active reservation remains busy, and hangup restores the selected resume status.
   Check the existing Paragon availability feed with its existing consumer key.
5. After successful smoke tests, disable/delete the old Supabase `set-availability`
   edge function. Table grant repair alone cannot stop it: it uses the service key.
   Remove or rotate its exposed `AGENT_API_KEY`, and revoke any `enrollgen` read-feed
   consumer registered with the same exposed key after confirming it has no remaining
   consumers. Keep Paragon and other independently keyed feed consumers unchanged.
   Neither disablement nor rotation was performed here.

Do not redeploy the archived edge source. A client rollback must keep the
Clerk-authenticated availability caller, since restoring the shared-key writer
would reopen the issue. Preserve service-only availability grants on rollback.

## Validation

- `node --test tests/availability-auth.test.js`: real PostgreSQL grants, policies,
  existing presence/reservation/logging triggers and real RSA-signed Clerk JWT
  verification, plus browser request authentication. Includes own write, foreign
  denial, org/global admin overrides, inactive/bypass denial and roster spoofing.
- Existing availability, feed, manual intent, heartbeat, sticky-routing, evidence
  and LLM build-guard regression tests were run; see the final task report for counts.
- `npm run build`, then `node scripts/verify-availability-bundle.mjs`: scans all
  built files for the actual legacy credential from ignored env files, the public
  variable name and legacy edge writer URL, without printing credential values.
- Targeted ESLint and `git diff --check`.

Production session smoke tests remain a deployment step. No live availability
statuses, routing state, feed keys or deployed functions were changed by testing.
