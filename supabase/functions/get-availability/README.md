# Availability feed

## Audit of the deployed function (September 24, 2026)

The previous source was read from the Supabase dashboard; it was not previously
tracked in this repository. It accepts either `VENDOR_API_KEY` or `AGENT_API_KEY`.
It selects `agent_id, agent_name, available, status, toggled_at` from
`agent_availability`, ordered by name, or filters a single row by `agent_id`.
Its counts use only `available`: no lease, reservation or manual-status check.
It returns timestamps, exposes raw query errors, creates a client for each
request, and has no per-consumer revocation or latency logging.

## New contract

GET with `x-api-key`. All responses have `Cache-Control: no-store`.

```json
{
  "any_available": true,
  "available_count": 1,
  "unavailable_count": 1,
  "total_count": 2,
  "available_states": ["NJ", "PA"],
  "agents": [
    {"agent_id":"alice","agent_name":"Alice","available":true,"status":"available","licensed_states":["NJ","PA"]},
    {"agent_id":"bob","agent_name":"Bob","available":false,"status":"offline","licensed_states":["CA"]}
  ]
}
```

`?agent_id=alice` retains the existing single-agent object shape (without timestamps),
with added `licensed_states`; an unknown agent returns 404. `available` is the
routability boolean. `status` is `available`, `busy`, or `offline` for existing UI
compatibility. No phone, email, SID, call record, presence lease, or timestamps
are returned. Only routable agents contribute to `available_states`.

Licenses come from `enrolled_agents.licensed_states`, joined through
`tenant_agents.agent_slug` and matching Clerk ID **and tenant ID**. Values are
trimmed, uppercased and deduplicated. Missing identity/license data returns `[]`,
never the tenant's agency-wide states. Availability remains the existing global
slug-based routing pool; this migration does not introduce tenant-specific routing.

## Shared eligibility and routing compatibility

Migration **047_availability_feed.sql** provides `agent_inbound_routable`:
manual status available, boolean available, no reserved SID, and
`agent_phone_routable` (unexpired phone session unless enforcement is paused).
The feed, legacy round-robin claim and sticky claim all call this predicate.
The outbound branch still bypasses manual status and uses the phone predicate.
Locks, ordering, exclusions, reservation writes/release and replay behavior are
unchanged; sticky retains its additional active-roster requirement.

`telephony_presence_policy` is initialized from the currently installed claim
function. Both recovery scripts now update this policy after migration 047,
while preserving their original behavior on older databases. Their trigger and
expiry behavior is unchanged. Use these scripts, not older saved copies, to
pause/re-enable presence. Feed results are a current snapshot, not a reservation;
another call can reserve an agent immediately afterward.

## Keys and rollout (manual; nothing applied by this change)

1. Apply migrations through 046, then 047. It preserves the installed presence
   mode and seeds the **nghs-status** consumer with the hash matching the new
   public key in `status-page/index.html`.
2. Register every other consumer **before** switching the edge function. Generate
   a unique high-entropy key and INSERT statement offline:
   `node scripts/availability/consumer-key.mjs vendor-name /private/tmp/vendor-key.txt`.
   The raw key is written to a new mode-0600 file; stdout contains only its hash
   and SQL. Apply that SQL manually and give that vendor its raw key.
3. To keep the existing EnrollGen app working without changing its build, register
   its current `VITE_AGENT_API_KEY` as consumer `enrollgen` using the script's
   `--import` option and a private file containing that key. This adds a hashed
   read credential; `set-availability` and its existing authentication are
   unchanged. Do not distribute this application's write credential to vendors.
4. Deploy `get-availability` with JWT verification disabled as specified in
   `supabase/config.toml`. It uses Supabase's service-role and URL environment
   variables; the old `VENDOR_API_KEY`/`AGENT_API_KEY` values are no longer accepted
   automatically by this endpoint. Other functions may still need those secrets.
5. Give vendors their individual keys and manually drag `status-page/` into
   Netlify Drop. The old page's shared key stops working when the new function
   goes live unless separately registered; coordinate these two manual steps.
6. Verify each consumer's request, per-agent lookup, licenses, lease expiry,
   on-call exclusion and latency logs. Revoke with
   `UPDATE public.availability_consumers SET active=false WHERE name='vendor-name';`.
   Revocation takes effect on the next request; nothing caches authorization.

The status-page key is intentionally visible in browser source, limited to this
read-only feed, and independently revocable. The page preserves the original CSS,
escapes display values, and clears stale availability if polling fails.
Consumer tables/policy have RLS and no browser grants; RPCs are service-role only.
SHA-256 hashes are suitable here because generated keys have 256 bits of entropy.
No plaintext credentials are stored in the database.

## Performance and verification

A warm request makes **one** RPC for indexed key lookup, eligibility and licensing;
the Supabase client is reused. Existing indexes cover session `(agent_id,
expires_at)`, roster slug and Clerk ID. No network calls to licensing services or
request-time schema inspection. Authentication and data are never cached.
Every request logs JSON with consumer name, HTTP status, and `latency_ms`; unknown
keys use `unknown` and OPTIONS uses `preflight`. Keys/hashes and agent/call data are
not logged. The database request has a 2-second failure timeout, separate from the
**under-300ms target**; failures return a generic 503 and never stale availability.

The 300ms target needs measurement after deployment, including cold starts and
vendor network latency; local tests cannot establish production latency. Deploy
near the database ([Supabase regional invocation guidance](https://supabase.com/docs/guides/functions/regional-invocation))
and use the latency logs to check p50/p95/p99. Client-observed timing includes
network and cold-start overhead beyond the handler's log.

`npm test --prefix telephony` includes SQL tests using PGlite plus Web Request /
Response handler tests. They cover active calls, manual offline, missing/expired
and multiple sessions, both presence modes and migration from paused mode,
shared claim eligibility, sticky/retry/release/outbound compatibility, licensing
union/tenant match, immediate revocation, output filtering, error sanitization,
logging, privileges, and the status-page key/hash pairing. Real multi-connection
lock contention and deployed edge latency require staging verification.

## Vendor extensions (migration 048)

The unchanged default contract now also supports HEAD, state/min filters,
simple/text output and query-key authentication. Push/postback/report setup is
documented in [operator instructions](../../../docs/vendor-integration-operations.md)
and the [vendor guide](../../../docs/vendor-integration.md). Request logs now
include `auth_method` (`header`, `query`, or `none`).
