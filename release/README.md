# October slim release

Branch release/oct-slim, based exactly on requested main b47e80dd6004c9defe12dd491aba431e95a1c8ad. The Desktop checkout was read only; it had independently advanced to 072c701 when this task began. No newer main changes are included. No push, main merge, live SQL or deployment occurred.

Included: initial standalone follow-ups commit 8a12be8, housekeeping 02f5af2, county penetration 2af143d, and slim-specific compatibility/rollback changes. No merge conflicts. No auth-hardening or tenant-isolation commit is an ancestor of this branch; no 083/085 migration or implementation is in its tree. Auth branch fix/auth-hardening remains intact at 674d2bb in /tmp/enrollgen-oct-release.TjiAYZ/auth for after AEP.

Supabase client and token behavior match b47e80d exactly except the original console warning now uses a static, development-gated diagnostic. AuthContext, useTenantConfig, Netlify/telephony Clerk verifiers, voice-token/socket identity and phone presence are byte-for-byte unchanged. Nothing requires new Clerk configuration, authorized parties or audience. Existing styles.css content is retained; the county feature appends existing-token styles. Routing, billing, recordings and Paragon decisions remain unchanged.

## Standalone SQL and compatibility

release/release-slim.sql contains 086 followed by 088. Neither invokes or replaces the global is_current_tenant helper, depends on 083/085 or changes any unrelated table authorization. 086 uses the existing Clerk JWT subject/role and existing roster for this feature's own-agent/admin permissions only. It permits scheduling one's follow-ups for shared agency contacts. Existing direct inserts and updates remain supported; a new BEFORE INSERT trigger assigns omitted owners to the current active roster identity. No JWT template/config change is needed.

086 snapshots the permissive policies it replaces and automatic legacy owner backfills in a service-only rollback schema. Repeated application preserves the original snapshot. 088 uses a separate service-only creation marker; it refuses adoption of an unrelated pre-existing penetration table so rollback cannot drop an unverified table. Reapplication of this release is supported. Existing customer/telephony schema is otherwise unchanged.

PostgreSQL acceptance runs both migrations without any 083/085 helper. It executes actual b47e80d frontend create/complete callbacks after 086, including omitted owner and shared-contact cases. The full 3,186-row public CMS load and rollback/reapply also execute in isolated PostgreSQL. Telephony identity code is unchanged and its complete suite passes. These establish SQL-before-deploy compatibility for the tested baseline; live production schema/account linkage and actual vendor calls were not exercised or changed.

## Artifacts and data

- release/release-slim.sql: primary 086, then CMS 088 (primary if CMS shares the database).
- release/penetration-load.sql: execute after 088 on that CMS database. September 2026, 3,186 rows, 22 suppressed enrolled values retained as NULL, 2 pending rows excluded. SHA256 a908325edc73d45e23acda4bfcc73fc702b9158d48bf227ec9c4dc507df12930; exact copy of /tmp/penetration-load.sql.
- release/rollback-slim.sql: reverse sections, CMS 088 then primary 086.

The only allowed environment change is server BIBLIA_API_KEY and removal of VITE_BIBLIA_API_KEY. No other runtime environment changes are required or made. Production diagnostics remain disabled; do not add debug settings for rollout.

## Validation

Full root: 326/326 passed. Full telephony: 192/192 passed. Build passed. Full ESLint: zero errors/warnings. Import-boundary check passed with dependencies inside the clone. Sixteen focused PostgreSQL/helper/parser tests passed, covering permissions, actual old callbacks, SQL load, repeatability and rollback. git diff whitespace check passed.

Commands: node --test --test-concurrency=4 tests/*.test.js in root and telephony; npm run build; npm run lint; npm run check:imports in telephony. Logs under /tmp/enrollgen-oct-slim.ezf7AR.

## Apply and rollback

1. Confirm the actual database matches the existing b47e80d baseline and retain its normal backup. Apply 086 to primary, then 088 to CMS (primary if shared), then the penetration load. If databases differ, execute the labelled SQL sections on their respective databases.
2. Add server-only BIBLIA_API_KEY if using the provider and remove VITE_BIBLIA_API_KEY. No Clerk or other env changes.
3. Deploy release/oct-slim functions/frontend and telephony. SQL can precede deployment; old frontend callbacks are tested.
4. Verify follow-ups, CSV, county/no-data views and Biblia fallback/provider behavior.

To roll back: restore the b47e80d frontend/functions before dropping the new RPCs, then execute rollback-slim.sql's CMS section followed by its primary section. It deletes the release-created public penetration table/imported rows; preserves all CRM task rows, new tasks, statuses, due dates and reasons; restores replaced policies and only automatic owner backfills whose owner was not subsequently changed. Unrelated tables/functions remain untouched. The snapshots are removed after a successful rollback. Do not reintroduce the browser Bible key; the old frontend can use its existing verse fallback.
