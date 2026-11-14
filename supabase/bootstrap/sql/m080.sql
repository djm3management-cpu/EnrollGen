-- Source statement 1
BEGIN;

-- Source statement 2
UPDATE public.carrier_rts
SET channel = 'SMS'
WHERE channel = 'SMS/Medigap Life';

-- Source statement 3
UPDATE public.knowledge_base
SET title = regexp_replace(title, 'Medigap[[:space:]_-]*Life', '', 'gi'),
    content = regexp_replace(content, 'Medigap[[:space:]_-]*Life', '', 'gi'),
    key = regexp_replace(key, 'Medigap[[:space:]_-]*Life', '', 'gi'),
    category = regexp_replace(category, 'Medigap[[:space:]_-]*Life', '', 'gi'),
    metadata = regexp_replace(metadata::text, 'Medigap[[:space:]_-]*Life', '', 'gi')::jsonb,
    source_urls = ARRAY(SELECT u FROM unnest(source_urls) AS u WHERE u !~* 'Medigap[[:space:]_-]*Life'),
    updated_at = now()
WHERE concat_ws(' ', title, content, key, category, metadata::text, source_urls::text)
      ~* 'Medigap[[:space:]_-]*Life';

-- Source statement 4
COMMIT;
