ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS image_url        text;

-- Storage bucket for training session images
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-images', 'training-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "training_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-images');

CREATE POLICY "training_images_coach_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-images'
    AND NOT EXISTS (SELECT 1 FROM public.parent_auth WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "training_images_coach_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'training-images'
    AND NOT EXISTS (SELECT 1 FROM public.parent_auth WHERE auth_user_id = auth.uid())
  );
