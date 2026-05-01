# Plan: Telugu Glossary + Pipeline Refactor + Wizard UI

```
Goal:         Build a living Telugu cooking glossary, reorganize into a clean pipeline
              package, and implement the 3-step wizard review screen in app.html.
Layer:        Multi-layer (Python tools + pipeline + Warmly-style HTML/JS)
Architecture: Three independent blocks executed in order.
              Block A injects Telugu term knowledge into Whisper + LLM prompts.
              Block B creates a pipeline/ package with typed interfaces so serve.py
              becomes a thin HTTP adapter (no business logic in it).
              Block C replaces the flat review screen with the prototype wizard.
Design doc:   docs/plans/2026-05-01-review-screen.md (wizard prototype already approved)
```

---

## Block A — Telugu Cooking Glossary

### Chunk A.1 — Glossary YAML + loader + tests

Files:
- Create: `data/telugu_cooking_terms.yaml`
- Create: `tools/glossary.py`
- Create: `tests/test_glossary.py`

**Step 1: Failing test**
```python
# tests/test_glossary.py
from tools.glossary import load_glossary, build_glossary_hint

class TestLoadGlossary:
    def test_returns_dict(self):
        g = load_glossary()
        assert isinstance(g, dict)

    def test_konchem_present(self):
        g = load_glossary()
        assert "konchem" in g

    def test_variants_listed(self):
        g = load_glossary()
        assert "konjam" in g["konchem"]["variants"]

class TestBuildGlossaryHint:
    def test_returns_string(self):
        hint = build_glossary_hint()
        assert isinstance(hint, str)

    def test_contains_konchem(self):
        hint = build_glossary_hint()
        assert "konchem" in hint.lower()

    def test_contains_meaning(self):
        hint = build_glossary_hint()
        assert "little" in hint.lower() or "small amount" in hint.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_glossary.py -v
# Expected: FAILED — ModuleNotFoundError
```

**Step 3: Minimal implementation**

`data/telugu_cooking_terms.yaml`:
```yaml
# Telugu cooking vocabulary — living glossary
# Add terms as they come up in narrations
# variants: common misspellings/romanisation the speech model may produce

konchem:
  meaning: "a little / a small amount"
  variants: [konjam, konjem, koncham, konchm, gonchem]
  use: quantity

veyinchu:
  meaning: "fry / sauté"
  variants: [veyyinchu, veyincu, veyiñcu]
  use: technique

koddiga:
  meaning: "a small amount (slightly more than konchem)"
  variants: [kodiga, koḍiga]
  use: quantity

chaalu:
  meaning: "enough / that's sufficient"
  variants: [chalu, chaalu, saalu]
  use: quantity

sari:
  meaning: "correct / just right (as a measurement)"
  variants: [sari, saari]
  use: quantity

popu:
  meaning: "tempering / tadka (blooming spices in hot oil)"
  variants: [popu, thaalimp, thaligimpu]
  use: technique

nalupukollu:
  meaning: "roast and grind"
  variants: [nalupukolupu, neyyi]
  use: technique

vaasnasthundi:
  meaning: "until it smells right / fragrant"
  variants: [vasna vastundi, vaasana vastundi]
  use: doneness_cue

paakam:
  meaning: "the right consistency (syrup/sauce stage)"
  variants: [pakam, paaakam]
  use: doneness_cue
```

`tools/glossary.py`:
```python
from pathlib import Path
import yaml

_GLOSSARY_PATH = Path(__file__).resolve().parent.parent / "data" / "telugu_cooking_terms.yaml"


def load_glossary() -> dict:
    """Load the Telugu cooking glossary from YAML. Returns term → metadata dict."""
    with open(_GLOSSARY_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_glossary_hint() -> str:
    """
    Build a compact glossary hint string for injection into Whisper initial_prompt
    or LLM system prompts.

    Format: "konchem (konjam/konjem) = a little; koddiga = a small amount; ..."
    Kept short so it fits in Whisper's 224-token initial_prompt window.
    """
    glossary = load_glossary()
    parts = []
    for term, meta in glossary.items():
        variants = meta.get("variants", [])
        variant_str = f" ({'/'.join(variants[:3])})" if variants else ""
        parts.append(f"{term}{variant_str} = {meta['meaning']}")
    return "; ".join(parts)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_glossary.py -v
python -m pytest tests/ -v  # full suite — stay at 32+
```

