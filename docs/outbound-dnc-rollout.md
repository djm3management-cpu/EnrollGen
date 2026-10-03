# Outbound DNC and dialer contact parity (F21 / F09 / F20)

Apply `supabase/migrations/070_outbound_dnc.sql` first, deploy telephony code second,
and deploy the browser build third. The new code fails closed without the SQL RPC.
No production SQL or deployment was performed during implementation.

DNC is stored in `contacts.do_not_call`. The SQL RPC checks every contact in the
verified tenant by canonical E.164 blind index or normalized legacy phone, regardless
of ownership or the caller-supplied contact ID. Authenticated SQL callers must supply
their own active tenant-agent UUID; only service-role callers can select a tenant.

The signed `/api/voice/outbound` webhook derives the tenant from the active agent and
checks DNC before reservation and before routing replay. Lookup failures hang up with
a clear reason. Contact creation and attempt persistence retain the existing call
reservation flow. Inbound routing, hours/caps, recordings and Paragon were not changed.

All Call controls use the same checked control: keypad (including edits), Recents,
dialer Contacts, opportunity cards, contact detail and contact workspace cockpit
buttons. Carrier Quick Reference and SEP telephone links also check the current tenant
policy. The Calls tab (`CallHistory`) contains navigation/playback, with no dial action.
The shared `makeCall` checks again immediately before SDK connect; the signed webhook
is authoritative for telephony calls. UI checks cannot control calls manually placed
outside this application.

The dialer Contacts tab supplies the provider's resolved requesting-agent UUID to the
encrypted contact hook and shows load errors. On SDK acceptance, the browser fetches
`/api/voice/outbound-status` using the exact parent call SID. The endpoint returns the
persisted contact, attempt and normalized phone only for the verified agent and tenant.
Wrap-up opens after identity is resolved; a missing identity disconnects the call and
shows an error instead of linking to the supplied contact. A disconnected call cannot
be reopened by a late lookup response.

Validation: production build, full root suite (214 passing), full telephony suite
(158 passing), targeted frontend lint, and whitespace checks passed. SQL tests execute
070 in PGlite with tenant, duplicate/legacy, blind-index and privilege fixtures. UI,
SDK and authenticated endpoint tests use isolated fixtures; no live customer call was
placed and no production database was changed.
