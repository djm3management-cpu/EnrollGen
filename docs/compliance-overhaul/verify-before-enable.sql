-- READ ONLY. Supplied for the approved rollout; NOT RUN during this task.
SELECT id,enabled FROM public.compliance_runtime_control;
SELECT id,call_id,status,lease_until FROM public.scoring_jobs
 WHERE status='pending' AND lease_until>clock_timestamp() ORDER BY lease_until;
SELECT call_id,count(*) FROM public.compliance_llm_passes WHERE mode='automatic'
 GROUP BY call_id HAVING count(*)>1;
SELECT day,reserved_tokens,token_cap FROM public.compliance_daily_budget ORDER BY day DESC LIMIT 14;
SELECT c.id,c.call_id,c.scoring_state,count(i.id) AS items
 FROM public.compliance_scorecards c LEFT JOIN public.scorecard_items i ON i.scorecard_id=c.id
 WHERE c.rules_version IS NOT NULL GROUP BY c.id HAVING c.scoring_state='complete' AND count(i.id)=0;
SELECT i.id,i.scorecard_id,i.decided_by,i.evidence_timestamp_ms
 FROM public.scorecard_items i JOIN public.compliance_scorecards c ON c.id=i.scorecard_id
 WHERE c.rules_version IS NOT NULL AND i.auto_fail_triggered
 AND (i.decided_by IS DISTINCT FROM 'Code' OR nullif(trim(i.evidence_text),'') IS NULL OR i.evidence_timestamp_ms IS NULL);
SELECT schemaname,tablename,policyname,roles,qual FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('compliance_scorecards','scorecard_items','intent_detections','phi_redactions');
SELECT p.oid::regprocedure,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('get_sale_compliance_dispatch','begin_scoring_job','persist_scoring_result','save_compliance_version','reserve_compliance_request','reserve_stt_reconnect','register_stt_stream');
