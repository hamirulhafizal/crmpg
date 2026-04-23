-- Default WAHA server for every profile (matches production waha_servers row).
-- Safe if 014 already included this default: ALTER only resets the same default.

ALTER TABLE public.profiles
  ALTER COLUMN waha_server_id SET DEFAULT 'eff01293-4421-4ed2-be7f-f28a7be2cb72'::uuid;

UPDATE public.profiles
SET waha_server_id = 'eff01293-4421-4ed2-be7f-f28a7be2cb72'::uuid
WHERE waha_server_id IS NULL;
