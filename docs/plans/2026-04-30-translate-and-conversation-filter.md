# Plan: Recipe Translation + Conversation Filtering

```
Goal:         Translate any recipe to any language on demand, and correctly
              extract only the narrator's recipe knowledge from back-and-forth
              conversation recordings.
Layer:        Prompts + FastAPI + Frontend HTML
Architecture: Two independent improvements:
              (A) Smarter prompts — `translate.py` and `structure.py` get
                  explicit conversational awareness; no new LLM calls, no infra.
              (B) On-demand translation — new `prompts/recipe_translate.py` +
                  `POST /translate` endpoint + language picker in the UI.
              No embeddings, no speaker diarization — GPT-4o handles both
              conversational filtering and translation natively via prompting.
Design doc:   (this file)
```

---

## Do NOT break

- Two-step pipeline separation (`translate.py` → `structure.py`) — do not merge
- `cook_notes` field — vague measurements stay here, not normalised
- All 26 existing tests must stay green after every chunk

---

## Block 1 — Conversational filtering (smarter prompts)

### Chunk 1.1 — Update `translate.py` to filter conversation

Files:
- Modify: `prompts/translate.py`
- Modify: `tests/test_translate.py`

**Step 1: Failing test**
```python
# tests/test_translate.py — add to TestTranslateToEnglish class
def test_system_prompt_handles_conversation(self):
    """TRANSLATE_SYSTEM must instruct model to extract narrator's parts from conversation."""
    assert "conversation" in TRANSLATE_SYSTEM.lower() or "narrator" in TRANSLATE_SYSTEM.lower()
    assert "question" in TRANSLATE_SYSTEM.lower() or "other" in TRANSLATE_SYSTEM.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_translate.py::TestTranslateToEnglish::test_system_prompt_handles_conversation -v
# Expected: FAILED — assertion error (words not yet in prompt)
```

**Step 3: Minimal implementation**

Update `TRANSLATE_SYSTEM` in `prompts/translate.py`:
```python
TRANSLATE_SYSTEM = (
    "You are a faithful translator. Translate this Telugu recipe narration to English. "
    "Preserve vague quantities verbatim: words like 'konjam', 'a little', 'to taste', "
    "'until it smells right', 'enough' must appear in the translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information.\n\n"
    "The recording may be a conversation between the narrator and others. "
    "If so, translate only the narrator's contributions that contain recipe knowledge. "
    "Questions or prompts from other speakers are context only — do not include them "
    "in the translation unless they contain recipe information. "
    "The goal is a clean English narration of the recipe as told by the narrator."
)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_translate.py -v
python -m pytest tests/ -v   # full suite — must stay at 26+
```

**Step 5: Commit**
```bash
git add prompts/translate.py tests/test_translate.py
git commit -m "[Fix] [prompts]: translate.py filters narrator-only content from conversations"
```

---

### Chunk 1.2 — Update `structure.py` for conversational awareness

Files:
- Modify: `prompts/structure.py`
- Modify: `tests/test_structure.py`

**Step 1: Failing test**
```python
# tests/test_structure.py — add to TestStructureRecipe class
def test_system_prompt_handles_conversation(self):
    """STRUCTURE_SYSTEM must instruct model to extract from narrator only in conversations."""
    assert "conversation" in STRUCTURE_SYSTEM.lower() or "narrator" in STRUCTURE_SYSTEM.lower()
    assert "question" in STRUCTURE_SYSTEM.lower() or "other speaker" in STRUCTURE_SYSTEM.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_structure.py::TestStructureRecipe::test_system_prompt_handles_conversation -v
# Expected: FAILED
```

**Step 3: Minimal implementation**

Append to `STRUCTURE_SYSTEM` in `prompts/structure.py` (before the closing `"""`):
```python
"\n\nThe input may be a conversation. If so, extract recipe information only from "
"the person narrating the recipe. Questions from other speakers may clarify quantities "
"or steps — use them as context to understand the narrator's intent, but the structured "
"recipe should reflect only what the narrator is teaching."
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_structure.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add prompts/structure.py tests/test_structure.py
git commit -m "[Fix] [prompts]: structure.py extracts narrator-only recipe from conversations"
```

---

## Block 2 — On-demand recipe translation

### Chunk 2.1 — New `prompts/recipe_translate.py`

Files:
- Create: `prompts/recipe_translate.py`
- Create: `tests/test_recipe_translate.py`

