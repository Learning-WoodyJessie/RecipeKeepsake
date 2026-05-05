# Phase 1.6 — Scale Hardening Plan

```
Goal:         Fix six critical infrastructure issues so the system handles 10,000 users safely
Layer:        Multi-layer (tools/storage.py + scripts/serve.py + data/migrations/ + tests/)
Architecture: Supabase client singleton eliminates connection churn; async auth unblocks the
              event loop; local JWT verification cuts per-request latency by ~75ms; Postgres
              atomic upsert replaces broken in-memory rate limiter across all LLM endpoints;
              explicit CORS and fail-closed auth complete the hardening.
Design doc:   docs/plans/2026-05-04-scale-hardening-design.md
```

---

## Important: test migration note

Existing `tests/test_storage.py` tests patch `tools.storage.create_client` directly. After Chunk 1
introduces the module-level singleton, `create_client` is called only once at import time — patching
it at test time has no effect. All existing storage tests must switch to patching
`tools.storage._supabase` (the singleton variable) instead.

---

## Chunk 1.1 — Supabase client singleton

**Files:**
- Modify: `tools/storage.py`
- Modify: `tests/test_storage.py` (patch target migration)

### Step 1: Failing test

```python
# tests/test_storage.py — add to TestInsertRecipe (or new class)
class TestSupabaseSingleton:
    def test_client_created_once_across_calls(self, monkeypatch):
        """_client() must return the same object across multiple calls."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        import tools.storage as s
        # Reset singleton so test is isolated
        s._supabase = None
        with patch("tools.storage.create_client", return_value=MagicMock()) as mock_cc:
            c1 = s._client()
            c2 = s._client()
        assert c1 is c2
        assert mock_cc.call_count == 1
```

### Step 2: Watch it fail

```bash
python -m pytest tests/test_storage.py::TestSupabaseSingleton -v
# Expected: FAILED — create_client called 2 times, c1 is not c2
```

### Step 3: Minimal implementation

```python
# tools/storage.py — replace _client() with singleton pattern

_supabase: "Client | None" = None

def _client() -> Client:
    global _supabase
    if _supabase is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _supabase = create_client(url, key)
    return _supabase
```

Also migrate all existing storage tests to patch `tools.storage._supabase` instead of
`tools.storage.create_client`. Pattern:

```python
# Before
with patch("tools.storage.create_client", return_value=mock_client):
    result = insert_recipe(...)

# After
import tools.storage as s
monkeypatch.setattr(s, "_supabase", mock_client)
result = insert_recipe(...)
```

### Step 4: Watch it pass

```bash
python -m pytest tests/test_storage.py -v
python -m pytest tests/ -v  # full suite — must stay at 81+
```

### Step 5: Commit

```bash
git add tools/storage.py tests/test_storage.py
git commit -m "[Fix] [storage]: Supabase client singleton — one client per process, not per call"
```

---

## Chunk 1.2 — Async auth + local JWT verification

**Files:**
- Modify: `scripts/serve.py`
- Modify: `requirements.txt`

### Step 1: Failing test

```python
# tests/test_auth.py (new file)
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials


class TestRequireAuthLocalJWT:
    def test_valid_jwt_does_not_call_supabase(self, monkeypatch):
        """Happy path: valid JWT signature verified locally — no Supabase network call."""
        import jwt as pyjwt
        import time
        secret = "test-jwt-secret"
        monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "fake-anon")
        token = pyjwt.encode(
            {"sub": "user-123", "exp": int(time.time()) + 3600},
            secret,
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with patch("scripts.serve.httpx.AsyncClient") as mock_async:
            import asyncio
            from scripts.serve import require_auth
            result = asyncio.run(require_auth(creds))
        mock_async.assert_not_called()
        assert result["sub"] == "user-123"

    def test_invalid_jwt_falls_back_to_supabase(self, monkeypatch):
        """Bad signature: falls back to Supabase network call."""
        monkeypatch.setenv("SUPABASE_JWT_SECRET", "wrong-secret")
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "fake-anon")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.token.here")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "user-123"}
        async_cm = AsyncMock()
        async_cm.__aenter__.return_value.get = AsyncMock(return_value=mock_response)
        with patch("scripts.serve.httpx.AsyncClient", return_value=async_cm):
            import asyncio
            from scripts.serve import require_auth
            result = asyncio.run(require_auth(creds))
        assert result["id"] == "user-123"
```

### Step 2: Watch it fail

```bash
python -m pytest tests/test_auth.py::TestRequireAuthLocalJWT -v
# Expected: FAILED — ModuleNotFoundError: PyJWT not installed, or wrong behaviour
```