**Step 5: Commit**
```bash
git add data/telugu_cooking_terms.yaml tools/glossary.py tests/test_glossary.py
git commit -m "[Add] [tools]: Telugu cooking glossary YAML + loader + build_glossary_hint"
```

---

### Chunk A.2 — Inject glossary into Whisper transcription

Files:
- Modify: `tools/transcribe.py`
- Modify: `tests/test_transcribe.py`

**Step 1: Failing test**
```python
# Add to class TestTranscribeAudio in tests/test_transcribe.py:

def test_passes_initial_prompt_with_glossary(self):
    """transcribe_audio() passes initial_prompt containing Telugu cooking terms."""
    mock_transcript = MagicMock()
    mock_transcript.text = "some text"

    with patch("tools.transcribe.OpenAI") as mock_openai, \
         patch("builtins.open", mock_open(read_data=b"audio bytes")):
        mock_client = mock_openai.return_value
        mock_client.audio.transcriptions.create.return_value = mock_transcript
        transcribe_audio("test.m4a")

        call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

    assert "initial_prompt" in call_kwargs
    assert "konchem" in call_kwargs["initial_prompt"].lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_transcribe.py::TestTranscribeAudio::test_passes_initial_prompt_with_glossary -v
# Expected: FAILED — KeyError or AssertionError (initial_prompt not in call)
```

**Step 3: Minimal implementation**
```python
# tools/transcribe.py
from openai import OpenAI
from tools.glossary import build_glossary_hint

_WHISPER_PREFIX = (
    "This is a Telugu cooking recipe narration. "
    "Telugu cooking vocabulary: {glossary}"
)


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using gpt-4o-transcribe with language='te'.
    Passes a cooking glossary as initial_prompt so the model spells
    Telugu terms correctly (e.g. 'konchem' not 'konjam').
    """
    client = OpenAI()
    prompt = _WHISPER_PREFIX.format(glossary=build_glossary_hint())
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=f,
            language="te",
            initial_prompt=prompt,
        )
    return transcript.text
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_transcribe.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add tools/transcribe.py tests/test_transcribe.py
git commit -m "[Add] [tools]: inject Telugu glossary into Whisper initial_prompt"
```

---

### Chunk A.3 — Inject glossary into translate prompt + fix "konjam" → "konchem"

Files:
- Modify: `prompts/translate.py`
- Modify: `tests/test_translate.py`

**Step 1: Update the test first (test now checks glossary injection, not hardcoded string)**
```python
# tests/test_translate.py — replace test_system_prompt_forbids_normalization:

def test_system_prompt_forbids_normalization(self):
    """build_translate_system() must instruct model to preserve vague quantities."""
    from prompts.translate import build_translate_system
    system = build_translate_system()
    assert "normalize" in system.lower() or "do not" in system.lower()
    assert "vague" in system.lower() or "preserve" in system.lower()

def test_system_prompt_includes_glossary(self):
    """build_translate_system() injects the Telugu cooking glossary."""
    from prompts.translate import build_translate_system
    system = build_translate_system()
    assert "konchem" in system.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_translate.py -v
# Expected: FAILED — ImportError on build_translate_system
```

**Step 3: Minimal implementation**
```python
# prompts/translate.py
from prompts.llm import LLMProvider
from tools.glossary import build_glossary_hint

_TRANSLATE_BASE = (
    "You are a faithful translator. Translate this Telugu recipe narration to English. "
    "Preserve vague quantities verbatim: words like 'konchem' (a little), 'koddiga', "
    "'to taste', 'until it smells right', 'enough', 'chaalu' must appear in the "
    "translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information.\n\n"
    "Telugu cooking glossary for reference:\n{glossary}"
)


def build_translate_system() -> str:
    """Build the translation system prompt with the current glossary injected."""
    return _TRANSLATE_BASE.format(glossary=build_glossary_hint())


# Module-level constant kept for backward compatibility (tests that import TRANSLATE_SYSTEM)
TRANSLATE_SYSTEM = build_translate_system()


def translate_to_english(transcript: str, provider: LLMProvider) -> str:
    """Call A: faithfully translate a raw Telugu transcript to English."""
    return provider.generate(system=build_translate_system(), user=transcript)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_translate.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add prompts/translate.py tests/test_translate.py
git commit -m "[Fix] [prompts]: replace hardcoded 'konjam' with dynamic glossary injection in translate system prompt"
```

---

## Block B — Pipeline Package

### Chunk B.1 — Pipeline models (typed dataclasses)

