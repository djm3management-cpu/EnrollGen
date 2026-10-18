-- Apply before deploying ancillary-sale UI and post-call function changes.
-- Keep the originating call's product_type; this column identifies what sold.
BEGIN;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS ancillary_product_type text;
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
          'sale_ancillary',
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

ALTER TABLE public.call_records ADD CONSTRAINT call_records_ancillary_product_check CHECK (
  (ancillary_product_type IS NULL OR ancillary_product_type IN
    ('hospital_indemnity','dental_vision','final_expense','cancer','accident'))
  AND (call_outcome IS DISTINCT FROM 'sale_ancillary' OR ancillary_product_type IS NOT NULL)
);

-- Keep the existing eight-column vendor contract and billing evidence filters.
ALTER TABLE public.call_transcripts DROP CONSTRAINT IF EXISTS call_transcripts_disposition_check;
ALTER TABLE public.call_transcripts ADD CONSTRAINT call_transcripts_disposition_check CHECK (
  disposition IS NULL OR disposition IN (
    'pending','enrolled','enrolled_pending_verification','partial_enrollment','sale_ancillary',
    'not_enrolled','incomplete','callback','callback_scheduled','interested_needs_info',
    'spouse_poa_callback','transferred','application_in_progress','not_interested','not_qualified',
    'already_enrolled_elsewhere','customer_hung_up','do_not_call','requested_removal','no_answer',
    'voicemail_left','wrong_number','bad_lead_data','language_barrier','mentally_unfit',
    'possible_cognitive_impairment','third_party_needed','hostile_caller','suspected_fraud',
    'dropped','complaint','dropped_call','test_call','duplicate_lead'
  )
) NOT VALID;

CREATE OR REPLACE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT f.vendor_call_id AS call_id,coalesce(f.arrived_at,i.created_at) AS received_at,
    f.caller_phone,f.caller_state,f.billable_seconds AS duration_seconds,
    CASE WHEN f.is_billable THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN f.billable_seconds IS NULL THEN 'billing_unverified'
      WHEN f.is_billable THEN NULL WHEN f.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected' WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
      WHEN r.call_outcome='sale_ancillary' THEN 'sale'
      WHEN coalesce(r.vendor_disposition,r.call_outcome,i.status) IN
        ('enrolled','enrolled_pending_verification','partial_enrollment','not_enrolled','incomplete',
         'callback_scheduled','interested_needs_info','spouse_poa_callback','transferred',
         'application_in_progress','not_interested','not_qualified','already_enrolled_elsewhere',
         'customer_hung_up','do_not_call','requested_removal','no_answer','voicemail_left',
         'wrong_number','bad_lead_data','language_barrier','third_party_needed','hostile_caller',
         'suspected_fraud','dropped_call','test_call','duplicate_lead','rejected','failed',
         'completed','accepted','declined','voicemail','wrong_state')
      THEN coalesce(r.vendor_disposition,r.call_outcome,i.status)
      ELSE 'other' END AS disposition_category
  FROM paragon_billing_facts f
  LEFT JOIN inbound_calls i ON i.id=f.inbound_call_id AND i.tenant_id=f.tenant_id
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=f.tenant_id
  WHERE f.source_id=p_source_id AND coalesce(f.arrived_at,i.created_at)>=p_start
    AND coalesce(f.arrived_at,i.created_at)<p_end
  ORDER BY coalesce(f.arrived_at,i.created_at) DESC,f.parent_call_sid DESC;
$$;

CREATE OR REPLACE FUNCTION public.vendor_call_payload(p_call_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('aggregator_call_id',i.aggregator_call_id,'twilio_call_sid',i.twilio_call_sid,
   'publisher',i.publisher,'call_start_time',i.created_at,'caller_phone',i.from_number,
   'duration',CASE WHEN s.name='Paragon Media' AND s.type='publisher' THEN f.billable_seconds ELSE coalesce(i.duration_seconds,r.call_duration_seconds,0) END,
   'disposition_code',CASE WHEN r.call_outcome='sale_ancillary' THEN 'sale'
      WHEN coalesce(r.call_outcome,i.status) IN ('mentally_unfit','possible_cognitive_impairment')
      THEN 'other' ELSE coalesce(r.call_outcome,i.status,'incomplete') END,
   'sale',coalesce(r.call_outcome IN ('enrolled','sale_ancillary'),false),
   'state',coalesce(i.confirmed_state,i.caller_state,r.metadata->>'state'),
   'wrong_state',i.wrong_state,'zip',i.confirmed_zip,
   'billing_dispute',CASE WHEN s.name='Paragon Media' AND s.type='publisher' THEN coalesce(f.billing_dispute,false) ELSE i.wrong_state AND coalesce(i.duration_seconds,r.call_duration_seconds,0)>=90 END)
 FROM inbound_calls i LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id LEFT JOIN lead_sources s ON s.id=i.lead_source_id AND s.tenant_id=i.tenant_id
 LEFT JOIN paragon_billing_facts f ON f.parent_call_sid=i.twilio_call_sid AND f.tenant_id=i.tenant_id
 WHERE i.id=p_call_id;
$$;


NOTIFY pgrst, 'reload schema';
COMMIT;
