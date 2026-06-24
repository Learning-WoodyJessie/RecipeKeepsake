-- Viewer role (Phase 5, Epic 16): read-only access to an owner's whole
-- archive for a pre-approved email or phone number, no full account needed.
-- A viewer still authenticates (via Supabase email/phone OTP) so every view
-- is tied to a real, revocable identity — this is not a public share link.
-- owner_user_id is text, not uuid, to match the existing recipes.user_id /
-- people.user_id columns (see "user_id::text = auth.uid()::text" elsewhere) —
-- a uuid column here would fail to join against those text columns.
CREATE TABLE IF NOT EXISTS viewers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   text        NOT NULL,
  email           text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  CONSTRAINT viewers_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS viewers_owner_idx ON viewers (owner_user_id);
CREATE INDEX IF NOT EXISTS viewers_email_idx ON viewers (email) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS viewers_phone_idx ON viewers (phone) WHERE revoked_at IS NULL;

ALTER TABLE viewers ENABLE ROW LEVEL SECURITY;

-- Owners manage their own viewer list (service role bypasses RLS anyway —
-- the FastAPI layer is the actual enforcement point for writes, this is the
-- DB-level backstop matching the pattern already used for recipes/people).
CREATE POLICY "owners manage their viewers"
ON viewers FOR ALL
USING (owner_user_id::text = auth.uid()::text);

-- Viewers can read (but never write) recipes/people belonging to any owner
-- who has approved their authenticated email or phone and not revoked it.
-- Both sides of the owner-id comparison are cast to ::text explicitly —
-- recipes.user_id and people.user_id have turned out to be uuid in this
-- project, not text, so casting avoids relying on either column's exact type.
CREATE POLICY "approved viewers can read shared recipes"
ON recipes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM viewers
    WHERE viewers.owner_user_id::text = recipes.user_id::text
      AND viewers.revoked_at IS NULL
      AND (
        (viewers.email IS NOT NULL AND viewers.email = (auth.jwt() ->> 'email'))
        OR (viewers.phone IS NOT NULL AND viewers.phone = (auth.jwt() ->> 'phone'))
      )
  )
);

CREATE POLICY "approved viewers can read shared people"
ON people FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM viewers
    WHERE viewers.owner_user_id::text = people.user_id::text
      AND viewers.revoked_at IS NULL
      AND (
        (viewers.email IS NOT NULL AND viewers.email = (auth.jwt() ->> 'email'))
        OR (viewers.phone IS NOT NULL AND viewers.phone = (auth.jwt() ->> 'phone'))
      )
  )
);
