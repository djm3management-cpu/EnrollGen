-- Street address field for the client info widget's new ADDRESS
-- field (left rail, MA flow). contacts already had zip/county/state
-- but no street-level address column.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address TEXT;
