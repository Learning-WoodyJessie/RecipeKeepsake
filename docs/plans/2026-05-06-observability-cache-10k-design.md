## Goal
Make the system debuggable at 10K users from Railway logs alone, and fix the translation cache so concurrent users can't silently corrupt each other's translations.

## Audience
You, operating the system — debugging production failures, tracking cache economics, clearing stale translations after prompt changes.

## Scope — what we're NOT building
- Third-party log aggregator (Datadog, Better Stack) — Railway-only, search by req ID
- Translation cache table migration (`recipe_translations` table) — logged to Phase 6.5 roadmap
- Frontend observability changes
- Log-based dashboards or alerting

---

## Architecture

**Observability**: Python `logging` module replaces all `print()` calls. A `ContextVar` threads `request_id` through the async call chain without changing function signatures. A JSON formatter on `stdout` makes every log line greppable in Railway by field value. When a capture fails, you search Railway for the `req` value from the browser error and see the full story: which stage, which exception type, how long it ran before failing.

**Cache**: Replace the read-modify-write in `cache_translation()` with a single atomic Postgres UPDATE using the `||` JSONB merge operator via an RPC function. The `||` operator merges at the top-level key level — `{"hi": ...} || {"te": ...}` = both keys present — so two concurrent writes for different languages cannot overwrite each other. One Supabase SQL setup step (create the function), one Python change.

**Cache observability**: Every translation request logs a structured `cache_hit` or `cache_miss` event. With Railway search, you can answer "how often is the cache being bypassed?" by searching `event=translation_cache_miss`.

**Admin**: `POST /admin/clear-translation-cache?lang=te` protected by `ADMIN_SECRET` env var. Enables clearing stale translations after a prompt fix without shelling into Railway.

---

## Blocks

### Block 1 — Structured logging

#### Chunk 1.1 — Logging infrastructure (`scripts/serve.py`)

**Files:**
- Modify: `scripts/serve.py`
- Create: `tests/test_structured_logging.py`

**What it does:**
Replaces scattered `print()` in `serve.py` with `logging.getLogger()` calls. A `ContextVar` is set in `_RequestIDMiddleware` so every log line in the same request automatically includes `req=xxxxxxxx`. JSON format means Railway search can find all log lines for a request by grepping the ID.

**Log format on stdout:**
```
{"ts": "2026-05-06T10:23:41Z", "level": "INFO",  "req": "a3f9c1d2", "event": "capture_start",    "file": "pesarattu.m4a"}
{"ts": "2026-05-06T10:23:44Z", "level": "INFO",  "req": "a3f9c1d2", "event": "capture_saved",    "id": "uuid-123", "dish": "Pesarattu"}
{"ts": "2026-05-06T10:23:41Z", "level": "ERROR", "req": "b7e2a1f9", "event": "capture_failed",   "stage": "structure", "error": "JSONDecodeError", "msg": "Expecting value: line 1"}
```

**Implementation:**

```python
# scripts/serve.py — add near top, after imports
import logging
import contextvars
import json as _json_stdlib
from datetime import datetime, timezone

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return _json_stdlib.dumps({
            "ts":    datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "level": record.levelname,
            "req":   _request_id.get("-"),
            "event": record.getMessage(),
        }, ensure_ascii=False)


def _setup_logging() -> logging.Logger:
    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    logger = logging.getLogger("serve")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    return logger


_logger = _setup_logging()
```

