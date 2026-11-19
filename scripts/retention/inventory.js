// Explicit policy inventory; new tables are retained until classified here.
export const GROUPS = Object.freeze({
  practice: ['practice_sessions','practice_results'],
  call: ['post_call_coaching','inbound_calls','call_records','sessions','call_threads','call_transcripts','transcript_chunks','telephony_transcript_segments',
    'compliance_scorecards','compliance_scores','scorecard_items','section_scores','intent_detections','compliance_flags',
    'phi_redactions','corrective_actions','compliance_review_decisions','calibration_overrides','cross_sell_attempts','followup_queue'],
  enrollment: ['member_status_import_files','member_carrier_ids','member_status_events','member_unmatched_rows','member_status_column_maps',
    'activation_settings','activation_tasks','activation_task_items','activation_item_records','reshop_reviews','client_recaps','enrollment_intakes','policies','sales_log','ghl_enrollment_deliveries','conversely_submissions','ix_uploads'],
  audit: ['supervisor_listen_sessions','admin_action_log','evidence_access_log','pii_access_log','session_lock_events'],
  textConsent: ['messages','message_media'],
  operational: ['supervisor_listen_grants','operational_events','admission_counters','agent_availability_log','agent_phone_sessions','call_conferences','call_logs',
    'call_participants','call_wrap_ups','compliance_daily_summaries','compliance_llm_passes','compliance_llm_requests',
    'compliance_version_requests','conference_media_leases','conversely_run_agents','conversely_run_events','conversely_runs',
    'conversely_week_slots','conversely_weekly_audit','conversely_weekly_runs','integration_deliveries','integration_delivery_attempts',
    'integration_link_issues','integration_report_log','ix_upload_retries','lead_source_pings','manual_transcript_gap_fills',
    'manual_transcript_gap_requests','media_stream_leases','paragon_agent_reservations','paragon_billing_events','paragon_call_billing',
    'paragon_callback_tasks','paragon_contact_zip_origin','paragon_control_changes','paragon_ping_decisions','paragon_report_access',
    'paragon_report_email_days','paragon_report_email_log','paragon_residence_jobs','paragon_residence_sep_inputs',
    'post_call_jobs','post_call_requests','post_call_status_tickets','post_call_webhook_claims','provider_alert_throttle',
    'recording_call_scopes','recording_compliance_tickets','recording_download_tickets','recording_reconciliation',
    'scoring_jobs','scoring_manual_retries','scoring_segment_progress','stt_call_reconnects','telephony_call_attempts',
    'telephony_events','telephony_routing_responses','transcript_recovery_alerts','transcript_score_dispatch','transcription_incidents',
    'usage_records','vendor_control_audit'],
  recording: ['recording_ingestion'],
  contact: ['contacts'],
  // CMS complaints (CTMs): complaint evidence on the 10 year enrollment period.
  complaint: ['ctm_records'],
});
export const TABLE_CLASS = Object.freeze(Object.fromEntries(Object.entries(GROUPS).flatMap(([group,tables])=>tables.map(t=>[t,group]))));
