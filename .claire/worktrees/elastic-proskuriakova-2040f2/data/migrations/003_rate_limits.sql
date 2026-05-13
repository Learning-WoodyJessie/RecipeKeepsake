-- Rate limiting table: one row per (user, date, endpoint)
-- Atomic upsert via increment_rate_limit() function below.
-- Old rows (past dates) are never queried — prune periodically if needed.
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id   text        NOT NULL,
  date      date        NOT NULL DEFAULT CURRENT_DATE,
  endpoint  text        NOT NULL,
  count     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, endpoint)
);

CREATE OR REPLACE FUNCTION increment_rate_limit(p_user_id text, p_endpoint text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO rate_limits (user_id, date, endpoint, count)
  VALUES (p_user_id, CURRENT_DATE, p_endpoint, 1)
  ON CONFLICT (user_id, date, endpoint)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