Update `_RequestIDMiddleware.dispatch` to also set the ContextVar:
```python
async def dispatch(self, request, call_next):
    request_id = uuid.uuid4().hex[:8]
    request.state.request_id = request_id
    _request_id.set(request_id)          # thread through ContextVar
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

Replace all `print(f"[serve/...]")` with structured logger calls:

| Old | New |
|---|---|
| `print(f"[serve/capture] Processing {audio.filename}...")` | `_logger.info(f"event=capture_start file={audio.filename}")` |
| `print(f"[serve/capture] Saved: {saved.id}")` | `_logger.info(f"event=capture_saved id={saved.id} dish={recipe_data.dish_name}")` |
| `print(f"[serve/capture] No Supabase env — skipping storage")` | `_logger.warning("event=capture_no_db")` |
| `print(f"[serve/capture] ERROR: {e}")` | `_logger.error(f"event=capture_failed stage=persist error={type(e).__name__} msg={e}")` |
| `print(f"[serve/process] Processing {audio.filename}...")` | `_logger.info(f"event=process_start file={audio.filename}")` |
| `print(f"[serve/process] Done: {recipe_data.dish_name}")` | `_logger.info(f"event=process_done dish={recipe_data.dish_name}")` |
| `print(f"[serve/process] ERROR: {e}")` | `_logger.error(f"event=process_failed error={type(e).__name__} msg={e}")` |
| `print(f"[serve/save] Saved: {saved.id}")` | `_logger.info(f"event=save_done id={saved.id}")` |
| `print(f"[serve/save] ERROR: {e}")` | `_logger.error(f"event=save_failed error={type(e).__name__} msg={e}")` |
| `print(f"[serve] Image generation failed (non-fatal): {e}")` | `_logger.warning(f"event=image_failed error={type(e).__name__} msg={e}")` |
| `print(f"[translate] Cache read failed (non-fatal): {e}")` | `_logger.warning(f"event=translation_cache_read_error error={type(e).__name__} msg={e}")` |
| `print(f"[translate] LLM error ({type(e).__name__}): {e}")` | `_logger.error(f"event=translation_llm_error error={type(e).__name__} msg={e}")` |
| `print(f"[translate] Cache write failed (non-fatal): {e}")` | `_logger.warning(f"event=translation_cache_write_error error={type(e).__name__} msg={e}")` |

**Failing test:**
```python
# tests/test_structured_logging.py
import json, logging
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from scripts.serve import app

class TestStructuredLogging:
    def test_capture_start_logged_as_json(self, caplog):
        """A failed /capture/process logs a JSON line with event and req fields."""
        with caplog.at_level(logging.INFO, logger="serve"):
            with patch("scripts.serve.run_transcribe", side_effect=Exception("boom")):
                client = TestClient(app)
                import io
                data = {"audio": ("test.m4a", io.BytesIO(b"fake"), "audio/mp4")}
                client.post("/capture/process", files=data)
        events = [r.getMessage() for r in caplog.records if "serve" in r.name]
        assert any("event=process_start" in e for e in events)
        assert any("event=process_failed" in e for e in events)
        assert any("error=Exception" in e for e in events)
```

**Verify:** `python -m pytest tests/test_structured_logging.py -v` green. Full suite green.

---

#### Chunk 1.2 — Structured logging in pipeline/ and tools/storage.py

**Files:**
- Modify: `pipeline/transcribe.py`
- Modify: `pipeline/transform.py`
- Modify: `pipeline/persist.py`
- Modify: `tools/storage.py`

**What it does:**
Replaces `print()` in pipeline stages and storage with `logging.getLogger(__name__)`. Since `_request_id` ContextVar is set in the middleware before any pipeline call, these log lines automatically carry the request ID in Railway logs even though the pipeline modules don't import it directly.

```python
# Each module: replace print() with:
import logging
_logger = logging.getLogger(__name__)

# pipeline/transcribe.py
_logger.info(f"event=transcribe_done duration={time.perf_counter()-t0:.2f}s")
_logger.info(f"event=translate_done duration={time.perf_counter()-t1:.2f}s")

# pipeline/persist.py
_logger.warning(f"event=audio_upload_failed error={type(e).__name__} msg={e}")

# tools/storage.py
_logger.warning(f"event=rate_limit_db_error error={type(e).__name__} msg={e}")
_logger.warning(f"event=delete_account_audio_failed error={type(e).__name__} msg={e}")
_logger.error(f"event=delete_account_recipes_failed error={type(e).__name__} msg={e}")
```

Note: the `_JSONFormatter` is registered on the root `"serve"` logger in serve.py. Pipeline and storage loggers are children of the root and inherit the handler. No separate formatter setup needed in each module.

**Verify:** `python -m pytest tests/ -q` — no new tests needed, existing tests must stay green. Confirm `print()` is gone from all modified files:
```bash
grep -rn "^    print\|^print" pipeline/ tools/storage.py
# Should return empty
```

---

#### Chunk 1.3 — DALL-E timing + 4xx/5xx status logging

**Files:**
- Modify: `scripts/serve.py`

**What it does:**

Two additions to `serve.py` that close the remaining observability blind spots:

**1. DALL-E stage timing** — `_generate_image()` currently swallows its own duration. Add `time.perf_counter()` around the DALL-E + store calls and log structured events:

```python
import time

