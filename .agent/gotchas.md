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

*(Add new patterns here as they're discovered during build)*
