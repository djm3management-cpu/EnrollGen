# Client recap

Local work on `pilot/release`, starting at `a1e0bbf`. Default off. No push, deployment, hosted database connection, real provider/model request, dependency addition, vendoring, real environment-file edit, historical migration edit, stylesheet edit or active-secret-exception change. Migration **165_client_recap.sql** is new; the exact bootstrap copy, manifest, catalog snapshot, migration statement digest and operator inventory are regenerated with the existing in-process PostgreSQL harness.

## Fields and rendering

A recap uses only these stored intake fields: consumer first name (`firstName`), plan name (`planName`), carrier (`newCarrier`), plan type (`planType`), effective date (`effectiveDate`), and confirmation (`sunfireCode`, falling back to `enrollmentId`). The call's protected owner supplies the agent name. The provisioned deployment profile supplies the agency name (`agencyName`) and callback number (`agencyLine`). No intake identity is decrypted. Consumer routing numbers stay inside the existing SMS transport and messages ledger; they are not recap fields.

The complete placeholder list is `firstName`, `planName`, `carrier`, `planType`, `effectiveDate`, `confirmationNumber`, `agentName`, `agencyName`, `callbackNumber`. The renderer rejects extra input keys. The SQL source constructs this exact projection rather than returning the intake JSON. Only a completed, submitted, non-test enrollment with a consumer, plan name, carrier and effective date is eligible. Missing required fields are named in the refusal. A stored draft timestamp alone does not establish submission.

Medicare number, Social Security number, date of birth, address, health conditions, medications, doctors/providers, premiums/costs, benefit descriptions, payment details and every free-text note are excluded. There is no generic notes, metadata, context or whole-enrollment placeholder. Existing outbound identifier validation also refuses identifier-shaped rendered output. Templates reject identifier-shaped SSN/MBI literals. Rendering is deterministic string substitution; **no model client is imported or invoked** by this feature.

## Default wording in full

Text (the three blocks are joined with single spaces):

```text
{{firstName}}, {{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}, effective {{effectiveDate}}. Questions: {{callbackNumber}}.
The carrier will send plan materials and a member card.
Submission is not confirmation of coverage. The carrier determines enrollment status.
```

PDF (the three blocks are separated by blank lines):

```text
Hello {{firstName}},

{{agentName}} at {{agencyName}} submitted your enrollment in {{planName}} ({{planType}}) with {{carrier}}. Effective date: {{effectiveDate}}.
Confirmation number: {{confirmationNumber}}.
Questions: call {{agencyName}} at {{callbackNumber}}.

The carrier will send plan materials and a member card.

Submission is not confirmation of coverage. The carrier determines enrollment status.
```

The PDF has the fixed title “Enrollment recap.” Unrecorded optional fields display “Not recorded.” Required fields never get that fallback. Each value is bounded to 200 characters and cannot contain control characters, newlines or template braces. Text is at most **480 characters**, never truncated, and refuses the confirmation placeholder or a confirmation value copied through another allowed field. Overlong text remains unavailable while a valid PDF can still be downloaded. PDF content is bounded and checked against a 43-line one-page limit before approval. Unsupported or invalid data refuses the affected channel.

## Templates and Agency Settings

`tenants.client_recap_templates` stores exactly one text and one PDF template, each with body, fixed next steps, required disclaimer and an integer version. Both start at version 1. Agency Settings uses the existing audited `tenant-settings` handler for reads and saves; the editor offers selectable allowed placeholders and a live preview using only synthetic values. Confirmation is disabled in the text editor. It adds no helper prose, layout boxes, borders, heavy font weights or stylesheet rules.

Only an active administrator can edit. The server and database validate the placeholder allowlist, channel restrictions, exact required next-steps/disclaimer blocks and strict object shape. Malformed braces and additional keys are refused. The body is administrator-approved fixed wording; it is never generated. Administrators are responsible for approving factual wording without benefit/cost claims, promises or superlatives. Each changed channel increments its database-controlled version; a stale submitted version refuses the edit. The existing administrator transaction permit is required. The existing administrator action log records the edit in the same transaction, excluding template content. A log failure rolls back both content and version. Raw service/browser updates cannot bypass the permit.

## Channels, approval and consent

Built channels: **text and PDF**. The repo's email code sends operational reports to configured fixed recipients. There is no existing consumer email sending/consent workflow to reuse; email is disabled in the channel selector, with no email template or new provider.

The Recap action is on the saved enrollment. The owning agent or agency admin opens the exact server preview, selects a channel, checks “Approve this recap,” and confirms Send text or Download PDF. No submission hook, timer, revision trigger, job, model or automatic retry can send a recap. Changing channels or refreshing/revising the enrollment clears interface approval. The server requires explicit approval, the preview checksum and the enrollment revision. SQL locks the intake, re-resolves membership/scope, rechecks eligibility/consent/templates, renders from canonical fields and compares the exact checksum/revision before reserving an attempt. A changed preview is refused.