### Step 3: Minimal implementation

Add `PyJWT` to `requirements.txt`:

```
PyJWT>=2.8.0
```

Rewrite `require_auth` in `scripts/serve.py`:

```python
async def require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Validate Supabase JWT. Local PyJWT verification first; Supabase fallback on failure."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = creds.credentials
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")

    # Fast path: local JWT verification (no network call)
    if jwt_secret:
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
            return payload
        except Exception:
            pass  # Fall through to Supabase network call

    # Fallback: Supabase network call
    if not supabase_url:
        return {}  # local dev without Supabase — allow through (hardened in Chunk 1.3)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={"apikey": anon_key, "Authorization": f"Bearer {token}"},
                timeout=5,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return resp.json()
    except httpx.RequestError:
        raise HTTPException(status_code=401, detail="Could not verify session")
```

### Step 4: Watch it pass

```bash
pip install PyJWT
python -m pytest tests/test_auth.py::TestRequireAuthLocalJWT -v
python -m pytest tests/ -v  # full suite
```

### Step 5: Commit

```bash
git add scripts/serve.py requirements.txt tests/test_auth.py
git commit -m "[Fix] [serve]: async auth with local JWT verification — eliminates Supabase round-trip on happy path"
```

---

## Chunk 1.3 — Fail-closed auth + explicit CORS

**Files:**
- Modify: `scripts/serve.py`

### Step 1: Failing test

```python
# tests/test_auth.py — add to file
class TestRequireAuthFailClosed:
    def test_missing_supabase_url_in_production_raises_500(self, monkeypatch):
        """Missing SUPABASE_URL in production must raise HTTP 500, not silently pass."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        monkeypatch.setenv("ENV", "production")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any-token")
        import asyncio
        from fastapi import HTTPException
        from scripts.serve import require_auth
        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_auth(creds))
        assert exc.value.status_code == 500

    def test_missing_supabase_url_in_dev_passes_through(self, monkeypatch):
        """Missing SUPABASE_URL outside production allows through (local dev)."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
        monkeypatch.setenv("ENV", "development")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="any-token")
        import asyncio
        from scripts.serve import require_auth
        result = asyncio.run(require_auth(creds))
        assert result == {}

class TestCORSExplicit:
    def test_cors_methods_not_wildcard(self):
        """CORS allow_methods must be explicit — no wildcard."""
        from scripts.serve import app
        cors = next(m for m in app.user_middleware if "CORSMiddleware" in str(m))
        # Check the kwargs passed to CORSMiddleware
        allow_methods = cors.kwargs.get("allow_methods", ["*"])
        assert "*" not in allow_methods

    def test_cors_headers_not_wildcard(self):
        """CORS allow_headers must be explicit — no wildcard."""
        from scripts.serve import app
        cors = next(m for m in app.user_middleware if "CORSMiddleware" in str(m))
        allow_headers = cors.kwargs.get("allow_headers", ["*"])
        assert "*" not in allow_headers
```

### Step 2: Watch it fail

```bash
python -m pytest tests/test_auth.py::TestRequireAuthFailClosed tests/test_auth.py::TestCORSExplicit -v
# Expected: FAILED — missing SUPABASE_URL currently returns {} instead of 500 in production
```

### Step 3: Minimal implementation

Update the fallback section in `require_auth`:

```python
    # Fallback: Supabase network call
    if not supabase_url:
        env = os.environ.get("ENV", "production")
        if env == "production":
            raise HTTPException(status_code=500, detail="Auth not configured")
        return {}  # local dev without Supabase — allow through
```

Update CORS middleware registration:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "apikey", "X-Client-Info"],
)
```

### Step 4: Watch it pass

```bash
python -m pytest tests/test_auth.py -v
python -m pytest tests/ -v  # full suite
```

### Step 5: Commit

```bash
git add scripts/serve.py tests/test_auth.py
git commit -m "[Fix] [serve]: fail-closed auth on missing SUPABASE_URL in production; explicit CORS"
```

---

## Chunk 1.4 — Postgres rate limiting (all LLM endpoints)

**Files:**
- Create: `data/migrations/003_rate_limits.sql`
- Modify: `tools/storage.py`
- Modify: `scripts/serve.py`

### Step 1: Migration SQL

```sql
-- data/migrations/003_rate_limits.sql
-- Run in Supabase SQL editor or via psql
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id   text        NOT NULL,
  date      date        NOT NULL DEFAULT CURRENT_DATE,
  endpoint  text        NOT NULL,
  count     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, endpoint)
);
```

### Step 2: Failing test

```python
# tests/test_rate_limit.py (new file)
import pytest
from unittest.mock import MagicMock, patch
import tools.storage as s