Files:
- Create: `pipeline/__init__.py`
- Create: `pipeline/models.py`
- Create: `tests/test_pipeline_models.py`

**Step 1: Failing test**
```python
# tests/test_pipeline_models.py
from pipeline.models import TranscriptResult, RecipeData, SavedRecipe

class TestTranscriptResult:
    def test_fields(self):
        t = TranscriptResult(raw="raw", english="eng")
        assert t.raw == "raw"
        assert t.english == "eng"

class TestRecipeData:
    def test_fields(self):
        r = RecipeData(
            dish_name="Pesarattu",
            ingredients=[{"item": "moong dal", "quantity": "1 cup"}],
            steps=["Soak dal", "Grind"],
            cook_notes="konchem salt",
            review_flags=[],
            transcript_raw="raw",
            transcript_english="eng",
        )
        assert r.dish_name == "Pesarattu"
        assert r.image_url == ""  # default

class TestSavedRecipe:
    def test_fields(self):
        s = SavedRecipe(id="uuid-123", token="tok", audio_url="https://example.com/a.webm")
        assert s.id == "uuid-123"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_pipeline_models.py -v
# Expected: FAILED — ModuleNotFoundError
```

**Step 3: Minimal implementation**

`pipeline/__init__.py` — empty

`pipeline/models.py`:
```python
"""
Pipeline stage interfaces.

Each stage transforms one model into the next:

  audio_path: str
      └─ Stage 1 (transcribe)  → TranscriptResult
          └─ Stage 2 (transform) → RecipeData
              └─ Stage 3 (persist)   → SavedRecipe
"""
from dataclasses import dataclass, field


@dataclass
class TranscriptResult:
    """Output of Stage 1: Whisper transcription."""
    raw: str      # Verbatim Whisper output
    english: str  # Faithful English translation (Call A)


@dataclass
class RecipeData:
    """Output of Stage 2: structured recipe ready for human review."""
    dish_name: str
    ingredients: list          # [{"item": str, "quantity": str}]
    steps: list                # ["step text", ...]
    cook_notes: str
    review_flags: list         # ["possible implied step: drain water"]
    transcript_raw: str
    transcript_english: str
    image_url: str = ""        # populated post-structure by image stage


@dataclass
class SavedRecipe:
    """Output of Stage 3: Supabase insert result."""
    id: str
    token: str
    audio_url: str
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_pipeline_models.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add pipeline/__init__.py pipeline/models.py tests/test_pipeline_models.py
git commit -m "[Add] [pipeline]: typed dataclass models for TranscriptResult, RecipeData, SavedRecipe"
```

---

### Chunk B.2 — Pipeline Stage 1 (transcribe) + Stage 2 (transform)

Files:
- Create: `pipeline/transcribe.py`
- Create: `pipeline/transform.py`
- Create: `tests/test_pipeline_stages.py`

**Step 1: Failing test**
```python
# tests/test_pipeline_stages.py
from unittest.mock import MagicMock, patch, mock_open
from pipeline.transcribe import run_transcribe
from pipeline.transform import run_transform
from pipeline.models import TranscriptResult, RecipeData


def _provider(text):
    m = MagicMock()
    m.generate.return_value = text
    return m


class TestRunTranscribe:
    def test_returns_transcript_result(self):
        mock_tr = MagicMock()
        mock_tr.text = "ఇది ఒక రెసిపీ"

        with patch("pipeline.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio")):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
            # also mock translate
            with patch("pipeline.transcribe.translate_to_english", return_value="This is a recipe"):
                result = run_transcribe("test.m4a")

        assert isinstance(result, TranscriptResult)
        assert result.raw == "ఇది ఒక రెసిపీ"
        assert result.english == "This is a recipe"

    def test_passes_provider_to_translate(self):
        mock_tr = MagicMock()
        mock_tr.text = "raw"

        with patch("pipeline.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio")):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_tr
            with patch("pipeline.transcribe.translate_to_english", return_value="eng") as mock_translate:
                p = _provider("eng")
                run_transcribe("test.m4a", provider=p)
                assert mock_translate.call_args[0][1] is p


class TestRunTransform:
    def test_returns_recipe_data(self):
        transcript = TranscriptResult(raw="raw", english="eng")
        structured_json = '{"dish_name": "Pesarattu", "ingredients": [], "steps": [], "cook_notes": "", "review_flags": []}'

        p = _provider(structured_json)
        with patch("pipeline.transform.structure_recipe", return_value={
            "dish_name": "Pesarattu", "ingredients": [], "steps": [], "cook_notes": "", "review_flags": []
        }):
            result = run_transform(transcript, p)

        assert isinstance(result, RecipeData)
        assert result.dish_name == "Pesarattu"
        assert result.transcript_raw == "raw"
        assert result.transcript_english == "eng"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_pipeline_stages.py -v
# Expected: FAILED — ModuleNotFoundError
```