**Step 1: Failing test**
```python
# tests/test_recipe_translate.py
import json
from unittest.mock import MagicMock
from prompts.recipe_translate import translate_recipe, RECIPE_TRANSLATE_SYSTEM

_RECIPE = {
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal for 4 hours.", "Grind to a smooth batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": [],
}

def _provider(response: dict):
    mock = MagicMock()
    mock.generate.return_value = json.dumps(response)
    return mock


class TestTranslateRecipe:
    def test_returns_dict(self):
        """translate_recipe() returns a dict."""
        result = translate_recipe(_RECIPE, "Hindi", _provider(_RECIPE))
        assert isinstance(result, dict)

    def test_preserves_schema_keys(self):
        """All recipe schema keys are present in the translated result."""
        result = translate_recipe(_RECIPE, "Tamil", _provider(_RECIPE))
        for key in ("dish_name", "ingredients", "steps", "cook_notes", "review_flags"):
            assert key in result

    def test_passes_language_in_prompt(self):
        """translate_recipe() includes the target language in the user message."""
        mock = MagicMock()
        mock.generate.return_value = json.dumps(_RECIPE)
        translate_recipe(_RECIPE, "Kannada", mock)
        call_args = mock.generate.call_args
        user_arg = call_args[1].get("user") if call_args[1] else call_args[0][1]
        assert "Kannada" in user_arg

    def test_strips_markdown_fences(self):
        """translate_recipe() handles ```json ... ``` wrapped output."""
        mock = MagicMock()
        mock.generate.return_value = f"```json\n{json.dumps(_RECIPE)}\n```"
        result = translate_recipe(_RECIPE, "Hindi", mock)
        assert result["dish_name"] == "Pesarattu"

    def test_system_prompt_preserves_vagueness(self):
        """RECIPE_TRANSLATE_SYSTEM must instruct model not to normalize vague quantities."""
        assert "vague" in RECIPE_TRANSLATE_SYSTEM.lower() or "konjam" in RECIPE_TRANSLATE_SYSTEM.lower()
        assert "normalize" in RECIPE_TRANSLATE_SYSTEM.lower() or "do not" in RECIPE_TRANSLATE_SYSTEM.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_recipe_translate.py -v
# Expected: ModuleNotFoundError — prompts/recipe_translate.py doesn't exist yet
```

**Step 3: Minimal implementation**

Create `prompts/recipe_translate.py`:
```python
import json
from prompts.llm import LLMProvider

RECIPE_TRANSLATE_SYSTEM = """Translate a structured recipe JSON into the target language.
Output valid JSON only — same schema as input, no prose, no markdown fences.

Rules:
- Translate dish_name, ingredients items, steps, and cook_notes into the target language
- Preserve vague quantities verbatim in spirit: 'a little', 'to taste', 'enough' should
  be translated as naturally vague equivalents — do not normalize to measurements
- review_flags: translate the text but keep the same list structure
- If a term has no direct translation (e.g. a dish name), keep the original word
- Return the same JSON schema: {dish_name, ingredients, steps, cook_notes, review_flags}"""


def translate_recipe(recipe: dict, target_language: str, provider: LLMProvider) -> dict:
    """Translate a structured recipe dict into target_language. Returns same-schema dict."""
    user_prompt = (
        f"Translate this recipe to {target_language}:\n\n"
        f"{json.dumps(recipe, ensure_ascii=False, indent=2)}"
    )
    raw = provider.generate(system=RECIPE_TRANSLATE_SYSTEM, user=user_prompt)
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_recipe_translate.py -v
python -m pytest tests/ -v   # must stay green, now 31+ tests
```

**Step 5: Commit**
```bash
git add prompts/recipe_translate.py tests/test_recipe_translate.py
git commit -m "[Add] [prompts]: recipe_translate — translate structured recipe to any language"
```

---

### Chunk 2.2 — Add `POST /translate` endpoint to `serve.py`

Files:
- Modify: `scripts/serve.py`

**Step 1: No test needed** — FastAPI route verified manually.

**Step 2: Implementation**

Add to `scripts/serve.py` after the `/generate-image` endpoint:

```python
class TranslateRequest(BaseModel):
    token: str
    language: str


@app.post("/translate")
async def translate_endpoint(body: TranslateRequest):
    """Translate a stored recipe into any target language. Returns translated recipe JSON."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")

    from tools.storage import get_recipe_by_token
    from prompts.recipe_translate import translate_recipe

    try:
        recipe = get_recipe_by_token(body.token)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")

    config = _load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    try:
        translatable = {
            k: recipe[k]
            for k in ("dish_name", "ingredients", "steps", "cook_notes", "review_flags")
            if k in recipe
        }
        translated = translate_recipe(translatable, body.language, provider)
        return JSONResponse(content={"language": body.language, **translated})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 3: Verify**
```bash
# server already running
curl -s -X POST http://localhost:8080/translate \
  -H "Content-Type: application/json" \
  -d '{"token":"fake-token","language":"Hindi"}' | python3 -m json.tool
# Expect: 404 {"detail": "Recipe not found"}
```

**Step 4: Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: POST /translate endpoint — on-demand recipe translation"
```

---

### Chunk 2.3 — Language picker in `web/app.html`

Files:
- Modify: `web/app.html`

