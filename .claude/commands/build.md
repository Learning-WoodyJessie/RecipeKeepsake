---
description: Execute an approved plan chunk by chunk using RED-GREEN-REFACTOR.
---

# /build

Execute the plan from `docs/plans/`. One chunk at a time. Verify before moving on.

## Setup

```bash
git status                   # clean working tree?
python -m pytest tests/ -q   # baseline must be green before first chunk
```

Read the plan file fully before starting. Note any "do NOT break" rules.

---

## Per-chunk execution

### RED — write the failing test first

Write the test exactly as specified in the plan. Run it. Confirm it fails for the right reason:

```bash
python -m pytest tests/test_<module>.py::TestClassName::test_method_name -v
```

**If the test passes immediately** — stop. You're testing existing behavior. Fix the test.
**If the test errors** — fix the syntax/import error, re-run until it fails cleanly.

### GREEN — minimal code only

Write the smallest implementation that makes the test pass. No extras. No future-proofing.

```bash
python -m pytest tests/test_<module>.py -v
```

### REFACTOR — clean up

Remove duplication. Improve names. Extract helpers. Keep tests green throughout.

```bash
python -m pytest tests/ -v   # full suite — watch for regressions
```

### COMMIT — atomic

```bash
git add <specific files — never git add .>
git commit -m "[Add] [scope]: description"
```

Then move to the next chunk.

---

## Rules for this codebase

### Python layer

**Test class/method naming — follow this exactly:**
```python
class TestFunctionName:          # class = function under test
    def test_specific_behavior(self):   # method = the scenario
        ...
```

**Don't make live API calls in tests.** Every external call must be mocked:
```python
from unittest.mock import MagicMock, patch

# LLM provider — use _provider() helper from test_planning_agent.py pattern
mock = MagicMock()
mock.generate.return_value = "NEEDS_ADJUSTMENT: no\nREASON: none\nINSTRUCTION: none\nURGENCY: normal"

# File paths — use monkeypatch + tmp_path
monkeypatch.setattr(mem, "SENT_LOG_PATH", tmp_path / "sent_log.yaml")
```

**Pure functions in router** — each routing decision is a separate private function:
```python
def _get_message_type(days_away: int) -> str:
def _get_tone(relationship: str) -> str:
def _get_channel(person: dict) -> str:
```
Test each `_get_*` function independently. The `route()` integration test comes after.

**`CLOSE_RELATIONSHIPS`** — this set lives ONLY in `router/message_router.py`.
If you're adding tone logic anywhere else, import it. Do NOT redefine it inline.

**Planning agent fast path** — notes ≤ 50 chars → skip LLM call → return `_no_adjustment()`:
```python
if not notes or len(notes.strip()) <= 50:
    return _no_adjustment()
```
Always test both the fast path and the LLM path.

**Path constants** — tools use `_ROOT / "data" / "filename.yaml"` where `_ROOT = Path(__file__).resolve().parent.parent`. Expose as module-level constants so `monkeypatch.setattr` can override them in tests.

### Warmly (Next.js)

**No unit tests for components or pages** — verification is build + manual.

Build command:
```bash
cd warmly && node_modules/.bin/next build
```
This catches TypeScript errors. Run it after every chunk that touches `warmly/`.

**API route pattern** — copy this structure exactly:
```typescript
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { field } = await req.json()
  if (!field) return NextResponse.json({ error: 'Missing field' }, { status: 400 })

  const admin = getAdmin()
  const { data, error } = await admin.from('table').select('*').eq('id', field).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ... logic ...

  return NextResponse.json({ result: data })
}
```

**iOS Safari `window.open()` rule** — the most common bug in Warmly:
```typescript
// ✅ RIGHT — synchronous on click, async work after
function handleSend() {
  const waUrl = preBuiltUrl  // generated before this click handler
  window.open(waUrl)         // MUST be first — synchronous
  fetch('/api/mark-sent', { method: 'POST', body: JSON.stringify({...}) })
    .catch(() => {})         // fire and forget — never await this
}

// ❌ WRONG — window.open() after await is blocked on iOS Safari
async function handleSend() {
  const url = await fetch('/api/generate-url')  // blocks
  window.open(url)                               // silently blocked on iOS
}
```

**Client component state pattern:**
```typescript
const [data, setData]       = useState<Type | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError]     = useState('')
```
All three states must be handled in the render.

---

## Debugging protocol

If the same chunk fails twice (same error or cycling approaches):

1. **Stop** — do not keep retrying
2. Create `docs/debug-log-<topic>.md`:
   ```
   | Attempt | What was tried | Why it failed |
   |---------|----------------|---------------|
   | 1       | ...            | ...           |
   ```
3. Read the log before every subsequent attempt
4. Delete it once resolved

This is the most important protocol. Context growth makes Claude repeat failed approaches without it.

---

## Progress tracking

- Check off each chunk in the plan file as it completes
- Log any discovered debt immediately to `docs/BUGS.md` using `/log` — don't fix it mid-chunk
- Update `PROJECT_HISTORY.md` at session end

**Next step**: All chunks done → `/audit`