class TestCheckRateLimitPostgres:
    def test_returns_count_after_increment(self, monkeypatch):
        """check_rate_limit_db() returns the post-increment count."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value.data = 3
        monkeypatch.setattr(s, "_supabase", mock_sb)
        result = s.check_rate_limit_db("user-123", "capture")
        assert result == 3

    def test_calls_upsert_rpc(self, monkeypatch):
        """check_rate_limit_db() calls the upsert RPC with correct args."""
        mock_sb = MagicMock()
        mock_sb.rpc.return_value.execute.return_value.data = 1
        monkeypatch.setattr(s, "_supabase", mock_sb)
        s.check_rate_limit_db("user-123", "capture")
        mock_sb.rpc.assert_called_once_with(
            "increment_rate_limit",
            {"p_user_id": "user-123", "p_endpoint": "capture"},
        )

    def test_returns_zero_on_db_failure(self, monkeypatch):
        """check_rate_limit_db() returns 0 (fail open) when DB raises."""
        mock_sb = MagicMock()
        mock_sb.rpc.side_effect = Exception("DB down")
        monkeypatch.setattr(s, "_supabase", mock_sb)
        result = s.check_rate_limit_db("user-123", "capture")
        assert result == 0


class TestRateLimitEndpoints:
    def test_capture_rate_limited_at_postgres_count(self, monkeypatch):
        """POST /capture returns 429 when Postgres count exceeds daily limit."""
        monkeypatch.setenv("MAX_CAPTURE_PER_DAY", "5")
        with patch("scripts.serve.check_rate_limit_db", return_value=6):
            from scripts.serve import _check_rate_limit_db_or_raise
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc:
                _check_rate_limit_db_or_raise("user-123", "capture", 5)
            assert exc.value.status_code == 429

    def test_translate_rate_limited(self, monkeypatch):
        """Translate endpoint also rate-limited."""
        monkeypatch.setenv("MAX_TRANSLATE_PER_DAY", "50")
        with patch("scripts.serve.check_rate_limit_db", return_value=51):
            from scripts.serve import _check_rate_limit_db_or_raise
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc:
                _check_rate_limit_db_or_raise("user-123", "translate", 50)
            assert exc.value.status_code == 429
```

Also add a Postgres function to the migration:

```sql
-- data/migrations/003_rate_limits.sql (append)
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
```

### Step 3: Watch it fail

```bash
python -m pytest tests/test_rate_limit.py -v
# Expected: FAILED — check_rate_limit_db not found in tools.storage
```

### Step 4: Minimal implementation

Add to `tools/storage.py`:

```python
def check_rate_limit_db(user_id: str, endpoint: str) -> int:
    """Atomically increment rate limit counter. Returns new count, or 0 on DB failure (fail open)."""
    try:
        sb = _client()
        result = sb.rpc(
            "increment_rate_limit",
            {"p_user_id": user_id, "p_endpoint": endpoint},
        ).execute()
        return result.data or 0
    except Exception as e:
        print(f"[storage] rate limit DB error (fail open): {e}")
        return 0
```

Add helper + env var config to `scripts/serve.py`:

```python
# Per-endpoint daily limits — configurable via env vars
_LIMITS = {
    "capture":        int(os.environ.get("MAX_CAPTURE_PER_DAY",   "10")),
    "translate":      int(os.environ.get("MAX_TRANSLATE_PER_DAY", "50")),
    "generate-image": int(os.environ.get("MAX_IMAGE_PER_DAY",     "20")),
}


def _check_rate_limit_db_or_raise(user_id: str, endpoint: str, limit: int) -> None:
    from tools.storage import check_rate_limit_db
    count = check_rate_limit_db(user_id, endpoint)
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit of {limit} {endpoint} requests reached. Try again tomorrow.",
        )
```

Replace `_check_rate_limit` calls in capture, translate, and generate-image endpoints:

```python
# In POST /capture
_check_rate_limit_db_or_raise(user["sub"], "capture", _LIMITS["capture"])

# In GET /recipe/{token}/translate
_check_rate_limit_db_or_raise(user["sub"], "translate", _LIMITS["translate"])

# In POST /generate-image
_check_rate_limit_db_or_raise(user["sub"], "generate-image", _LIMITS["generate-image"])
```

Remove old in-memory rate limit code:
- Delete `_rec_counts`, `_rec_dates`, `_check_rate_limit` function
- Delete `_MAX_RECORDINGS_PER_DAY` constant (replaced by `_LIMITS` dict)
- Remove `from collections import defaultdict` if no longer used
- Remove `from datetime import date as _date` if no longer used

### Step 5: Watch it pass

```bash
python -m pytest tests/test_rate_limit.py -v
python -m pytest tests/ -v  # full suite
```

### Step 6: Commit

```bash
git add tools/storage.py scripts/serve.py data/migrations/003_rate_limits.sql tests/test_rate_limit.py
git commit -m "[Fix] [serve]: Postgres distributed rate limiting on all LLM endpoints — replaces broken in-memory counters"
```

---

## Chunk 1.5 — RLS confirmation (manual step)

**Files:**
- Modify: `docs/BUGS.md` (close D-004)

This chunk is a manual verification step in the Supabase dashboard.

### Instructions

1. Log in to Supabase → select the project
2. Go to **Table Editor** → `recipes` table → **RLS** tab
   - Confirm "Row Level Security" is **Enabled**
   - Confirm a SELECT policy exists with definition: `(user_id)::text = (auth.uid())::text`
   - Confirm the same policy applies to INSERT, UPDATE, DELETE (or separate policies per operation)
3. Repeat for the `people` table
4. If RLS is not enabled, run in SQL editor:
   ```sql
   ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
   ALTER TABLE people ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "users_own_recipes" ON recipes
     USING ((user_id)::text = (auth.uid())::text);

   CREATE POLICY "users_own_people" ON people
     USING ((user_id)::text = (auth.uid())::text);
   ```
5. Close D-004 in `docs/BUGS.md` once confirmed

### Commit after manual confirmation

```bash
git add docs/BUGS.md
git commit -m "[Docs] [bugs]: close D-004 — RLS confirmed active on recipes and people tables"
```

---

## Chunk 1.6 — Tests: coverage verification

**Files:**
- Modify: `tests/test_auth.py` (fill any gaps)
- Modify: `tests/test_rate_limit.py` (fill any gaps)

### Verification checklist

Run the full suite and confirm:

```bash
python -m pytest tests/ -v --tb=short
```

| Test | Covers |
|---|---|
| `TestSupabaseSingleton::test_client_created_once_across_calls` | P1 — singleton |
| `TestRequireAuthLocalJWT::test_valid_jwt_does_not_call_supabase` | P2+P3 — async, local verify |
| `TestRequireAuthLocalJWT::test_invalid_jwt_falls_back_to_supabase` | P3 — fallback path |
| `TestRequireAuthFailClosed::test_missing_supabase_url_in_production_raises_500` | P4 — fail-closed |
| `TestRequireAuthFailClosed::test_missing_supabase_url_in_dev_passes_through` | P4 — dev bypass preserved |
| `TestCORSExplicit::test_cors_methods_not_wildcard` | P6 — no CORS wildcard |
| `TestCORSExplicit::test_cors_headers_not_wildcard` | P6 — no CORS wildcard |
| `TestCheckRateLimitPostgres::test_returns_count_after_increment` | P5 — Postgres counter |
| `TestCheckRateLimitPostgres::test_calls_upsert_rpc` | P5 — upsert semantics |
| `TestCheckRateLimitPostgres::test_returns_zero_on_db_failure` | P5 — fail open |
| `TestRateLimitEndpoints::test_capture_rate_limited_at_postgres_count` | P5 — capture 429 |
| `TestRateLimitEndpoints::test_translate_rate_limited` | P5 — translate 429 |

### Final commit

```bash
git add tests/
git commit -m "[Tests] [auth, rate_limit]: full coverage for Phase 1.6 hardening"
```

---

## Build order summary

| Chunk | File(s) | Problem solved |
|---|---|---|
| 1.1 | `tools/storage.py`, `tests/test_storage.py` | P1 — client connection churn |
| 1.2 | `scripts/serve.py`, `requirements.txt`, `tests/test_auth.py` | P2, P3 — blocking auth + no local verify |
| 1.3 | `scripts/serve.py`, `tests/test_auth.py` | P4, P6 — silent bypass + CORS wildcards |
| 1.4 | `tools/storage.py`, `scripts/serve.py`, `data/migrations/`, `tests/test_rate_limit.py` | P5 — broken in-memory rate limiter |
| 1.5 | Supabase dashboard + `docs/BUGS.md` | P7 — RLS unconfirmed (D-004) |
| 1.6 | `tests/` | Full coverage verification |

---

Ready to build? Use `/build`.
