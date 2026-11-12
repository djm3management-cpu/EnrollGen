# Script enrollment intake cleanup

Migration: **146_script_enrollment_intake.sql** (not applied by this change).

Step 7 keeps the selected plan type and No Enrollment - Wrap Up. Complete Enrollment Intake opens the native form for the active call, using authorized server contact/call details, filling gaps from live notes, and carrying the selected plan type. Saving the completed intake advances to the new exact closing. A call that closes without enrollment uses the existing general closing.

The dialer and enrollment closing both import `src/lib/agencyLine.js`, the dialer's shared display source for NGHS MAIN DID. No agent number is consulted. This refactor changes no telephony configuration or call routing.

Historical MA call enrollment values are copied into native intake data. Existing nonblank native values win; differing application/confirmation IDs and old plan notes remain available under `data.legacyStep7`, displayed in the summary. DOB, MBI, and Medicaid number use the existing encryption functions. Calls without a matching intake get an incomplete draft, including unlinked calls (a contact must be selected to complete them). Migration creates no follow-up or delivery and never treats a historical note as a completed enrollment. Saving a migrated draft sets `completed_at` and uses the normal transactional follow-up/GHL path. MA script checkpoints and wrap-up no longer write the legacy enrollment columns; the columns remain for historical reads and other products. The script's legacy plan context still serves plan selection/coaching, but has no step 7 enrollment inputs or MA call-record write path.

Read-only enrollment summaries with Edit appear on both expanded call records and contact records. Contact summaries authorize each underlying call; access to a contact alone does not expose another agent's enrollment. Edits target the specific household intake and preserve its linked contact. The legacy snapshot is retained through edits.

## Field audit

All JSON paths below are in `public.enrollment_intakes`. Yes in the existing column means present in the native intake before this change. The SunFire confirmation code is the original `sunfireCode` field, not a second distinct value. Personal Code remains a separate native field.

| Field | Existed before | Native storage | Sent to GHL |
|---|---|---|---|
| firstName | Yes | data.firstName | Yes |
| lastName | Yes | data.lastName | Yes |
| dob | Yes | pii_encrypted.dob | Yes, encrypted outbox |
| phone | Yes | data.phone | Yes |
| email | Yes | data.email | Yes |
| state | Yes | data.state | Yes |
| mbi | Yes | pii_encrypted.mbi | Yes, encrypted outbox |
| medicaid | Yes | data.medicaid | Yes |
| medicaidNum | Yes | pii_encrypted.medicaidNum | Yes, encrypted outbox |
| prevCarrier | Yes | data.prevCarrier | Yes |
| newCarrier | Yes | data.newCarrier; canonical carrier_key | Yes |
| planName | Yes | data.planName | Yes |
| enrollCode | Yes | data.enrollCode | Yes |
| premium | Yes | data.premium | Yes |
| sunfireCode (SunFire confirmation code) | Yes | data.sunfireCode | Yes |
| effectiveDate | Yes | data.effectiveDate | Yes |
| sixtyDayDate | Yes | data.sixtyDayDate | Yes |
| sep | Yes | data.sep | Yes |
| contractId | Yes | data.contractId | Yes |
| planId | Yes | data.planId | Yes |
| segmentId | Yes | data.segmentId | Yes |
| enrollmentId | Yes | data.enrollmentId | Yes |
| pcpName | Yes | data.pcpName | Yes |
| agency | Yes | data.agency | Yes |
| aor | Yes | data.aor | Yes |
| hra | Yes | data.hra | Yes |
| hraDate | Yes | data.hraDate | Yes |
| zip | Yes | data.zip | Yes (added to payload) |
| planType | No | data.planType | Yes (added to payload) |
| personalCode | Yes | data.personalCode | No |

The GHL payload also retains its existing derived `assignedUserId`, `assignedTo`, and `submittedAt` keys. Payloads remain encrypted in the durable outbox. Compliance scoring is unchanged.
