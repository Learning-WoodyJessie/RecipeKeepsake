# Plan: Recipe Language Switcher (Dropdown)

```
Goal:         Add a dropdown language switcher to the recipe detail view that translates
              dish_name/ingredients/steps/cook_notes into EN/TE/HI/KN/ES/FR on demand,
              caching results in Supabase so re-taps are instant.
Layer:        Multi-layer (Prompts → Storage → API endpoint → UI)
Architecture: New prompts/translate_recipe.py handles LLM translation. Two new storage
              helpers read/write a translations JSONB column. A new GET endpoint in
              serve.py orchestrates check-cache → translate → write-cache → return.
              Client-side JS cache makes switching back to a seen language instant
              without any network call.
Design doc:   docs/plans/2026-05-01-recipe-translation-design.md
```

## Pre-flight checklist

- [x] Existing pattern: `prompts/translate.py` + `tests/test_translate.py` — same shape used here
- [x] Mock strategy: `MagicMock()` for LLM provider, `patch('tools.storage._client')` for Supabase
- [x] Reuse: `get_recipe_by_token()` and `patch_recipe()` already in `tools/storage.py` — will add two new helpers alongside them
- [x] No CLOSE_RELATIONSHIPS involvement (RecipeKeepsake, not BirthdayReminders)
- [x] Baseline: 51 tests green

## Do NOT break
- Two-step pipeline separation (`prompts/translate.py` = raw audio → English; `prompts/translate_recipe.py` = structured English → target)
- `cook_notes` preserved as vague text — never normalized into measurements
- `get_recipe_by_token()` signs the audio URL — don't duplicate that logic

---

## Block 1 — Prompt

### Chunk 1.1 — `prompts/translate_recipe.py`

Files:
- Create: `prompts/translate_recipe.py`
- Create: `tests/test_translate_recipe.py`

**Step 1: Failing tests**
```python
# tests/test_translate_recipe.py
import json
from unittest.mock import MagicMock
from prompts.translate_recipe import translate_recipe_fields, SUPPORTED_LANGS


def _provider(response_text: str):
    mock = MagicMock()
    mock.generate.return_value = response_text
    return mock


_SAMPLE_FIELDS = {
    "dish_name": "Ragi Mudda",
    "ingredients": [{"item": "ragi flour", "quantity": "1 cup"}],
    "steps": ["Soak ragi flour in water."],
    "cook_notes": "Add a little salt to taste.",
}

_SAMPLE_TRANSLATED = {
    "dish_name": "రాగి ముద్ద",
    "ingredients": [{"item": "రాగి పిండి", "quantity": "ఒక కప్పు"}],
    "steps": ["రాగి పిండిని నీళ్ళలో నానబెట్టండి."],
    "cook_notes": "కొంచెం ఉప్పు వేయండి.",
}


class TestTranslateRecipeFields:
    def test_returns_parsed_dict(self):
        """translate_recipe_fields() parses the provider JSON response into a dict."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        result = translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        assert result["dish_name"] == "రాగి ముద్ద"

    def test_sends_fields_as_json_user_message(self):
        """translate_recipe_fields() serialises fields as JSON in the user message."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        call_kwargs = p.generate.call_args[1]
        user_msg = call_kwargs.get("user") or p.generate.call_args[0][1]
        parsed = json.loads(user_msg)
        assert parsed["dish_name"] == "Ragi Mudda"

    def test_injects_glossary_for_telugu(self):
        """translate_recipe_fields() includes Telugu glossary in system prompt for lang='te'."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "te", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "konchem" in system.lower()

    def test_no_glossary_for_hindi(self):
        """translate_recipe_fields() does NOT inject Telugu glossary for lang='hi'."""
        hi_translated = {**_SAMPLE_TRANSLATED, "dish_name": "रागी मुद्दा"}
        p = _provider(json.dumps(hi_translated))
        translate_recipe_fields(_SAMPLE_FIELDS, "hi", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "konchem" not in system.lower()

    def test_system_prompt_preserves_vague_terms(self):
        """translate_recipe_fields() system prompt instructs model to preserve vague quantities."""
        p = _provider(json.dumps(_SAMPLE_TRANSLATED))
        translate_recipe_fields(_SAMPLE_FIELDS, "hi", p)
        system = p.generate.call_args[1].get("system") or p.generate.call_args[0][0]
        assert "vague" in system.lower() or "natural equivalent" in system.lower()

    def test_raises_for_unsupported_lang(self):
        """translate_recipe_fields() raises ValueError for unrecognised language codes."""
        import pytest
        p = _provider("{}")
        with pytest.raises(ValueError, match="Unsupported"):
            translate_recipe_fields(_SAMPLE_FIELDS, "zh", p)
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_translate_recipe.py -v
# Expected: ModuleNotFoundError — prompts/translate_recipe.py does not exist yet
```