def _generate_image(dish_name, ingredients=None, steps=None, cook_notes=None) -> str:
    try:
        from prompts.image import generate_dish_image
        from tools.storage import store_image
        t0 = time.perf_counter()
        raw_url = generate_dish_image(dish_name or "Indian dish", ...)
        if raw_url and os.environ.get("SUPABASE_URL"):
            result = store_image(raw_url)
        else:
            result = raw_url or ""
        _logger.info(f"event=image_done duration={time.perf_counter()-t0:.2f}s")
        return result
    except Exception as e:
        _logger.warning(f"event=image_failed error={type(e).__name__} msg={e}")
        return ""
```

**2. 4xx/5xx request logging** — `_RequestIDMiddleware` already has the response. Add a log line for non-2xx responses so Railway search can answer "how many errors in the last hour?":

```python
class _RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:8]
        request.state.request_id = request_id
        _request_id.set(request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if response.status_code >= 400:
            _logger.warning(
                f"event=request_error status={response.status_code} "
                f"method={request.method} path={request.url.path}"
            )
        return response
```

Railway search: `event=request_error status=500` shows all 500s; `status=429` shows rate-limit pressure.

**Failing test:**
```python
# tests/test_structured_logging.py — add to file
class TestRequestErrorLogging:
    def test_4xx_logs_request_error_event(self, caplog):
        """Requests to unknown routes log event=request_error with status=404."""
        with caplog.at_level(logging.WARNING, logger="serve"):
            client = TestClient(app)
            client.get("/nonexistent-endpoint-xyz")
        messages = [r.getMessage() for r in caplog.records if r.name == "serve"]
        assert any("event=request_error" in m and "status=404" in m for m in messages)
```

**Verify:** `python -m pytest tests/test_structured_logging.py -v` green. Full suite green.

---

#### Chunk 1.4 — Frontend error reporting endpoint

**Files:**
- Modify: `scripts/serve.py` — add `POST /client-error`
- Modify: `frontend/components/ErrorBoundary.tsx` — POST to endpoint in `componentDidCatch`
- Modify: `tests/test_health.py` — add client error endpoint test

**What it does:**
`console.error` in `ErrorBoundary.componentDidCatch` is invisible unless the browser is open. At 10K users, silent client-side crashes are undetectable. A lightweight `/client-error` endpoint accepts `{error, componentStack, url}` from the browser and logs it as a structured JSON line in Railway — no third-party service needed.

**Endpoint (serve.py):**
```python
class ClientErrorRequest(BaseModel):
    error: str
    component_stack: str = ""
    url: str = ""

@app.post("/client-error")
async def client_error_endpoint(body: ClientErrorRequest):
    """Receive frontend error reports and log them to Railway stdout."""
    _logger.error(
        f"event=client_error error={body.error!r} "
        f"url={body.url!r} component_stack={body.component_stack!r}"
    )
    return {"ok": True}
```

No auth required — this endpoint is fire-and-forget from the browser. Error content is logged, not stored.

**ErrorBoundary update (frontend/components/ErrorBoundary.tsx):**
```typescript
componentDidCatch(error: Error, info: React.ErrorInfo) {
  console.error('[ErrorBoundary]', error.message, info.componentStack)
  // Report to Railway logs — fire and forget, never block render
  fetch('/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: error.message,
      component_stack: info.componentStack ?? '',
      url: typeof window !== 'undefined' ? window.location.href : '',
    }),
  }).catch(() => {})
}
```

**Failing test:**
```python
# tests/test_health.py — add to file
class TestClientErrorEndpoint:
    def test_logs_client_error_and_returns_ok(self, caplog):
        """POST /client-error logs event=client_error and returns {ok: true}."""
        with caplog.at_level(logging.ERROR, logger="serve"):
            response = TestClient(app).post(
                "/client-error",
                json={"error": "Cannot read properties of null", "url": "/memories"},
            )
        assert response.status_code == 200
        assert response.json()["ok"] is True
        messages = [r.getMessage() for r in caplog.records if r.name == "serve"]
        assert any("event=client_error" in m for m in messages)
