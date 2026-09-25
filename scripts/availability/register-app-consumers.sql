-- SHA-256 of each exact UTF-8 key, with no trailing newline. Run after migration 047.
INSERT INTO public.availability_consumers (name, key_hash, active)
VALUES
  ('enrollgen', 'b1b2ad953a1a3f59bd6ba78bddb0b62021f0862776c0bc60b8831bccf91eb713', true),
  ('nghs-status', '0d82084a4c22d277ae27230cb20d99ab6b957609eff7b633fc15354e4328923b', true)
ON CONFLICT (name) DO UPDATE
SET key_hash = EXCLUDED.key_hash, active = EXCLUDED.active;