**Step 3: Minimal implementation**

`pipeline/transcribe.py`:
```python
"""
Stage 1: Audio → TranscriptResult.
Calls Whisper for raw transcript, then LLM for faithful English translation.
"""
from tools.transcribe import transcribe_audio
from tools.config import load_config
from prompts.translate import translate_to_english
from prompts.llm import LLMProvider, OpenAIProvider
from pipeline.models import TranscriptResult


def run_transcribe(audio_path: str, provider: LLMProvider | None = None) -> TranscriptResult:
    """
    Stage 1: transcribe audio and faithfully translate to English.

    Args:
        audio_path: path to audio file (any format Whisper accepts)
        provider:   LLM provider for translation. Defaults to OpenAIProvider from config.

    Returns:
        TranscriptResult with raw Telugu transcript and English translation.
    """
    if provider is None:
        config = load_config()
        provider = OpenAIProvider(model=config["llm"]["model"])

    raw = transcribe_audio(audio_path)
    english = translate_to_english(raw, provider)
    return TranscriptResult(raw=raw, english=english)
```

`pipeline/transform.py`:
```python
"""
Stage 2: TranscriptResult → RecipeData.
Calls LLM to extract structured recipe fields from the English translation.
"""
from tools.config import load_config
from prompts.structure import structure_recipe
from prompts.llm import LLMProvider, OpenAIProvider
from pipeline.models import TranscriptResult, RecipeData


def run_transform(transcript: TranscriptResult, provider: LLMProvider | None = None) -> RecipeData:
    """
    Stage 2: extract structured recipe fields from the English transcript.

    Args:
        transcript: output of run_transcribe()
        provider:   LLM provider. Defaults to OpenAIProvider from config.

    Returns:
        RecipeData with all fields populated, image_url = "" (set in serve.py).
    """
    if provider is None:
        config = load_config()
        provider = OpenAIProvider(model=config["llm"]["model"])

    structured = structure_recipe(transcript.english, provider)
    return RecipeData(
        dish_name=structured.get("dish_name", ""),
        ingredients=structured.get("ingredients", []),
        steps=structured.get("steps", []),
        cook_notes=structured.get("cook_notes", ""),
        review_flags=structured.get("review_flags", []),
        transcript_raw=transcript.raw,
        transcript_english=transcript.english,
    )
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_pipeline_stages.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add pipeline/transcribe.py pipeline/transform.py tests/test_pipeline_stages.py
git commit -m "[Add] [pipeline]: Stage 1 (transcribe) and Stage 2 (transform) with typed interfaces"
```

---

### Chunk B.3 — Pipeline Stage 3 (persist) + refactor capture.py

Files:
- Create: `pipeline/persist.py`
- Modify: `scripts/capture.py`
- Modify: `tests/test_capture.py`

**Step 1: Failing test for persist**
```python
# Add to tests/test_capture.py (new class):

class TestRunPersist:
    def test_returns_saved_recipe(self, tmp_path):
        from pipeline.persist import run_persist
        from pipeline.models import RecipeData, SavedRecipe

        recipe = RecipeData(
            dish_name="Pesarattu",
            ingredients=[],
            steps=[],
            cook_notes="",
            review_flags=[],
            transcript_raw="raw",
            transcript_english="eng",
        )

        with patch("pipeline.persist.upload_audio", return_value="audio/test.webm"), \
             patch("pipeline.persist.insert_recipe", return_value={"id": "u1", "token": "t1"}):
            result = run_persist(recipe, audio_path=str(tmp_path / "test.webm"), audio_filename="test.webm")

        assert isinstance(result, SavedRecipe)
        assert result.id == "u1"
        assert result.token == "t1"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_capture.py::TestRunPersist -v
```

**Step 3: Minimal implementation**

