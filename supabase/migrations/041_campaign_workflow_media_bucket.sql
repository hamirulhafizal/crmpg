-- Private bucket for campaign workflow background images (per-user paths).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-workflow-media',
  'campaign-workflow-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can manage files under their own folder: {user_id}/...
CREATE POLICY "campaign_workflow_media_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-workflow-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "campaign_workflow_media_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-workflow-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "campaign_workflow_media_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'campaign-workflow-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "campaign_workflow_media_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-workflow-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
