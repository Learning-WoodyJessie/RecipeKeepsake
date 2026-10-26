-- Migration 005: refund a unit of daily quota, and lock the quota functions down.
-- Run in: Supabase dashboard -> SQL Editor -> New query.
--
-- Why: when a capture fails because of a provider problem (e.g. the AI account
-- ran out of credit) the user should not lose one of their daily captures.
--
-- Security: these functions are called only by our server (service role).
-- Left callable by everyone, anyone holding the public app key could call
-- decrement_rate_limit in a loop to reset their own quota, or burn another
-- user's. So execution is revoked from everyone except the service role.

CREATE OR REPLACE FUNCTION decrement_rate_limit(p_user_id text, p_endpoint text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rate_limits
     SET count = GREATEST(count - 1, 0)
   WHERE user_id = p_user_id
     AND date = CURRENT_DATE
     AND endpoint = p_endpoint
  RETURNING count INTO v_count;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION decrement_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION decrement_rate_limit(text, text) TO service_role;

REVOKE ALL ON FUNCTION increment_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, text) TO service_role;