**Step 3: Minimal implementation**
```python
# prompts/translate_recipe.py
"""
Translate structured English recipe fields → target language via LLM.

Distinct from prompts/translate.py (Telugu audio → English).
This one takes already-structured fields and outputs a translated version.
"""
import json
from prompts.llm import LLMProvider
from tools.glossary import build_glossary_hint

SUPPORTED_LANGS = {"en", "te", "hi", "kn", "es", "fr"}

LANG_NAMES = {
    "en": "English",
    "te": "Telugu",
    "hi": "Hindi",
    "kn": "Kannada",
    "es": "Spanish",
    "fr": "French",
}

_SYSTEM = (
    "You are translating a structured recipe from English into {language}.\n"
    "Rules:\n"
    "- Preserve vague quantity words as natural equivalents — never convert to specific measurements.\n"
    "  Examples: \"a little\" → natural equivalent in {language}, NOT \"½ tsp\".\n"
    "  \"to taste\", \"until it smells right\", \"enough\" → keep the spirit, not a number.\n"
    "- Keep ingredient names recognisable (e.g. \"ragi\", \"turmeric\" stay as food names).\n"
    "- Translate step instructions naturally — imperative mood, like a cook talking.\n"
    "- Return ONLY valid JSON with the same keys as the input. No markdown, no explanation.\n"
    "{glossary_hint}"
)


def translate_recipe_fields(fields: dict, lang: str, provider: LLMProvider) -> dict:
    """Translate dish_name, ingredients, steps, cook_notes into target language.

    Args:
        fields: dict with keys dish_name, ingredients, steps, cook_notes
        lang:   2-letter language code (must be in SUPPORTED_LANGS)
        provider: LLMProvider instance

    Returns:
        dict with same keys, content translated into target language
    """
    if lang not in SUPPORTED_LANGS:
        raise ValueError(f"Unsupported language: {lang}. Must be one of {SUPPORTED_LANGS}")

    glossary_hint = ""
    if lang == "te":
        glossary_hint = f"\nTelugu cooking glossary:\n{build_glossary_hint()}"

    system = _SYSTEM.format(language=LANG_NAMES[lang], glossary_hint=glossary_hint)

    user_text = json.dumps(
        {
            "dish_name": fields.get("dish_name", ""),
            "ingredients": fields.get("ingredients", []),
            "steps": fields.get("steps", []),
            "cook_notes": fields.get("cook_notes", ""),
        },
        ensure_ascii=False,
    )

    raw = provider.generate(system=system, user=user_text)
    return json.loads(raw)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_translate_recipe.py -v
python -m pytest tests/ -v  # must stay at 51+6 = 57+
```

**Step 5: Commit**
```bash
git add prompts/translate_recipe.py tests/test_translate_recipe.py
git commit -m "[Add] [prompts]: translate_recipe_fields for structured English → target language"
```

---

## Block 2 — Storage

### Chunk 2.1 — Translation cache in `tools/storage.py`

Files:
- Modify: `tools/storage.py` (append two functions)
- Modify: `tests/test_storage.py` (if it exists) OR create `tests/test_storage_translations.py`

