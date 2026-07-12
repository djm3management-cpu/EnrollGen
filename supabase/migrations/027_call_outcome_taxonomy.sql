-- ============================================================
-- Expanded call_outcome disposition taxonomy.
-- Widens call_records.call_outcome from the original 6 values to
-- the full grouped taxonomy the Calls tab / wrap-up dropdown now
-- offer. Legacy values (not_enrolled, incomplete) stay valid so
-- historical rows never violate the constraint — they're just not
-- offered as fresh choices in the UI going forward.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.call_records') IS NOT NULL THEN
    ALTER TABLE public.call_records
      DROP CONSTRAINT IF EXISTS call_records_call_outcome_check;
    ALTER TABLE public.call_records
      ADD CONSTRAINT call_records_call_outcome_check
      CHECK (
        call_outcome IS NULL OR call_outcome IN (
          -- Legacy (kept valid for historical rows)
          'not_enrolled',
          'incomplete',
          -- Enrollment Outcomes
          'enrolled',
          'enrolled_pending_verification',
          'partial_enrollment',
          -- Positive Pipeline
          'callback_scheduled',
          'interested_needs_info',
          'spouse_poa_callback',
          'transferred',
          'application_in_progress',
          -- Negative / Closed
          'not_interested',
          'not_qualified',
          'already_enrolled_elsewhere',
          'customer_hung_up',
          'do_not_call',
          'requested_removal',
          -- Unable to Reach
          'no_answer',
          'voicemail_left',
          'wrong_number',
          'bad_lead_data',
          'language_barrier',
          -- Compliance / Concern Flags
          'mentally_unfit',
          'possible_cognitive_impairment',
          'third_party_needed',
          'hostile_caller',
          'suspected_fraud',
          -- System / Technical
          'dropped_call',
          'test_call',
          'duplicate_lead'
        )
      ) NOT VALID;
  END IF;
END $$;
