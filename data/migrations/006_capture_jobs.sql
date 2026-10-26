-- Migration 006: capture jobs (background processing of a recording).
-- Run in: Supabase dashboard -> SQL Editor -> New query.
--
-- A job is one recording moving through transcribe -> structure. The finished
-- draft waits here until its owner reviews and saves it; only then is a row
-- written to `memories`. Nothing that reads `memories` can see a job.
--
-- Access: server only. RLS is on with no policies, so the public app key can
-- read and write nothing here; the service role bypasses RLS.

CREATE TABLE IF NOT EXISTS capture_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL,
  client_request_id text        NOT NULL,
  status            text        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'saved', 'discarded')),
  stage             text,
  audio_path        text        NOT NULL,
  language          text        NOT NULL DEFAULT 'auto',
  narrator          text,
  result            jsonb,
  error_kind        text,
  error_message     text,
  attempts          integer     NOT NULL DEFAULT 0,
  quota_refunded    boolean     NOT NULL DEFAULT false,
  memory_token      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  -- A retried upload (dropped response, double tap) must not create a second job.
  CONSTRAINT capture_jobs_idempotency UNIQUE (user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS capture_jobs_user_open_idx
  ON capture_jobs (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS capture_jobs_updated_idx
  ON capture_jobs (status, updated_at);

ALTER TABLE capture_jobs ENABLE ROW LEVEL SECURITY;