**Step 1: Failing tests**
```python
# tests/test_storage_translations.py
from unittest.mock import patch, MagicMock
from tools.storage import get_cached_translation, cache_translation


def _mock_sb():
    """Return a MagicMock that mimics the Supabase client chain."""
    sb = MagicMock()
    return sb


class TestGetCachedTranslation:
    def test_returns_cached_data_when_present(self):
        """get_cached_translation() returns the stored dict when lang key exists."""
        fake_recipe = {
            "token": "abc",
            "audio_url": "",
            "translations": {"hi": {"dish_name": "रागी मुद्दा", "ingredients": [], "steps": [], "cook_notes": ""}},
        }
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            # get_recipe_by_token calls sb.table(...).select(...).eq(...).single().execute()
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_recipe
            result = get_cached_translation("abc", "hi")
        assert result["dish_name"] == "रागी मुद्दा"

    def test_returns_none_when_lang_not_cached(self):
        """get_cached_translation() returns None when the lang key is absent."""
        fake_recipe = {"token": "abc", "audio_url": "", "translations": {}}
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_recipe
            result = get_cached_translation("abc", "te")
        assert result is None

    def test_returns_none_when_translations_column_null(self):
        """get_cached_translation() handles recipes with translations=None gracefully."""
        fake_recipe = {"token": "abc", "audio_url": "", "translations": None}
        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = fake_recipe
            result = get_cached_translation("abc", "fr")
        assert result is None


class TestCacheTranslation:
    def test_writes_merged_translations(self):
        """cache_translation() merges new lang entry into existing translations and updates row."""
        existing = {"hi": {"dish_name": "रागी मुद्दा"}}
        new_data = {"dish_name": "ರಾಗಿ ಮುದ್ದೆ", "ingredients": [], "steps": [], "cook_notes": ""}

        with patch("tools.storage._client") as mock_client:
            sb = _mock_sb()
            mock_client.return_value = sb
            # select call returns existing translations
            sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "translations": existing
            }
            cache_translation("abc", "kn", new_data)

            # Verify update was called with merged dict containing both hi and kn
            update_call = sb.table.return_value.update.call_args
            written = update_call[0][0]["translations"]
            assert "hi" in written
            assert "kn" in written
            assert written["kn"]["dish_name"] == "ರಾಗಿ ಮುದ್ದೆ"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_storage_translations.py -v
# Expected: ImportError — get_cached_translation not found in tools.storage
```

**Step 3: Minimal implementation** (append to `tools/storage.py`)
```python
def get_cached_translation(token: str, lang: str) -> dict | None:
    """Return a cached translation for (token, lang) or None if not yet translated."""
    sb = _client()
    result = sb.table("recipes").select("translations").eq("token", token).single().execute()
    translations = (result.data.get("translations") or {})
    return translations.get(lang)


def cache_translation(token: str, lang: str, data: dict) -> None:
    """Merge translated fields into the translations JSONB column for this recipe."""
    sb = _client()
    # Fetch existing translations first so we don't overwrite other languages
    result = sb.table("recipes").select("translations").eq("token", token).single().execute()
    existing = result.data.get("translations") or {}
    existing[lang] = data
    sb.table("recipes").update({"translations": existing}).eq("token", token).execute()
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_storage_translations.py -v
python -m pytest tests/ -v  # must stay at 57+4 = 61+
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_storage_translations.py
git commit -m "[Add] [tools]: get_cached_translation and cache_translation for translations JSONB"
```

---

## Block 3 — API Endpoint

### Chunk 3.1 — `GET /recipe/{token}/translate?lang=` in `serve.py`

Files:
- Modify: `scripts/serve.py` (add endpoint after the PATCH endpoint)

No unit tests for the HTTP layer (follows project convention — no test_serve.py exists).
Manual smoke test after deployment.

**Step 3: Implementation** (add to `scripts/serve.py` before `if __name__ == "__main__":`)