`pipeline/persist.py`:
```python
"""
Stage 3: RecipeData + audio → SavedRecipe.
Uploads audio to Supabase Storage and inserts the recipe row.
"""
from tools.storage import upload_audio, insert_recipe
from pipeline.models import RecipeData, SavedRecipe


def run_persist(
    recipe: RecipeData,
    audio_path: str,
    audio_filename: str,
    narrator: str = "Grandma",
    user_id: str = "",
    recorded_by_email: str = "",
    recorded_by_name: str = "",
) -> SavedRecipe:
    """
    Stage 3: upload audio and insert recipe to Supabase.

    Args:
        recipe:            structured recipe from run_transform()
        audio_path:        local path to temp audio file
        audio_filename:    desired filename in Supabase Storage
        narrator:          who narrated (default "Grandma")
        user_id:           Supabase auth user id (empty for unauthenticated)
        recorded_by_email: user email
        recorded_by_name:  user display name

    Returns:
        SavedRecipe with id, token, and audio_url.
    """
    stored_path = ""
    try:
        stored_path = upload_audio(audio_path, audio_filename)
    except Exception as e:
        print(f"[pipeline/persist] Audio upload failed (non-fatal): {e}")

    row = {
        "dish_name": recipe.dish_name,
        "ingredients": recipe.ingredients,
        "steps": recipe.steps,
        "cook_notes": recipe.cook_notes,
        "review_flags": recipe.review_flags,
        "transcript_raw": recipe.transcript_raw,
        "transcript_english": recipe.transcript_english,
        "image_url": recipe.image_url,
        "audio_url": stored_path,
        "narrator": narrator,
        "user_id": user_id,
        "recorded_by_email": recorded_by_email,
        "recorded_by_name": recorded_by_name,
    }
    saved = insert_recipe(row)
    return SavedRecipe(
        id=saved.get("id", ""),
        token=saved.get("token", ""),
        audio_url=stored_path,
    )
```

Update `scripts/capture.py` to use pipeline stages:
```python
# scripts/capture.py — refactored to delegate to pipeline stages
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_capture.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add pipeline/persist.py scripts/capture.py tests/test_capture.py
git commit -m "[Add] [pipeline]: Stage 3 persist + refactor capture.py to delegate to pipeline stages"
```

---

### Chunk B.4 — Thin serve.py (HTTP adapter only)

Files:
- Modify: `scripts/serve.py`

No new tests needed — existing endpoint tests in test_capture.py cover behaviour.
serve.py changes are structural (delegating to pipeline modules), not behavioural.

**Changes:**
- `/capture` endpoint: calls `run_transcribe()` + `run_transform()` + image + `run_persist()` — no inline logic
- `/capture/process` endpoint: calls `run_transcribe()` + `run_transform()` + image only
- `/capture/save` endpoint: calls `run_persist()` with user-edited RecipeData

**Step: Commit**
```bash
git add scripts/serve.py
git commit -m "[Refactor] [serve]: serve.py as thin HTTP adapter — delegate all pipeline logic to pipeline/ package"
```

---

## Block C — Wizard UI

### Chunk C.1 — Grandma spinner + saving animation + CSS variables

Files:
- Modify: `web/app.html`

Replace the flat review screen and add:
- CSS custom properties for wizard (step indicators, card styles, badge)
- Grandma brand icon spinner with dual rings (same as prototype)
- `SAVING_MESSAGES` array + rotation logic
- Show/hide loading overlay on submit + on save

**Step: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: grandma spinner loader + rotating saving messages for review flow"
```

---

### Chunk C.2 — 3-step wizard replacing flat review screen

Files:
- Modify: `web/app.html`

Replace `screen-review` flat form with:
- Step 1: Dish name + audio playback + transcript (with confidence chip)
- Step 2: Ingredients editor (amber flags + add/remove)
- Step 3: Steps + cook notes editor + "💾 Save Forever" button
- Progress bar + step dots navigation
- "Preserved forever 🤍" save confirmation screen with brand icon
- "↩ Retake recording" instead of "Discard"
- Family recipe badge: "Family recipes are treasures — give it one last look."

**Step: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: 3-step wizard review screen replaces flat form"
```

---

## Completion gate

- [ ] A.1 — Glossary YAML + loader ✓
- [ ] A.2 — Whisper initial_prompt injection ✓
- [ ] A.3 — Translate prompt glossary injection + fix konchem ✓
- [ ] B.1 — Pipeline models ✓
- [ ] B.2 — Stage 1 + Stage 2 ✓
- [ ] B.3 — Stage 3 + capture.py refactor ✓
- [ ] B.4 — Thin serve.py ✓
- [ ] C.1 — Spinner + saving messages ✓
- [ ] C.2 — 3-step wizard ✓
