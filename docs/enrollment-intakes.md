# Native Medicare enrollment intake

Migration: `125_enrollment_intakes.sql`. Apply after 124 before releasing the frontend, Netlify functions and integrations worker. This change does not deploy or apply the migration.

MA Enrolled and Enrolled Pending Verification open the native intake. Completed intake records gate the disposition in the phone API and a database trigger (including call-log edits). Agents can reopen Enrollment Intake from the expanded call record, edit an existing enrollment, or add a household member and choose their contact. The existing MA disposition/opportunity trigger remains in place, including Enrolled → Won. Call routing is unchanged.

The PY2027 picker filters the loaded `cms_plans_py2027` landscape by state and carrier, excludes PDPs, searches names and removes county duplicates. Plan name, contract, plan, segment and premium autofill; all remain editable, including manual plans.

## Storage and delivery

Each intake references a call and contact. DOB, MBI and Medicaid number use the existing `encrypt_pii_value` / `decrypt_pii_value` primitives and Vault keys. Those fields never enter the intake's plaintext `data`. The GHL outbox stores the complete payload encrypted, with no request/response body or sensitive field logging. Browser roles cannot read either table or execute writes/decryption directly. The API authorizes the signed-in tenant and owning call agent before reading or writing.

Saving the intake, encrypting PII, creating/updating its follow-up task and inserting a GHL delivery are one transaction. Each enrollment gets its own task, assigned to the writing agent's existing slug, at 9 a.m. America/New_York on the editable follow-up date. Edits reuse the task and preserve the initial submission timestamp. The effective date calculation uses calendar days, including leap years and DST boundaries.

Set `GHL_ENROLLMENT_WEBHOOK_URL` to the supplied legacy workflow endpoint in the Railway integrations worker's server environment/secrets. The value is intentionally absent from source and frontend bundles. It may also be configured in the Netlify server environment for an immediate delivery attempt after saving. The Railway worker drains the durable queue independently; a missing secret leaves deliveries pending. No live webhook is sent by tests.

The GHL body has exactly the 30 specified legacy keys. `newCarrier` keeps the display label; `carrier_key` stores the Conversely canonical name. Agent assignment is configured in `src/lib/enrollmentIntake.js` (`GHL_USERS`); Mike's blank ID falls back to Mark's ID. Both `assignedUserId` and `assignedTo` receive that ID. Personal Code and ZIP are stored natively but add no keys to the legacy webhook.

The GHL queue uses the same claims, 30-minute leases, token-checked finishes, five attempts and 60/120/240/480/960-second backoff as compliance uploads. Its stable delivery ID is the idempotency header. Intake revisions deliver in order, preventing an older edit from overwriting a newer one. Failed final attempts remain visible on the intake; saving never depends on GHL succeeding. As with any external webhook, recovery after an accepted request whose response is lost also depends on the receiver honoring idempotency.

## Compliance source change

Both delivery paths now require a completed intake and load it using the job's `enrollment_key` (the intake UUID), scoped to the call and tenant. IX queues every completed UHC intake once its recording is available. Conversely's weekly sampling rules otherwise remain unchanged. Historical calls without an intake are ineligible until an intake is completed; existing queued legacy jobs without a matching intake fail closed.

| Vendor field | Previous source | New source in `enrollment_intakes` |
|---|---|---|
| CarrierName | `call_records.carrier_name` | `data.newCarrier` (eligibility uses `carrier_key`) |
| PlanName | `call_records.plan_name` | `data.planName` |
| ContractID | `call_records.metadata.contract_id` | `data.contractId` |
| PlanID | `call_records.plan_id` | `data.planId` |
| SegmentID | `call_records.metadata.segment_id` | `data.segmentId` |
| EnrollmentID | `enrollment_confirmation_number`, falling back to call UUID | `data.enrollmentId` (blank allowed) |
| EffectiveDate | `call_records.effective_date` | `data.effectiveDate` |
| SubmissionDate | `metadata.submission_date`, falling back to call creation | `submitted_at` |
| Applicant first/last name | `customer_first_name` / `customer_last_name` | `data.firstName` / `data.lastName` |
| Applicant phone | `customer_phone` | `data.phone` |
| Applicant state | `customer_state`, then `state_code` | `data.state` |
| Applicant ZIP | `zip_code` | `data.zip` (additional native field, prefilled from contact/call) |
| IX confirmation | split `call_records.sunfire_code` | this intake's `data.sunfireCode`; call field is kept in sync |

Previously IX transmitted only the confirmation code, idempotency key and audio through its client boundary; it did not transmit the above enrollment metadata. It now supplies the same intake metadata to both `createUpload` and `confirmUpload`. The existing IX client remains a disabled stub until SunFire's API contract/credentials are provided; this feature does not fabricate a live IX integration or receipt.

## Verification

`tests/enrollment-intakes.test.js` exercises the actual SQL migration, existing pgcrypto encryption functions, API authorization, GHL serialization/retries, household rows, follow-up tasks and compliance reads. `tests/enrollment-intake-ui.test.js` exercises the real form's event handlers; call-disposition tests cover the MA gate. Tests use local PostgreSQL fixtures and fake provider transports, never real applicants or webhook deliveries.