```

**Verify:** `python -m pytest tests/test_health.py -v` green. Full suite green.

---

### Block 2 — Cache correctness + observability

#### Chunk 2.1 — Atomic JSONB update (Postgres RPC)

**Files:**
- Supabase SQL editor: create function (one-time setup — documented below)
- Modify: `tools/storage.py` — `cache_translation()`
- Modify: `tests/test_storage_translations.py`

**Supabase setup (run once in SQL editor):**
```sql
CREATE OR REPLACE FUNCTION set_recipe_translation(
  p_token text,
  p_lang  text,
  p_data  jsonb
) RETURNS void
LANGUAGE sql AS $$
  UPDATE recipes
  SET translations = COALESCE(translations, '{}'::jsonb) || jsonb_build_object(p_lang, p_data)
  WHERE token = p_token;
$$;
```

The `||` operator is a single atomic UPDATE — no read-modify-write, no race condition. Two concurrent calls for `te` and `hi` on the same recipe both succeed and both keys are preserved.

**Python change:**
```python
# tools/storage.py — replace cache_translation()
def cache_translation(token: str, lang: str, data: dict) -> None:
    """Atomically set one language in the recipe translations JSONB."""
    import json
    _client().rpc(
        "set_recipe_translation",
        {"p_token": token, "p_lang": lang, "p_data": data},
    ).execute()
```

**Failing test:**
```python
# tests/test_storage_translations.py — add to existing class
def test_cache_translation_uses_rpc(self, monkeypatch):
    """cache_translation() calls set_recipe_translation RPC, not table read-modify-write."""
    import tools.storage as s
    mock_sb = MagicMock()
    monkeypatch.setattr(s, "_supabase", mock_sb)
    s.cache_translation("tok-abc", "te", {"dish_name": "పెసరట్టు"})
    mock_sb.rpc.assert_called_once_with(
        "set_recipe_translation",
        {"p_token": "tok-abc", "p_lang": "te", "p_data": {"dish_name": "పెసరట్టు"}},
    )
    # Confirm old read-modify-write pattern is NOT called
    mock_sb.table.assert_not_called()
```

**Verify:** `python -m pytest tests/test_storage_translations.py -v` green. Full suite green.

---

#### Chunk 2.2 — Cache hit/miss structured events

**Files:**
- Modify: `scripts/serve.py` — `translate_recipe_endpoint()`

**What it does:**
Adds two log events to the translation endpoint so Railway search can answer "how often is the cache being bypassed?":

```python
# Cache hit:
_logger.info(f"event=translation_cache_hit lang={lang} token={token}")

# Cache miss (going to LLM):
_logger.info(f"event=translation_cache_miss lang={lang} token={token}")

