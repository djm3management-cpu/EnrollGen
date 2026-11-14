-- Source statement 1
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address TEXT;
