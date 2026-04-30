-- Migration 001: Add image_url column and create storage buckets
-- Run this in: Supabase dashboard → SQL Editor → New query

-- 1. Add image_url column (idempotent)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Add token column (short public-safe URL slug) if not present
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS token text UNIQUE DEFAULT gen_random_uuid()::text;

-- 3. Create RLS-compatible storage buckets
-- (Run these in the Storage tab UI instead if SQL doesn't work)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Allow public reads on both buckets
CREATE POLICY IF NOT EXISTS "Public audio reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio');

CREATE POLICY IF NOT EXISTS "Public image reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- 5. Service role can insert
CREATE POLICY IF NOT EXISTS "Service role audio inserts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY IF NOT EXISTS "Service role image inserts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images');
