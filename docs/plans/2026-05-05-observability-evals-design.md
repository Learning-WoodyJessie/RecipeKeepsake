## Goal
Add end-to-end observability (P0 + P1) and a Tier 1 eval harness so errors are visible, pipeline stages are measurable, and the core quality invariant (vague measurements never normalized) is machine-verified.

## Audience
You, operating the system — debugging production failures, monitoring capture quality, and catching model regressions before users see them.

## Scope — what we're NOT building
- Structured logging / log drain (D-011 / P2) — deferred, large refactor, low immediate payoff
- Golden audio fixture set (Eval Tier 2) — requires recording real audio; manual task outside this sprint
- LLM-as-judge harness (Eval Tier 3) — deferred until golden fixtures exist
- External error reporting service (Sentry, Datadog) — not needed at current scale
- Alert thresholds or dashboards

---

## Chunks

### Block 1 — Observability P0

#### Chunk 1.1 — React ErrorBoundary

**Files:**
- Create: `frontend/components/ErrorBoundary.tsx`
- Modify: `frontend/app/layout.tsx`

**What it does:** React class component wrapping the entire app. Catches unhandled render errors (currently produce a blank white screen), renders a styled fallback, and logs to console with enough context to diagnose.

**Failing test:** No unit test (Next.js components, build verification only).

**Implementation:**
```tsx
// frontend/components/ErrorBoundary.tsx
'use client'
import React from 'react'

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0A0A18', color: '#e8e0d4', fontFamily: 'Georgia, serif',
          padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏡</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong.</h2>
          <p style={{ opacity: 0.6, marginBottom: '1.5rem' }}>
            Please refresh the page. If this keeps happening, try signing out and back in.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#A78BFA', color: '#0A0A18', border: 'none',
              borderRadius: '8px', padding: '0.6rem 1.4rem',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Refresh
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

```tsx
// frontend/app/layout.tsx — wrap body children
import { ErrorBoundary } from '@/components/ErrorBoundary'
// ...
<body><ErrorBoundary>{children}</ErrorBoundary></body>
```

**Verify:** `cd frontend && node_modules/.bin/next build` — must exit 0.

---

#### Chunk 1.2 — Request correlation IDs

**Files:**
- Modify: `scripts/serve.py` (add middleware, update allowed headers)
- Modify: `frontend/lib/api.ts` (forward ID in error message)
- Create: `tests/test_request_id.py`

**What it does:** FastAPI middleware generates a UUID4 short ID per request, attaches it to the response as `X-Request-ID`. Frontend `authFetch` reads the header and appends it to thrown errors so a frontend console error can be matched to a backend log line.

**Failing test:**
```python
# tests/test_request_id.py
from fastapi.testclient import TestClient
from scripts.serve import app

class TestRequestIDMiddleware:
    def test_response_has_x_request_id_header(self):
        """Every response carries X-Request-ID."""
        client = TestClient(app)
        response = client.get("/health")
        assert "x-request-id" in response.headers

    def test_request_id_is_8_char_hex(self):
        """X-Request-ID is an 8-character hex string."""
        client = TestClient(app)
        response = client.get("/health")
        rid = response.headers["x-request-id"]
        assert len(rid) == 8
        assert all(c in "0123456789abcdef" for c in rid)
```

**Implementation:**
```python
# scripts/serve.py — add after imports, before app = FastAPI()
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class _RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex[:8]
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

# register before CORSMiddleware (order matters — outermost first)
app.add_middleware(_RequestIDMiddleware)
```

Add `"X-Request-ID"` to `allow_headers` in the existing CORSMiddleware call.

```typescript
// frontend/lib/api.ts — update authFetch error throw
const requestId = res.headers.get('x-request-id')
const err = await res.json().catch(() => ({ detail: 'Request failed' }))
const suffix = requestId ? ` [req:${requestId}]` : ''
throw new Error(`${err.detail ?? 'Request failed'}${suffix}`)
```

**Verify:** `python -m pytest tests/test_request_id.py -v` green. Then `cd frontend && node_modules/.bin/next build`.

---

### Block 2 — Observability P1

#### Chunk 2.1 — Pipeline stage timing

**Files:**
- Modify: `pipeline/transcribe.py`
- Modify: `pipeline/transform.py`
- Create: `tests/test_pipeline_timing.py`

**What it does:** Wraps each pipeline stage call with `time.perf_counter()` and prints a structured timing line: `[pipeline] stage=transcribe duration=2.31s`. No new dependency — stdlib only.

**Failing test:**
```python
# tests/test_pipeline_timing.py
import re
from unittest.mock import patch, MagicMock, mock_open
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult

class TestPipelineTiming:
    def test_transcribe_logs_stage_duration(self, capsys):
        """run_transcribe() prints a timing line for transcribe and translate stages."""
        mock_tr = MagicMock(); mock_tr.text = "raw"
        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio")), \
             patch("pipeline.transcribe.translate_to_english", return_value="eng"):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
            run_transcribe("test.m4a", provider=MagicMock(generate=MagicMock(return_value="eng")))
        out = capsys.readouterr().out
        assert re.search(r"\[pipeline\] stage=transcribe duration=\d+\.\d+s", out)
        assert re.search(r"\[pipeline\] stage=translate duration=\d+\.\d+s", out)

    def test_transform_logs_stage_duration(self, capsys):
        """run_transform() prints a timing line for the structure stage."""
        transcript = TranscriptResult(raw="raw", english="eng")
        with patch("pipeline.transform.structure_recipe", return_value={
            "dish_name": "X", "ingredients": [], "steps": [], "cook_notes": "", "review_flags": []
        }):
            run_transform(transcript, provider=MagicMock())
        out = capsys.readouterr().out
        assert re.search(r"\[pipeline\] stage=structure duration=\d+\.\d+s", out)
```

**Implementation:**
```python
# pipeline/transcribe.py — add timing
import time

def run_transcribe(...):
    ...
    t0 = time.perf_counter()
    raw = transcribe_audio(audio_path)
    print(f"[pipeline] stage=transcribe duration={time.perf_counter()-t0:.2f}s")

    t1 = time.perf_counter()
    english = translate_to_english(raw, provider)
    print(f"[pipeline] stage=translate duration={time.perf_counter()-t1:.2f}s")
    ...

# pipeline/transform.py — add timing
import time

def run_transform(...):
    ...
    t0 = time.perf_counter()
    structured = structure_recipe(transcript.english, provider)
    print(f"[pipeline] stage=structure duration={time.perf_counter()-t0:.2f}s")
    ...
```

**Verify:** `python -m pytest tests/test_pipeline_timing.py -v` green. Then `python -m pytest tests/ -v` — full suite must stay green.

---

#### Chunk 2.2 — Real health endpoint

**Files:**
- Modify: `scripts/serve.py` (replace or add `/health` route)
- Modify: `tests/test_request_id.py` (the existing `/health` GET used there now needs to exist)

**What it does:** `GET /health` performs a lightweight Supabase connectivity probe (`SELECT id FROM recipes LIMIT 1`). Returns `{"status": "ok", "db": "ok", "version": "1"}` on success or HTTP 503 + reason on failure. No auth required — Railway uses this for health checks.

**Failing test:**
```python
# tests/test_health.py
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from scripts.serve import app