```python
_TRANSLATE_SUPPORTED = {"en", "te", "hi", "kn", "es", "fr"}


@app.get("/recipe/{token}/translate")
async def translate_recipe_endpoint(token: str, lang: str = "en"):
    """
    Return recipe fields translated into the requested language.
    First call translates via LLM (~2–3s); subsequent calls return from Supabase cache.
    EN always returns English fields directly — no LLM call.
    """
    lang = lang.lower()
    if lang not in _TRANSLATE_SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")

    from tools.storage import get_recipe_by_token, get_cached_translation, cache_translation
    from prompts.translate_recipe import translate_recipe_fields
    from prompts.llm import OpenAIProvider
    from data.config import load_config

    try:
        recipe = get_recipe_by_token(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # English is always available — return stored fields directly
    if lang == "en":
        return JSONResponse(content={
            "lang": "en",
            "dish_name": recipe.get("dish_name", ""),
            "ingredients": recipe.get("ingredients", []),
            "steps": recipe.get("steps", []),
            "cook_notes": recipe.get("cook_notes", ""),
        })

    # Check server-side cache
    try:
        cached = get_cached_translation(token, lang)
        if cached:
            return JSONResponse(content={"lang": lang, **cached})
    except Exception as e:
        print(f"[translate] Cache read failed (non-fatal): {e}")

    # Translate via LLM
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not set")

    config = load_config()
    model = config.get("llm", {}).get("model", "gpt-4o")
    provider = OpenAIProvider(model=model)

    fields = {
        "dish_name": recipe.get("dish_name", ""),
        "ingredients": recipe.get("ingredients", []),
        "steps": recipe.get("steps", []),
        "cook_notes": recipe.get("cook_notes", ""),
    }

    try:
        translated = translate_recipe_fields(fields, lang, provider)
    except Exception as e:
        print(f"[translate] LLM error: {e}")
        raise HTTPException(status_code=500, detail="Translation failed — try again")

    # Write to cache (non-fatal — don't fail the request if Supabase write fails)
    try:
        cache_translation(token, lang, translated)
    except Exception as e:
        print(f"[translate] Cache write failed (non-fatal): {e}")

    return JSONResponse(content={"lang": lang, **translated})
```

**Step 4: Verify full suite still green**
```bash
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: GET /recipe/{token}/translate endpoint with Supabase caching"
```

---

## Block 4 — UI

### Chunk 4.1 — Dropdown language switcher in `web/app.html`

Files:
- Modify: `web/app.html`

No unit tests (frontend). Verified by visual inspection after Railway deploy.

**What to add:**

**CSS** (before `</style>`):
```css
/* ── Language dropdown ── */
.lang-dropdown-wrap { position: relative; margin-bottom: 1rem; }
.lang-select-btn {
  display: flex; align-items: center; gap: .5rem;
  border: 1.5px solid var(--border, #EAE0D6); border-radius: 10px;
  padding: .45rem .75rem; font-size: .82rem; font-weight: 600;
  background: var(--surface, #FFF8F2); color: var(--text2, #5C4A3A);
  cursor: pointer; font-family: inherit; transition: border-color .2s, color .2s;
  width: 100%; text-align: left;
}
.lang-select-btn:hover,
.lang-select-btn.open { border-color: var(--accent, #C0533A); color: var(--accent, #C0533A); }
.lang-select-btn .lsb-flag { font-size: .95rem; }
.lang-select-btn .lsb-name { flex: 1; }
.lang-select-btn .lsb-chevron { font-size: .7rem; color: var(--muted, #9C8472); transition: transform .2s; }
.lang-select-btn.open .lsb-chevron { transform: rotate(180deg); }
.lang-select-btn .lsb-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 1.5px solid var(--accent, #C0533A); border-top-color: transparent;
  animation: lspin .7s linear infinite; display: none; flex-shrink: 0;
}
.lang-select-btn.loading .lsb-spinner { display: inline-block; }
.lang-select-btn.loading .lsb-flag,
.lang-select-btn.loading .lsb-chevron { display: none; }
.lang-select-btn.loading { pointer-events: none; border-color: var(--accent, #C0533A); }
@keyframes lspin { to { transform: rotate(360deg); } }

.lang-dropdown-menu {
  display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
  background: var(--surface, #FFF8F2); border: 1.5px solid var(--border, #EAE0D6);
  border-radius: 10px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.12);
}
.lang-dropdown-menu.open { display: block; }
.lang-opt {
  display: flex; align-items: center; gap: .55rem;
  padding: .55rem .75rem; font-size: .82rem; font-weight: 500;
  color: var(--text2, #5C4A3A); cursor: pointer; font-family: inherit;
  border-bottom: 1px solid var(--border, #EAE0D6); transition: background .15s;
}
.lang-opt:last-child { border-bottom: none; }
.lang-opt:hover { background: var(--cream2, #F5EDE3); }
.lang-opt.active { background: #FFF1EC; color: var(--accent, #C0533A); font-weight: 700; }
.lang-opt .lo-check { margin-left: auto; font-size: .75rem; display: none; }
.lang-opt.active .lo-check { display: inline; }

/* Skeleton shimmer on recipe body while translating */
.lang-translating .rd-title,
.lang-translating .rd-ingredient,
.lang-translating .rd-step,
.lang-translating .rd-notes { opacity: .25; transition: opacity .2s; }
```

