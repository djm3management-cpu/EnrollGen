BEGIN;

-- A lead_source_id alone is insufficient on the shared DID: the fallback
-- attribution trigger may label an unpinged new caller as Paragon. Require
-- an accepted Paragon ping that was claimed for this exact Twilio call.
CREATE OR REPLACE FUNCTION public.paragon_vendor_report(p_source_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(call_id text, received_at timestamptz, caller_phone text, caller_state text,
  duration_seconds integer, billable text, non_billable_reason text, disposition_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    coalesce(nullif(i.aggregator_call_id,''),
      (SELECT nullif(d.vendor_call_id,'') FROM paragon_ping_decisions d
       WHERE d.source_id=i.lead_source_id AND d.matched_call_sid=i.twilio_call_sid
       ORDER BY d.received_at DESC LIMIT 1)) AS call_id,
    i.created_at AS received_at,
    i.from_number AS caller_phone,
    i.caller_state,
    greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) AS duration_seconds,
    CASE WHEN greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) >= 90 THEN 'yes' ELSE 'no' END AS billable,
    CASE WHEN greatest(0,coalesce(i.duration_seconds,r.call_duration_seconds,0)) >= 90 THEN NULL
      WHEN i.wrong_state THEN 'wrong_state'
      WHEN i.status='rejected' THEN 'rejected'
      WHEN i.status='failed' THEN 'failed'
      ELSE 'under_90_seconds' END AS non_billable_reason,
    CASE
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
  FROM inbound_calls i
  JOIN lead_sources s ON s.id=i.lead_source_id AND s.id=p_source_id
    AND s.tenant_id=i.tenant_id AND s.name='Paragon Media' AND s.type='publisher'
  LEFT JOIN call_records r ON r.id=i.call_record_id AND r.tenant_id=i.tenant_id
  WHERE i.created_at >= p_start AND i.created_at < p_end
    AND EXISTS (SELECT 1 FROM paragon_ping_decisions d
      WHERE d.source_id=s.id AND d.matched_call_sid=i.twilio_call_sid AND d.available)
  ORDER BY i.created_at DESC, i.id DESC;
$$;

COMMIT;
