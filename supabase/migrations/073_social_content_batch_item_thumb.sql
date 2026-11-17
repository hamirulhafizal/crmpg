-- Poster/thumbnail URL for video previews in generate review UI.

ALTER TABLE public.social_content_batch_items
  ADD COLUMN IF NOT EXISTS media_thumb_url TEXT;