# LLM success (with duration):
_logger.info(f"event=translation_llm_done lang={lang} duration={duration:.2f}s")
```

With Railway search: grep `event=translation_cache_miss` to see miss volume; grep `event=translation_llm_done` to see LLM call frequency and cost exposure.

**Test: covered by Chunk 1.1 test infrastructure** — no separate test file needed.

---

#### Chunk 2.3 — Admin cache-clear endpoint

**Files:**
- Modify: `scripts/serve.py`
- Modify: `tests/test_health.py` (add admin endpoint tests)

**What it does:**
`POST /admin/clear-translation-cache?lang=te&secret=xxx` — clears all cached translations for one language across all recipes. Protected by `ADMIN_SECRET` env var (not user JWT — this is an operator action). Returns count of rows cleared.

**Failing test:**
```python
# tests/test_health.py — add to file (admin endpoint tests alongside health)
class TestAdminClearCache:
    def test_rejects_wrong_secret(self):
        """POST /admin/clear-translation-cache returns 403 with wrong secret."""
        with patch.dict(os.environ, {"ADMIN_SECRET": "correct-secret"}):
            response = TestClient(app).post(
                "/admin/clear-translation-cache?lang=te&secret=wrong"
            )
        assert response.status_code == 403

    def test_clears_cache_with_correct_secret(self):
        """POST /admin/clear-translation-cache calls clear_translation_cache and returns count."""
        with patch.dict(os.environ, {"ADMIN_SECRET": "correct-secret"}), \
             patch("tools.storage.clear_translation_cache", return_value=7) as mock_clear:
            response = TestClient(app).post(
                "/admin/clear-translation-cache?lang=te&secret=correct-secret"
            )
        assert response.status_code == 200
        assert response.json()["cleared"] == 7
        mock_clear.assert_called_once_with("te")

    def test_missing_secret_env_returns_503(self):
        """POST /admin/clear-translation-cache returns 503 if ADMIN_SECRET not configured."""
        with patch.dict(os.environ, {}, clear=True):
            response = TestClient(app).post(
                "/admin/clear-translation-cache?lang=te&secret=anything"
            )
        assert response.status_code == 503
```

**Implementation:**
```python
@app.post("/admin/clear-translation-cache")
async def admin_clear_translation_cache(lang: str, secret: str):
    admin_secret = os.environ.get("ADMIN_SECRET")
    if not admin_secret:
        raise HTTPException(status_code=503, detail="ADMIN_SECRET not configured")
    if secret != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    from tools.storage import clear_translation_cache
    cleared = clear_translation_cache(lang)
    _logger.info(f"event=cache_cleared lang={lang} rows={cleared}")
    return {"cleared": cleared, "lang": lang}
```

**Verify:** `python -m pytest tests/test_health.py -v` green. Full suite green.

---

## Supabase setup required before Chunk 2.1

Run this once in the Supabase SQL editor for the production project:
```sql
CREATE OR REPLACE FUNCTION set_recipe_translation(
  p_token text,
  p_lang  text,
  p_data  jsonb
) RETURNS void
LANGUAGE sql AS $$
  UPDATE recipes
  SET translations = COALESCE(translations, '{}'::jsonb) || jsonb_build_object(p_lang, p_data)
  WHERE token = p_token;
$$;
```

No table schema changes. No data migration.

---

## Success Criteria

| Item | Observable outcome |
|---|---|
| Structured logging | Every log line in Railway is valid JSON with `req`, `level`, `event` fields |
| Request correlation | Search Railway for any `req=xxxxxxxx` from a browser error → see all backend log lines for that request |
| Stage-level errors | `event=process_failed stage=structure error=JSONDecodeError` distinguishes pipeline failures from storage failures |
| DALL-E timing | `event=image_done duration=4.2s` visible in Railway per capture request |
| 4xx/5xx visibility | `grep event=request_error status=500` shows all server errors; `status=429` shows rate-limit pressure |
| Frontend errors | `grep event=client_error` in Railway shows silent client crashes including componentStack |
| Cache hit/miss | `grep event=translation_cache_miss` in Railway shows miss volume |
| Race condition fixed | Two concurrent translation requests for different languages on same recipe both succeed |
| Admin clear cache | `curl -X POST /admin/clear-translation-cache?lang=te&secret=xxx` returns `{"cleared": N}` |

## New env var required
| Var | Where to add |
|---|---|
| `ADMIN_SECRET` | Railway env vars + `CLAUDE.md` secrets table |

## Decisions
```
[2026-05-06] [Observability] — Decision: Python logging + ContextVar, Railway-only. Rejected: Better Stack / Datadog. Because: Railway search covers single-incident debugging; no log aggregator cost or setup burden at current scale.
[2026-05-06] [Cache] — Decision: Atomic JSONB via Postgres RPC function. Rejected: recipe_translations table (logged to Phase 6.5 roadmap). Because: fixes race condition without schema migration; table refactor deferred to when cache queryability is needed.
[2026-05-06] [Frontend errors] — Decision: /client-error endpoint + Railway logs. Rejected: Sentry/third-party. Because: Railway-only constraint; no additional service cost; sufficient for identifying crash patterns at 10K scale.
```
