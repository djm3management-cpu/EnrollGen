# Agent dispositions

Agents can change an earlier call in **Calls → expand the call row → Call Outcome**. Ordinary outcomes save on selection. For **Sale - Ancillary**, choose a product type and click **Save Outcome**. The live MA script also offers the same options in **Wrap-Up**.

## Wrap-up and call-log options

### Enrollment Outcomes

| Label | Stored value |
| --- | --- |
| Enrolled | `enrolled` |
| Enrolled - Pending Verification | `enrolled_pending_verification` |
| Partial Enrollment (App Started, Not Completed) | `partial_enrollment` |
| Sale - Ancillary | `sale_ancillary` |

### Positive Pipeline

| Label | Stored value |
| --- | --- |
| Callback Scheduled | `callback_scheduled` |
| Interested - Needs More Info | `interested_needs_info` |
| Spouse/POA Callback Required | `spouse_poa_callback` |
| Transferred to Carrier | `transferred` |
| Application In Progress | `application_in_progress` |

### Negative / Closed

| Label | Stored value |
| --- | --- |
| Not Interested | `not_interested` |
| Not Qualified (Age/State/Coverage) | `not_qualified` |
| Already Enrolled Elsewhere | `already_enrolled_elsewhere` |
| Customer Hung Up | `customer_hung_up` |
| Do Not Call (DNC) | `do_not_call` |
| Requested Removal from List | `requested_removal` |

### Unable to Reach

| Label | Stored value |
| --- | --- |
| No Answer | `no_answer` |
| Voicemail Left | `voicemail_left` |
| Wrong Number / Disconnected | `wrong_number` |
| Bad Lead Data (Name/Info Mismatch) | `bad_lead_data` |
| Language Barrier | `language_barrier` |

### Compliance / Concern Flags

| Label | Stored value |
| --- | --- |
| Mentally Unfit (Unable to Understand) | `mentally_unfit` |
| Possible Cognitive Impairment | `possible_cognitive_impairment` |
| Third Party Needed (Guardian/POA) | `third_party_needed` |
| Hostile / Abusive Caller | `hostile_caller` |
| Suspected Fraud | `suspected_fraud` |

### System / Technical

| Label | Stored value |
| --- | --- |
| Dropped Call / Connection Issue | `dropped_call` |
| Test Call | `test_call` |
| Duplicate Lead | `duplicate_lead` |

## Ancillary sales

Sale - Ancillary requires one product: Hospital Indemnity, Dental / Vision, Final Expense, Cancer, or Accident. The selected product is stored in `call_records.ancillary_product_type`, separate from the originating call’s product line. This allows an MA call to result in an ancillary sale without recording a Medicare enrollment.

Validation runs in the wrap-up UI, post-call endpoint, call-log save, and database constraint. A call-log edit saves the outcome and product together. Changing away from the ancillary-sale outcome clears the product field.

Paragon report rows (including CSV and future daily emails) map `sale_ancillary` to `disposition_category: sale`. The vendor payload maps it to `disposition_code: sale` and `sale: true`. Report refreshes read the saved outcome, including edits made hours after the call. Already-sent emails are unchanged. Billing duration, proof, rates, and the 90-second threshold remain unchanged.

## Other existing disposition surfaces

- Transcript import has six choices: Enrolled, Not Enrolled, Callback, Transferred, Dropped, Complaint. Its product-line selector already includes Ancillary; this is separate from the call-record sale disposition.
- Historical call records may also contain Not Enrolled (legacy) and Incomplete (legacy). These remain accepted but are not new-choice options in wrap-up.
- Calls-tab disposition filters (Connected, Voicemail, Missed, Declined) describe call connection status; the expanded Call Outcome control records the agent’s result.

## Deployment

Production database status, verified 2026-10-16: availability migrations 096 and 097 were already installed. Migration `098_ancillary_sale_disposition.sql` has now been applied. The new product column is readable through the API, and the outcome/product constraints and report functions were verified in the live catalog.

The frontend and Netlify functions were deployed together to production on 2026-10-16 in deploy `6ad292df521d30e24f2f243d` ([deploy log](https://app.netlify.com/projects/enrollgen/deploys/6ad292df521d30e24f2f243d)). The signed-in production Calls screen was checked on a historical call: Sale - Ancillary appears, all five product choices are present, and Save Outcome stays disabled until a product is selected. No test sale was saved. The post-call endpoint still rejects requests without authentication. No Railway deployment was required. Do not replay the older migration tree or rerun 098, since its named product constraint is already installed.