class TestHealthEndpoint:
    def test_returns_ok_when_db_reachable(self):
        """GET /health returns 200 + {"status": "ok"} when Supabase is reachable."""
        mock_result = MagicMock()
        mock_result.data = [{"id": "abc"}]
        with patch("scripts.serve._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.return_value = mock_result
            client = TestClient(app)
            response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["db"] == "ok"

    def test_returns_503_when_db_unreachable(self):
        """GET /health returns 503 when Supabase raises an exception."""
        with patch("scripts.serve._client") as mock_client:
            mock_client.return_value.table.return_value.select.return_value \
                .limit.return_value.execute.side_effect = Exception("connection refused")
            client = TestClient(app)
            response = client.get("/health")
        assert response.status_code == 503
        assert response.json()["status"] == "degraded"
```

**Implementation:**
```python
# scripts/serve.py
@app.get("/health")
async def health():
    try:
        _client().table("recipes").select("id").limit(1).execute()
        return {"status": "ok", "db": "ok", "version": "1"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": str(e)},
        )
```

**Verify:** `python -m pytest tests/test_health.py tests/test_request_id.py -v` green. Full suite green.

---

### Block 3 — Model config split

#### Chunk 3.1 — Per-stage model config

**Files:**
- Modify: `data/config.yaml`
- Modify: `pipeline/transcribe.py`
- Modify: `pipeline/transform.py`
- Modify: `tests/test_pipeline_stages.py` (update `load_config` mock to new shape)

**What it does:** Adds `translate_model` and `structure_model` keys to `config.yaml`. Pipeline stages read their own model key. Falls back to `model` for backward compatibility. Moves Call B default to `gpt-4o-mini` — the lowest-risk swap since structuring is a schema-fill task, not open-ended reasoning.

**Failing test:**
```python
# tests/test_pipeline_stages.py — add to TestRunTranscribe
def test_uses_translate_model_from_config(self):
    """run_transcribe() picks translate_model over generic model when both present."""
    mock_tr = MagicMock(); mock_tr.text = "raw"
    with patch("tools.transcribe.OpenAI") as mock_openai, \
         patch("builtins.open", mock_open(read_data=b"audio")), \
         patch("pipeline.transcribe.translate_to_english", return_value="eng"), \
         patch("pipeline.transcribe.load_config", return_value={
             "llm": {"model": "gpt-4o", "translate_model": "gpt-4o-mini"}
         }), \
         patch("pipeline.transcribe.OpenAIProvider") as mock_prov_cls:
        mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
        mock_prov_cls.return_value = MagicMock(generate=MagicMock(return_value="eng"))
        run_transcribe("test.m4a")
        call_kwargs = mock_prov_cls.call_args[1]
    assert call_kwargs["model"] == "gpt-4o-mini"

# add to TestRunTransform
def test_uses_structure_model_from_config(self):
    """run_transform() picks structure_model over generic model when both present."""
    transcript = TranscriptResult(raw="r", english="e")
    with patch("pipeline.transform.structure_recipe", return_value={
             "dish_name": "X", "ingredients": [], "steps": [], "cook_notes": "", "review_flags": []
         }), \
         patch("pipeline.transform.load_config", return_value={
             "llm": {"model": "gpt-4o", "structure_model": "gpt-4o-mini"}
         }), \
         patch("pipeline.transform.OpenAIProvider") as mock_prov_cls:
        mock_prov_cls.return_value = MagicMock()
        run_transform(transcript)
        call_kwargs = mock_prov_cls.call_args[1]
    assert call_kwargs["model"] == "gpt-4o-mini"
```

**Implementation:**
```yaml
# data/config.yaml
llm:
  provider: openai
  model: gpt-4o              # fallback — used if stage-specific key absent
  translate_model: gpt-4o    # Call A: faithful translation — keep full model
  structure_model: gpt-4o-mini  # Call B: schema fill — mini is sufficient

whisper:
  model: gpt-4o-transcribe
  language: te
```

```python
# pipeline/transcribe.py
config = load_config()
model = config["llm"].get("translate_model", config["llm"]["model"])
provider = OpenAIProvider(model=model)

# pipeline/transform.py
config = load_config()
model = config["llm"].get("structure_model", config["llm"]["model"])
provider = OpenAIProvider(model=model)
```

**Verify:** `python -m pytest tests/test_pipeline_stages.py -v` green. Full suite green.

---

### Block 4 — Evals Tier 1

#### Chunk 4.1 — Vague-placement CI eval

**Files:**
- Create: `tests/evals/__init__.py`
- Create: `tests/evals/test_vague_placement.py`
- Create: `pytest.ini` (register `evals` marker)

**What it does:** Parametrized tests that call the real `structure_recipe()` with a real `OpenAIProvider`. Assert that vague terms ("a little", "to taste", "enough", "until it smells right") end up in `cook_notes` and never in `ingredients[*].quantity`. Gated behind `@pytest.mark.evals` — not in the default `pytest tests/` run. Run with `pytest tests/evals/ -m evals`.

**These tests make real OpenAI API calls.** They are not mocked. They run nightly or pre-release, not on every commit.

**Implementation:**
```ini
# pytest.ini
[pytest]
markers =
    evals: live-model tests that call real OpenAI APIs (deselected by default)
```

```python
# tests/evals/test_vague_placement.py
import os
import pytest
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider

pytestmark = pytest.mark.evals  # entire file is evals-gated

@pytest.fixture(scope="module")
def provider():
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set — skipping live eval")
    return OpenAIProvider(model="gpt-4o-mini")  # use structure model

@pytest.mark.parametrize("narration,vague_terms,forbidden_in_quantity", [
    (
        "Add a little oil and fry until it smells right.",
        ["a little", "until it smells right"],
        ["a little", "until it smells right", "1 tsp", "1 tbsp"],
    ),
    (
        "Cook with enough water to just cover the dal.",
        ["enough"],
        ["enough", "1 cup", "2 cups"],
    ),
    (
        "Season to taste with salt and chili.",
        ["to taste"],
        ["to taste", "1 tsp"],
    ),
    (
        "Add konjam tamarind — not too much, just enough to balance.",
        ["enough"],
        ["1 tsp", "1 tbsp", "enough"],
    ),
])
def test_vague_terms_in_cook_notes_not_ingredients(
    provider, narration, vague_terms, forbidden_in_quantity
):
    result = structure_recipe(narration, provider)
    quantities = [str(i.get("quantity", "")).lower() for i in result.get("ingredients", [])]
    cook_notes = result.get("cook_notes", "").lower()

    for term in vague_terms:
        assert term.lower() in cook_notes, (
            f"'{term}' missing from cook_notes.\n"
            f"cook_notes={result.get('cook_notes')!r}\n"
            f"ingredients={result.get('ingredients')}"
        )
    for forbidden in forbidden_in_quantity:
        assert not any(forbidden.lower() in q for q in quantities), (
            f"'{forbidden}' found in ingredients.quantity — should be in cook_notes.\n"
            f"ingredients={result.get('ingredients')}"
        )
```

**Verify:**
```bash
# Default run — evals NOT included (no real API calls, stays fast)
python -m pytest tests/ -v                        # should be 97+ tests, all green

# Explicit eval run — needs OPENAI_API_KEY
python -m pytest tests/evals/ -m evals -v         # 4 parametrized cases, real model
```

---

## Success Criteria

| Item | Observable outcome |
|---|---|
| ErrorBoundary | Throwing in a React component renders the fallback, not a blank screen |
| Request IDs | Every API error in the browser console includes `[req:xxxxxxxx]` |
| Pipeline timing | Every capture prints `[pipeline] stage=... duration=...s` lines in Railway logs |
| Health endpoint | `GET /health` returns 200 normally; returns 503 if DB is unreachable |
| Eval Tier 1 | `pytest tests/evals/ -m evals` passes 4/4 cases against the real model |
| Model config split | `structure_model: gpt-4o-mini` in config, Call B confirmed cheaper per capture |

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| ErrorBoundary catches error during SSR hydration | Falls back to client-only render; boundary catches on hydration mismatch |
| X-Request-ID missing from old response (backward compat) | `authFetch` omits suffix gracefully — `requestId` is null, error message unchanged |
| Health check itself is slow | No timeout on probe query — acceptable, Railway has its own health check timeout (30s) |
| Supabase probe in health hits RLS | Health uses service role key (`_client()`) — RLS is bypassed, returns rows |
| Eval test run without OPENAI_API_KEY | `pytest.skip()` fires — test is skipped, not failed |
| gpt-4o-mini normalizes a vague term | Eval test fails with clear message showing what ended up in ingredients.quantity |

## Decisions

```
[2026-05-05] [Observability] — Decision: P2 structured logging deferred. Rejected: replacing all print() with structlog now. Because: large refactor, low immediate payoff — P0/P1 provide the most value per line of code.
[2026-05-05] [Evals] — Decision: Eval Tier 2 (golden audio fixtures) is a manual task outside this sprint. Rejected: automating audio fixture recording. Because: requires real recordings with known content — cannot be synthesized.
[2026-05-05] [Model] — Decision: structure_model = gpt-4o-mini; translate_model stays gpt-4o. Rejected: mini for both. Because: Call A (translation) is linguistically nuanced — Telugu code-switching and vague-term preservation benefit from the larger model. Call B is schema-fill — mini is sufficient and ~20x cheaper per call.
```
