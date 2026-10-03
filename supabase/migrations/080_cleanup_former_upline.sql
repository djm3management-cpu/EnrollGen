-- Remove the former-upline name only; generic Medigap references stay intact.
BEGIN;

UPDATE public.carrier_rts
SET channel = 'SMS'
WHERE channel = 'SMS/Medigap Life';

-- A serialized JSON replacement also covers nested structured Co-Pilot content.
-- The replacement contains no JSON delimiters; keys and values remain valid JSON.
-- No currently matching live knowledge rows were found in the preflight scan.
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

COMMIT;