**What to build:**
- A language selector dropdown on the recipe detail screen (right column, below ingredients card)
- Supported languages: 8 options — English (default/reset), Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Spanish
- On language change: call `POST /translate`, show loading state ("Translating…"), re-render dish_name / ingredients / steps / cook_notes in the translated version
- "Reset to English" option restores the original `currentRecipe` data (no API call)
- Translated content is ephemeral — not saved to DB, just rendered

**HTML to add** (inside `.recipe-right`, after the ingredients card):
```html
<div class="lang-picker" id="lang-picker">
  <div class="lang-picker-label">🌐 Read in another language</div>
  <select id="lang-select" onchange="translateRecipe(this.value)">
    <option value="">As Dadi said it (English)</option>
    <option value="Hindi">हिंदी — Hindi</option>
    <option value="Tamil">தமிழ் — Tamil</option>
    <option value="Telugu">తెలుగు — Telugu</option>
    <option value="Kannada">ಕನ್ನಡ — Kannada</option>
    <option value="Malayalam">മലയാളം — Malayalam</option>
    <option value="Bengali">বাংলা — Bengali</option>
    <option value="Spanish">Español — Spanish</option>
  </select>
</div>
```

**CSS to add:**
```css
.lang-picker { margin-top: .85rem; }
.lang-picker-label { font-size: .7rem; color: var(--muted); margin-bottom: .35rem; }
.lang-picker select {
  width: 100%; padding: .45rem .65rem; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface); color: var(--text);
  font-size: .8rem; cursor: pointer;
}
```

**JS to add:**
```js
async function translateRecipe(language) {
  if (!language) {
    // Reset to original English
    renderRecipeDetail(currentRecipe);
    return;
  }
  if (!currentRecipe?.token) { showToast('Cannot translate — no token'); return; }

  // Show loading
  document.getElementById('rd-steps').innerHTML = '<div style="color:var(--muted);font-size:.85rem">Translating…</div>';
  document.getElementById('rd-ingredients').innerHTML = '<div style="color:var(--muted);font-size:.85rem">…</div>';

  try {
    const res = await fetch('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentRecipe.token, language })
    });
    if (!res.ok) throw new Error(await res.text());
    const translated = await res.json();

    // Render translated content in-place (don't overwrite currentRecipe)
    renderTranslatedContent(translated);
  } catch(e) {
    showToast('Translation failed — ' + e.message);
    renderRecipeDetail(currentRecipe);  // restore
  }
}

function renderTranslatedContent(t) {
  // Dish name
  document.getElementById('rd-name').textContent = t.dish_name || currentRecipe.dish_name;

  // Ingredients
  const ings = t.ingredients || [];
  document.getElementById('rd-ingredients').innerHTML = ings.length
    ? ings.map(i => `<div class="ing-row"><span class="ing-name">${esc(i.item)}</span><span class="ing-qty">${esc(i.quantity)}</span></div>`).join('')
    : '<div style="color:var(--muted);font-size:.82rem">—</div>';

  // Steps
  const steps = t.steps || [];
  document.getElementById('rd-steps').innerHTML = steps.length
    ? steps.map((s, i) => `<div class="step-row"><div class="step-num">${i+1}</div><div class="step-text">${esc(s)}</div></div>`).join('')
    : '';

  // Tip
  document.getElementById('rd-tip').innerHTML = t.cook_notes
    ? `<div class="tip-card"><span class="tip-icon">💡</span><em>${esc(t.cook_notes)}</em></div>`
    : '<div style="color:var(--muted);font-size:.82rem">No tip recorded.</div>';
}
```

**Verify:**
```
1. Open a recipe detail
2. Select "हिंदी — Hindi" from the dropdown
3. Ingredients + steps + tip render in Hindi within ~3s
4. Select "As Dadi said it" → original English restores
5. Select "తెలుగు — Telugu" → renders in Telugu script
```

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: language picker — translate recipe to 7 languages on demand"
```

---

## Verification after all chunks

```bash
# 1. Tests
python -m pytest tests/ -v
# Expected: 31+ tests, all green

# 2. Server
python -m scripts.serve

# 3. Manual smoke test
# - Record a conversation clip (have someone ask "how much?" mid-recording)
# - Verify structured recipe only contains narrator's knowledge
# - Open a saved recipe → select Hindi → recipe renders in Hindi
# - Select "As Dadi said it" → English restores
# - Select Telugu → renders in Telugu script
```

---

## Files changed summary

| File | Change |
|---|---|
| `prompts/translate.py` | Conversational filtering instruction |
| `prompts/structure.py` | Conversational awareness instruction |
| `prompts/recipe_translate.py` | New — translates structured recipe to any language |
| `scripts/serve.py` | New `POST /translate` endpoint |
| `web/app.html` | Language picker dropdown + `translateRecipe()` + `renderTranslatedContent()` |
| `tests/test_translate.py` | New conversational test |
| `tests/test_structure.py` | New conversational test |
| `tests/test_recipe_translate.py` | New — 5 tests for recipe_translate |

**No schema changes. No new dependencies. No embeddings.**

---

Ready to build? Use `/build`.
