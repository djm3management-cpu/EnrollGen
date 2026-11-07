-- UNAPPLIED. After 133-140, with scoring disabled. No historical item changes.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE original scoring_templates; replacement uuid:=gen_random_uuid(); n integer;
BEGIN
 SELECT * INTO STRICT original FROM scoring_templates
 WHERE id='00000000-0000-0000-0000-000000000115' AND is_active FOR UPDATE;
 SELECT count(*) INTO n FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id
 WHERE t.template_id=original.id AND i.intent_code IN
 ('ELIG_010_ESRD_STATUS_CHECK','CONDUCT_013_NO_COMPARISON_BY_NAME','ENROLL_008_CMS_REVIEW_PERIOD');
 IF n<>3 THEN RAISE EXCEPTION 'Expected exactly three retired template items; inspect before applying'; END IF;
 INSERT INTO scoring_templates(id,template_name,product_type,carrier_name,version,is_active,total_possible_points,passing_threshold,auto_fail_threshold,categories,policy_version)
 VALUES(replacement,'NGHS Medicare Advantage Standard v4 (CY2027 approved retirements)',original.product_type,original.carrier_name,original.version+1,false,0,original.passing_threshold,original.auto_fail_threshold,original.categories,original.policy_version);
 INSERT INTO scoring_template_items(template_id,intent_id,question_text,category,points_possible,is_auto_fail,is_critical,display_order,notes)
 SELECT replacement,t.intent_id,t.question_text,t.category,t.points_possible,t.is_auto_fail,t.is_critical,t.display_order,t.notes
 FROM scoring_template_items t JOIN compliance_intents i ON i.id=t.intent_id WHERE t.template_id=original.id
 AND i.intent_code NOT IN ('ELIG_010_ESRD_STATUS_CHECK','CONDUCT_013_NO_COMPARISON_BY_NAME','ENROLL_008_CMS_REVIEW_PERIOD');
 UPDATE scoring_templates SET total_possible_points=(SELECT sum(points_possible) FROM scoring_template_items WHERE template_id=replacement),
 categories=(SELECT jsonb_object_agg(c.key,jsonb_set(c.value,'{max_points}',to_jsonb(coalesce((SELECT sum(t.points_possible) FROM scoring_template_items t WHERE t.template_id=replacement AND t.category=c.key),0)))) FROM jsonb_each(original.categories)c)
 WHERE id=replacement;
 UPDATE scoring_templates SET is_active=false WHERE id=original.id;
 UPDATE scoring_templates SET is_active=true WHERE id=replacement;
END $$;
COMMIT;
