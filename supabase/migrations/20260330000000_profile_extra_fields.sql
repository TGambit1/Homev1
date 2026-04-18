-- Add editable profile fields and avatar support
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS location     TEXT;

-- Create public avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies (anon = unauthenticated client requests)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'avatars_public_read' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "avatars_public_read" ON storage.objects
        FOR SELECT TO anon USING (bucket_id = 'avatars')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'avatars_insert' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "avatars_insert" ON storage.objects
        FOR INSERT TO anon WITH CHECK (bucket_id = 'avatars')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'avatars_update' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "avatars_update" ON storage.objects
        FOR UPDATE TO anon USING (bucket_id = 'avatars')
    $p$;
  END IF;
END $$;