**HTML** — insert immediately after the dish title / meta line in `screen-recipe-detail`:
```html
<!-- Language switcher -->
<div class="lang-dropdown-wrap" id="lang-dropdown-wrap">
  <button class="lang-select-btn" id="lang-select-btn" onclick="toggleLangDropdown(event)">
    <span class="lsb-spinner"></span>
    <span class="lsb-flag" id="lsb-flag">🇬🇧</span>
    <span class="lsb-name" id="lsb-name">English</span>
    <span class="lsb-chevron">▼</span>
  </button>
  <div class="lang-dropdown-menu" id="lang-dropdown-menu">
    <div class="lang-opt active" data-lang="en" onclick="switchLang('en')">
      <span>🇬🇧</span><span style="flex:1">English</span><span class="lo-check">✓</span>
    </div>
    <div class="lang-opt" data-lang="te" onclick="switchLang('te')">
      <span>🇮🇳</span><span style="flex:1">Telugu</span><span class="lo-check">✓</span>
    </div>
    <div class="lang-opt" data-lang="hi" onclick="switchLang('hi')">
      <span>🇮🇳</span><span style="flex:1">Hindi</span><span class="lo-check">✓</span>
    </div>
    <div class="lang-opt" data-lang="kn" onclick="switchLang('kn')">
      <span>🇮🇳</span><span style="flex:1">Kannada</span><span class="lo-check">✓</span>
    </div>
    <div class="lang-opt" data-lang="es" onclick="switchLang('es')">
      <span>🇪🇸</span><span style="flex:1">Spanish</span><span class="lo-check">✓</span>
    </div>
    <div class="lang-opt" data-lang="fr" onclick="switchLang('fr')">
      <span>🇫🇷</span><span style="flex:1">French</span><span class="lo-check">✓</span>
    </div>
  </div>
</div>
```

