---
description: Break an approved design into TDD-first, bite-sized implementation chunks.
---

# /plan

Use after a design (PRD) is approved. Produces a plan file that `/build` executes chunk by chunk.

## Before writing a single chunk

### Python layer checklist
- [ ] Read 1-2 existing files in the same category (e.g. `tools/calendar.py`, `tests/test_calendar.py`)
- [ ] Confirm the test class naming convention: `class Test<FunctionName>:` with `def test_<specific_behaviour>(self):`
- [ ] Identify the mock strategy: `MagicMock()` for LLM providers, `monkeypatch.setattr` for path constants, `tmp_path` for filesystem
- [ ] Reuse check: does an existing function in `tools/` cover ≥80%? If yes, call it. State "No existing equivalent found" explicitly if the search came up empty.
- [ ] `CLOSE_RELATIONSHIPS` check: if the feature uses tone/relationship logic, it MUST import from `router/message_router.py` — do NOT redefine inline (see D-003 in BUGS.md)

### Warmly UI checklist
- [ ] Does the Supabase column this feature reads actually exist? Run a quick Supabase query to confirm.
- [ ] Same `CLOSE_RELATIONSHIPS` logic used in `warmly/app/api/generate/route.ts` — update there too if adding relationships
- [ ] Error handling pattern: `if (!res.ok || json.error) { setError(json.error ?? 'fallback'); ... return }`
- [ ] iOS Safari: if this opens WhatsApp, pre-generate the URL before the click handler — no `await` before `window.open()`
- [ ] Build: `cd warmly && node_modules/.bin/next build` — must pass before merge (TypeScript errors fail Vercel silently)

---

## Terminology

**Block** — logical grouping (e.g. "Python tool", "Router update", "Warmly UI"). Not "phase".
**Chunk** — one RED-GREEN-REFACTOR-COMMIT cycle. Should take 2-5 minutes.

---

## Plan structure

### Header
```
Goal:         [one sentence]
Layer:        [Python tools | Router | Prompts | Warmly | Multi-layer]
Architecture: [2-3 sentences — approach and why]
Design doc:   docs/plans/YYYY-MM-DD-<topic>-design.md
```

### For each Chunk

```markdown
#### Chunk N.N — [name]

Files:
- Create: `tools/new_tool.py`
- Modify: `router/message_router.py:L12-20`

**Step 1: Failing test**
```python
# tests/test_new_tool.py
class TestNewFunction:
    def test_returns_expected_value(self):
        result = new_function("input")
        assert result == "expected"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_new_tool.py::TestNewFunction::test_returns_expected_value -v
# Expected: FAILED — NameError or assertion error
```

**Step 3: Minimal implementation**
```python
# tools/new_tool.py
def new_function(input: str) -> str:
    return "expected"
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_new_tool.py -v
python -m pytest tests/ -v  # full suite — must stay at 138+
```

**Step 5: Commit**
```bash
git add tools/new_tool.py tests/test_new_tool.py
git commit -m "[Add] [tools]: new_function for <purpose>"
```
```

---

## Mock patterns — use these, don't invent new ones

### LLM provider mock (planning agent, LLM tests)
```python
from unittest.mock import MagicMock

def _provider(response_text: str):
    mock = MagicMock()
    mock.generate.return_value = response_text
    return mock
```

### File path mock (memory, calendar)
```python
def test_something(monkeypatch, tmp_path):
    import tools.memory as mem
    monkeypatch.setattr(mem, "SENT_LOG_PATH", tmp_path / "sent_log.yaml")
    ...
```

### External client mock (Twilio, Supabase, OpenAI)
```python
from unittest.mock import patch, MagicMock

@patch('tools.whatsapp.Client')          # Twilio
@patch('tools.warmly.create_client')     # Supabase
@patch('prompts.messages.OpenAI')        # OpenAI
def test_something(mock_openai, mock_supabase, mock_twilio):
    mock_openai.return_value.chat.completions.create.return_value = ...
```

### Helper builder pattern (used in test_planning_agent, test_router)
```python
def _person(name="Alice", relationship="best friend", notes=""):
    return {"name": name, "relationship": relationship, "notes": notes}
```

---

## Commit message format

From git log — use this pattern:
```
[Add] [scope]: short description
[Fix] [scope]: what was broken and what was done
[Refactor] [scope]: what changed and why
[Docs] [scope]: what was documented
```

Scope = layer name: `[tools]`, `[router]`, `[prompts]`, `[warmly]`, `[tests]`, `[config]`, `[docs]`

---

## Save the plan

`docs/plans/YYYY-MM-DD-<feature-name>.md`

Ask: "Ready to build? Use `/build`."

## Completion gate

Not done until:
1. `/build` — all chunks executed and committed
2. `/audit` — test suite green, build clean
3. `/closeout` — docs updated, pushed
