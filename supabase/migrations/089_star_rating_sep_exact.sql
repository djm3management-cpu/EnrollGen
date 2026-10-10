-- Preserve the deployed FEMA wrapper and all other SEP rules.
BEGIN;
DO $$
DECLARE target regprocedure; definition text;
BEGIN
  target := coalesce(to_regprocedure('public.get_available_seps_before_fema_078(text)'),
                     to_regprocedure('public.get_available_seps(text)'));
  IF target IS NULL THEN RAISE EXCEPTION 'SEP lookup function missing'; END IF;
  definition := pg_get_functiondef(target);
  IF position('sr.overall_star_rating >= 5.0' IN definition) = 0
     AND position('sr.overall_star_rating = 5.0' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected SEP star predicate; inspect before applying';
  END IF;
  definition := replace(definition, 'sr.overall_star_rating >= 5.0', 'sr.overall_star_rating = 5.0');
  definition := replace(definition, 'COUNT(sr.id)', 'COUNT(DISTINCT sr.contract_id)');
  EXECUTE definition;
END $$;
COMMIT;