The repo has `contacts.do_not_call`, dated call PTC evidence and stored inbound SMS, but no separate channel-specific consent field. This feature does **not** infer text permission from PTC alone and does not create a consent store. It conservatively requires all of:

- An existing `ptc_on_file=true` record for the same tenant and consumer, with a stored start date no later than today and an explicit unexpired `ptc_expiry`.
- An explicit existing inbound SMS `START` or `UNSTOP` recorded during that permission period. Generic inbound messages and “YES” do not establish text consent.
- No `do_not_call` flag and no recorded inbound `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `REVOKE` or `OPTOUT`.
- A routable stored consumer phone number and the existing outbound identifier check.

A recorded STOP remains a conservative refusal even if a later START exists; this feature does not invent a consent-renewal process. Existing provider-side restrictions remain independent. Missing permission, opt-out or invalid routing returns a fixed safe reason and leaves PDF available. No phone number, opt-in body or protected source content is returned with that reason. The ordinary SMS route retains its existing admission/ownership/content protections and shares the extracted phone/DNC/content/transport/status helpers. No earlier permission fence is relaxed.

The existing SMS SDK transport, `messages` table and signed `/twilio/sms-status` callback are reused. SQL creates the queued message and recap reservation transactionally before dispatch, so concurrent approvals cannot silently send twice. The recap references that existing message; status callbacks mirror its bounded delivery status. There is no second text body in the recap table. Provider acceptance, status persistence and an HTTP response are not a distributed transaction: an uncertain/crashed send stays reserved and never retries automatically. An admin must inspect its recorded state before explicitly resending. A PDF record describes authorized generation/download, not proof it was printed, mailed or opened.

## Access and evidence

The handler disables auth bypass and uses complete active protected deployment membership. SQL independently calls `resolve_deployment_subject` and binds the intake, call, consumer, owner and agency. Agents can preview/approve only their own call's enrollment for a consumer still assigned to them. Managers can read status only for their protected explicit team scope and cannot preview content, send, download or resend, including their own records. Admins can view/approve/resend for the agency. Unprovisioned, inactive, foreign-organization, foreign-tenant and out-of-scope users fail closed.

The table has RLS using the existing visibility helper. Browser/anonymous roles have no direct content/write/RPC grants. Service reads and deletes retain narrow grants; insertion and status mutation happen only through the scoped approval routine and existing message-status trigger. Manager status is also visible in their authorized lifecycle timeline; the older intake/PII detail permissions are not expanded.

Preview, send and PDF download each use one existing evidence-access grant. Nested source/reservation RPCs are registered in the shared audited factory and share that grant. The send/download checkpoint must commit before reservation or dispatch; a trail failure refuses data/bytes/send. The existing structured logger and administrator action log are reused, with no message body, routing number or template text in operational logs. Admin reservations and resends use `adminActionClient` / `execute_admin_action`; a failed admin trail rolls back reservation and prevents transport.

One recap per enrollment/channel is allowed for an agent, including a failed/uncertain reserved attempt and a PDF generation. Admins must explicitly choose Resend for additional attempts. Attempts are serialized by the intake lock; the admin resend has a second database-side limit and is recorded in the administrator action log. A revision marks old history entries **Out of date** by comparing the saved enrollment `updated_at` with the approval's source revision. No history is rewritten and nothing resends automatically. If a revision removes a required field, the preview is refused but authorized status history, including the out-of-date marker, remains visible.

## Records, limits and retention

`client_recaps` records enrollment, consumer, owner agent, agency, channel, template version, approving staff subject, server approval time, enrollment revision, message reference, bounded delivery status, SHA-256 of rendered UTF-8 content and the enrollment's immutable retention anchor. It has no text/body, complete intake JSON, PDF bytes, recipient address/number or provider diagnostics. The checksum covers the rendered content, not nondeterministic PDF metadata.

The installed **jsPDF** produces the one-page PDF in memory. Responses use `application/pdf`, a fixed attachment filename, `Cache-Control: private, no-store` and `nosniff`. No storage object or persistent PDF is created.

Every approval uses the existing atomic admission counters under route **`clientRecap`**: **5 per subject/minute, 30 per subject/UTC day, 300 per deployment/UTC day**. Existing strict profile `admissionLimits.clientRecap` overrides accept positive integer limits. Admission failure refuses the operation. SQL independently limits admin resends to **3 per subject/minute**; it cannot be raised by an HTTP override. Failed/uncertain attempts are not automatically refunded.

The existing retention inventory classifies recaps as enrollment evidence. The source intake and recap are linked into the same purge/savepoint group with the intake's immutable clock, default **10 calendar years**, existing overrides, holds and reference guards. Retained linked messages/audits can extend that group; no new cleanup timer or alternate schedule exists. The same retention pass records UUID-only recap deletion provenance through `capture_lifecycle_purge_marker` and rolls back group deletion on failure. Tests backdate only synthetic immutable anchors/audit rows using owner fixture controls; runtime guards remain intact.

## Lifecycle and audit packet

The existing private lifecycle projection adds event type **`recap`**, fixed summary **“Enrollment recap approved”**, channel, status, approving staff, time and recap evidence reference/checksum. No message body or PDF is included. Message events retain their existing independent no-body projection. The audit packet's existing evidence index lists `client_recaps` and its rendered-content SHA-256. **All six completeness checks are unchanged; no seventh check is added.** With recap disabled, there are no recap events or filter entries. Coaching remains absent from lifecycle content.

## Switch and local limits

In a separately authorized environment, apply migration 165 or the complete fresh-install bootstrap, retain the existing protected deployment/profile/roster provisioning and SMS configuration, and set server **`CLIENT_RECAP_ENABLED=true`**. The existing strict parser treats unset/empty/`false` as off, accepts only exact `true` for on and rejects other values. Trusted server feature headers enforce SQL gating. The public boolean controls the interface. Both direct function and `/api/client-recap` URLs return 404 before auth/client construction when off; there is no enrollment action, template settings entry or recap lifecycle filter. The optional template section on the existing settings handler is also absent. No actual environment was edited or enabled.

All validation uses synthetic data, local PostgreSQL/PGlite, stubbed SMS clients and the external-network fence. Registry vulnerability audits are the only permitted external requests. The synthetic PDF was rasterized with macOS `sips` and visually inspected: one page, readable text, no clipping or overlap. The browser access host is unavailable, so actual Terminal/light browser rendering could not be verified; component behavior tests cover switch gating, previews, disabled channels, approval, manager status, revision refresh and synthetic template preview, with unchanged shared theme styles.

Not verified locally: hosted Clerk/PostgREST/RLS behavior, real migration rollout, real SMS delivery/opt-in/provider registration/callback timing, consumer email, native PostgreSQL concurrent-process/crash behavior, production-scale latency, browser theme acceptance or print/mail receipt. The durable reservation prevents application retry duplication; it does not claim exactly-once provider delivery across crashes. Existing pilot acceptance, retention storage and secret-rotation gates remain unchanged. No push or deploy occurred.

## Local validation

Final counts and the complete verification result are recorded below before commit. Starting baseline: **1,602 root tests / 334 telephony tests**. The isolated starting-commit source inventory initially needed local Git metadata to avoid treating its dependency symlinks as source; that fixture issue was repaired without changing the starting source. The final baseline and implementation use the same installed dependencies and external-network fence.

| Check | Final result |
|---|---|
| Root suite | **1,658 passed**, zero failures/cancellations/skips; baseline 1,602 (+56). |
| Telephony suite and import boundaries | **334 passed**, zero failures/cancellations/skips; baseline 334. |
| `npm run verify` on final source | **PASS, 10/10 steps**. |
| Recap API/database and component acceptance | **51 passed**, including required-field removal preserving out-of-date history. |
| Earlier coaching/intake plus recap/bootstrap focused regression | **119 passed** before the final two history cases; all are included in the final full run. |
| Fresh bootstrap/catalog | **9 passed**, including independent empty builds; the existing access matrix also passes. |
| Lint, model types, environment-free build and built headers | Passed; four existing React hook warnings, no lint errors. |
| Root and telephony npm audits | Zero vulnerabilities at every severity; npm registry audit traffic only. |
| Agency and tracked secret scans | Passed, zero findings; the same active exception and review deadline remain. |
| Recap server bundling | Passed with the installed dependencies; the complete module graph contains no model client/provider modules. |
| Scope | `pilot/release`; no push/deploy, real environment/dependency/style/historical-migration/active-exception changes. |

The first complete verification found a pure template-validator EXECUTE grant needed by unrelated service settings updates, and a missing component binding in the existing isolated enrollment-summary test harness. Both were corrected without removing assertions or changing earlier coaching behavior. Final security review also closed a nullable status-only SQL argument that could otherwise expose preview fields to a manager, and required the administrator transaction permit for initial admin approvals as well as resends. Their direct database and audit rollback cases pass. The final complete ten-step verification passed after those fixes and the added ineligible-revision history cases. No remote acceptance or rollout is claimed.
