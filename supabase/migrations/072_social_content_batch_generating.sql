-- Allow background generation status on content batches.

ALTER TABLE public.social_content_batches
  DROP CONSTRAINT IF EXISTS social_content_batches_status_check;

ALTER TABLE public.social_content_batches
  ADD CONSTRAINT social_content_batches_status_check
  CHECK (status = ANY (ARRAY[
    'generating'::text,
    'pending_review'::text,
    'approved'::text,
    'discarded'::text,
    'failed'::text
  ]));