**JS** — add alongside other recipe-detail functions:
```js
// ── Language switcher ──
const _LANG_META = {
  en: { flag: '🇬🇧', name: 'English' },
  te: { flag: '🇮🇳', name: 'Telugu' },
  hi: { flag: '🇮🇳', name: 'Hindi' },
  kn: { flag: '🇮🇳', name: 'Kannada' },
  es: { flag: '🇪🇸', name: 'Spanish' },
  fr: { flag: '🇫🇷', name: 'French' },
};

// Client-side cache: { "token:lang": { dish_name, ingredients, steps, cook_notes } }
const _translationCache = {};
let _currentLang = 'en';
let _langLoading = false;

function toggleLangDropdown(e) {
  if (_langLoading) return;
  e && e.stopPropagation();
  const menu = document.getElementById('lang-dropdown-menu');
  const btn  = document.getElementById('lang-select-btn');
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  btn.classList.toggle('open', open);
}

function _closeLangDropdown() {
  document.getElementById('lang-dropdown-menu')?.classList.remove('open');
  document.getElementById('lang-select-btn')?.classList.remove('open');
}

function _setLangActive(lang) {
  document.querySelectorAll('.lang-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.lang === lang);
  });
  const meta = _LANG_META[lang] || { flag: '🌐', name: lang.toUpperCase() };
  document.getElementById('lsb-flag').textContent = meta.flag;
  document.getElementById('lsb-name').textContent = meta.name;
}

function _applyTranslation(data) {
  // Update DOM fields with translated content
  // dish_name
  const titleEl = document.getElementById('rd-dish-name');
  if (titleEl) titleEl.textContent = data.dish_name || '';

  // ingredients — rebuild list
  const ingList = document.getElementById('rd-ingredients');
  if (ingList && data.ingredients) {
    ingList.innerHTML = data.ingredients.map(ing => {
      const qty  = ing.quantity || ing.qty || '';
      const item = ing.item || ing.name || '';
      return `<li class="rd-ingredient">${qty ? `<strong>${qty}</strong> ` : ''}${item}</li>`;
    }).join('');
  }

  // steps — rebuild list
  const stepList = document.getElementById('rd-steps');
  if (stepList && data.steps) {
    stepList.innerHTML = data.steps.map((s, i) =>
      `<li class="rd-step"><span class="step-num">${i + 1}</span><span>${s}</span></li>`
    ).join('');
  }

  // cook_notes
  const notesEl = document.getElementById('rd-cook-notes');
  if (notesEl) notesEl.textContent = data.cook_notes || '';

  // Show "vague terms preserved" badge when not English
  const badge = document.getElementById('rd-vague-badge');
  if (badge) badge.style.display = _currentLang !== 'en' ? 'inline' : 'none';
}

async function switchLang(lang) {
  _closeLangDropdown();
  if (lang === _currentLang || _langLoading) return;

  const cacheKey = `${currentRecipe?.token}:${lang}`;

  // Client-side cache hit — instant
  if (_translationCache[cacheKey]) {
    _currentLang = lang;
    _setLangActive(lang);
    _applyTranslation(_translationCache[cacheKey]);
    return;
  }

  // English always instant — pull from currentRecipe
  if (lang === 'en') {
    _currentLang = 'en';
    _setLangActive('en');
    _applyTranslation({
      dish_name:   currentRecipe.dish_name,
      ingredients: currentRecipe.ingredients,
      steps:       currentRecipe.steps,
      cook_notes:  currentRecipe.cook_notes,
    });
    return;
  }

  // Fetch translation
  _langLoading = true;
  document.getElementById('lang-select-btn')?.classList.add('loading');
  document.getElementById('recipe-detail-body')?.classList.add('lang-translating');

  try {
    const res = await fetch(`/recipe/${currentRecipe.token}/translate?lang=${lang}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _translationCache[cacheKey] = data;
    _currentLang = lang;
    _setLangActive(lang);
    _applyTranslation(data);
  } catch (err) {
    console.error('[switchLang]', err);
    showToast("Couldn't translate right now — try again");
  } finally {
    _langLoading = false;
    document.getElementById('lang-select-btn')?.classList.remove('loading');
    document.getElementById('recipe-detail-body')?.classList.remove('lang-translating');
  }
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('lang-dropdown-wrap')?.contains(e.target)) {
    _closeLangDropdown();
  }
});

// Reset to English whenever a new recipe is opened
function resetLangSwitcher() {
  _currentLang = 'en';
  _langLoading = false;
  _setLangActive('en');
  _closeLangDropdown();
}
```

**IDs to verify in app.html before inserting HTML/JS**
(Check these exist — rename if needed):
- `rd-dish-name` — recipe title element in detail screen
- `rd-ingredients` — `<ul>` or `<ol>` for ingredients
- `rd-steps` — `<ul>` or `<ol>` for steps
- `rd-cook-notes` — cook notes text element
- `recipe-detail-body` — wrapper div to receive `.lang-translating` class
- `currentRecipe` — JS variable holding the current recipe object (already present)
- `showToast(msg)` — already exists in app.html

Also call `resetLangSwitcher()` inside the function that opens the recipe detail screen.

**Step 4: Verify**
```bash
python -m pytest tests/ -v  # must stay green
# Then: manual smoke test on local dev server and Railway
```

**Step 5: Commit**
```bash
git add web/app.html
git commit -m "[Add] [ui]: dropdown language switcher on recipe detail view"
```

---

## Supabase migration (run manually before deploying)

```sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}';
```

Run this in the Supabase SQL editor before deploying Chunk 3.1 — otherwise `get_cached_translation()` will see `translations=None` (handled gracefully, but the write will fail).

---

## Completion gate

- [x] Chunk 1.1 — prompts/translate_recipe.py + 6 tests
- [x] Chunk 2.1 — storage helpers + 4 tests
- [x] Chunk 3.1 — GET endpoint in serve.py
- [x] Chunk 4.1 — dropdown UI in app.html
- [x] Supabase migration run
- [x] `python -m pytest tests/ -v` — all 61 green
- [ ] Manual smoke: tap Telugu on a saved recipe → see Telugu text within 3s
- [ ] Manual smoke: tap Telugu again → instant (no spinner)
- [ ] Manual smoke: tap English → snaps back instantly
