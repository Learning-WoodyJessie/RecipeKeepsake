# Gotchas — Hard-Won Lessons

Failure patterns to document as we build RecipeKeepsake.

*Started: 2026-04-29*

---

## Telugu / Whisper

### Code-switching mid-recipe

**Pattern**: Grandma speaks Telugu but ingredient names and measurements are often English ("one cup", "baking powder", "half teaspoon"). Whisper handles this reasonably but can mis-transcribe.

**Rule**: Always pass `language="te"` to Whisper but expect English words to appear in the transcript. Call A (translation) must preserve these verbatim, not translate them back to Telugu.

---

## Vague measurements

**Pattern**: Traditional recipes use phrases like "konjam" (a little), "cheyyi nimpinchu" (fill your hand), "smell-ki vachchindi" (until it smells right). These are NOT errors — they are the recipe.

**Rule**: Call B (structuring) prompt must explicitly say: "Where quantity is vague (handful, pinch, to taste, until it smells right), preserve the vague term verbatim in a cook_notes field. Do NOT invent a measurement."

---

---

## Supabase singleton + test isolation

**Pattern**: Introduced a module-level `_supabase` singleton in `tools/storage.py`. Existing tests patched `tools.storage.create_client` — but with the singleton, `create_client` is only called once on first `_client()` call. If the singleton is already set from a previous test (or module import), patching `create_client` has no effect and the test silently hits nothing.

**Tell**: Tests pass but don't actually assert against the mock — `create_client` call count is 0.

**Wrong**:
```python
with patch("tools.storage.create_client", return_value=mock_client):
    result = insert_recipe(...)
```

**Right**:
```python
import tools.storage as s
monkeypatch.setattr(s, "_supabase", mock_client)
result = insert_recipe(...)
```

**Rule**: After introducing any module-level singleton, migrate all existing tests to inject via `monkeypatch.setattr` on the singleton variable — not on the factory function that created it.

---

## Local import to avoid patch target

**Pattern**: A function does a local `from module import thing` inside its body. Patching `scripts.serve.thing` at test time fails with `AttributeError` because the name doesn't exist at module scope.

**Tell**: `AttributeError: <module 'scripts.serve'> does not have the attribute 'check_rate_limit_db'`

**Wrong**: import inside the function body, then `patch("scripts.serve.check_rate_limit_db")`

**Right**: module-level import so the name lives on the module and is patchable.

**Rule**: Any function that needs to be patched in tests must be imported at module level, not inside the function body.

---

## FastAPI static export — public assets 404

**Pattern**: Next.js copies `public/` files flat into `out/` (e.g. `out/hero-home.png`). FastAPI catch-all only looked for `{path}/index.html`, so any image or non-HTML asset returned 404.

**Tell**: `<img>` shows broken/alt-text in production while working in local `next dev` (which serves `public/` natively).

**Wrong**: catch-all goes straight to `out/{path}/index.html`

**Right**: check `out/{path}` as a direct file first — if it's a file, serve it; otherwise fall through to `index.html` lookup.

**Rule**: When FastAPI serves a Next.js static export, always check for direct files before looking for `index.html`.

---

## Mobile sidebar — `flex: 1` doesn't fill width in block context

**Pattern**: Layout switches sidebar to `position: fixed` on mobile (`display: block` on the wrapper). Inner content div had `flex: 1` which only works inside a flex container — in block context it has no effect, leaving content clipped at the left edge.

**Tell**: Page text clipped on left on mobile; content appears to start off-screen.

**Wrong**: `<div style={{ flex: 1 }}>` inside a `display: block` wrapper

**Right**: add `width: 100%` alongside `flex: 1` so it fills correctly in both flex and block contexts.

**Rule**: Any content wrapper that must fill width in both flex and block contexts needs both `flex: 1` AND `width: 100%`.

---

## pytest marker without addopts — evals still run by default

**Pattern**: Adding `@pytest.mark.evals` marks tests but does NOT exclude them from the default `pytest tests/` run. Without `addopts = -m "not evals"` in `pytest.ini`, the default run collects and executes eval tests — making live API calls on every CI run.

**Tell**: First default run after adding eval tests hits real OpenAI; tests fail or time out.

**Wrong**:
```ini
[pytest]
markers =
    evals: live-model tests
# missing addopts — evals still run by default
```

**Right**:
```ini
[pytest]
addopts = -m "not evals"
markers =
    evals: live-model tests (excluded from default run)
```

**Rule**: A pytest marker alone is documentation, not exclusion. Pair it with `addopts = -m "not <marker>"` to actually gate expensive tests out of the default run.

---

## Whisper hallucination loop on silence

**Pattern**: `gpt-4o-transcribe` locks onto the last real word/sentence and repeats it hundreds of times when the recording ends with silence. Happens in two forms: word-level (unpunctuated Telugu: "మోటియింది మోటియింది...") and sentence-level (English: "Add sugar. Add sugar. ..."). Both cause the structure step to receive a bloated, garbage transcript.

**Tell**: `transcript_raw` contains a short real recipe followed by hundreds of identical words/sentences.

**Wrong**: Pass raw Whisper output directly to translation/structure.

**Right**: Post-process with two-pass dedup — collapse consecutive identical words (max 2), then collapse consecutive identical sentences (max 2).

**Rule**: Always strip hallucination loops from Whisper output before any LLM step. See `_strip_hallucination_loops()` in `tools/transcribe.py`.

---

## Whisper script output depends on initial_prompt language

**Pattern**: `gpt-4o-transcribe` with `language="te"` outputs romanized Latin script (e.g. "Chintapandu naanavettu") for browser WebM recordings when the `initial_prompt` is in Latin script. M4A uploads produce Telugu script because they have higher audio quality and don't need the prompt to tip the model.

**Tell**: Upload → Telugu script in ORIGINAL. Live record → romanized Latin in ORIGINAL.

**Wrong**: `initial_prompt = "Telugu cooking terms: konchem, koddiga, ..."`

**Right**: `initial_prompt = "తెలుగు వంటకాలు: konchem, koddiga, ..."` (Telugu script prefix forces Telugu script output regardless of audio format)

**Rule**: Whisper's initial_prompt script language is a signal for output script. Always start it in the target script.

---

*(Add new patterns here as they're discovered during build)*
