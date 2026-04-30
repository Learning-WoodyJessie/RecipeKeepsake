# RecipeKeepsake — Core Pipeline Build Plan

**Goal:** Build the Phase 0 CLI pipeline: audio → Whisper → translate → structure → Supabase.
**Layer:** Python tools + prompts + orchestrator
**Architecture:** Six discrete modules, each with a single responsibility. LLMProvider ABC decouples prompt logic from the OpenAI client so tests can pass a MagicMock instead of the real thing.
**Design doc:** `docs/plans/2026-04-29-core-pipeline-design.md`

---

## Two-phase development approach

```
Phase 1 — Mock phase (Blocks 0–6)
  Build every module test-first using fake stand-ins for OpenAI and Supabase.
  Proves: the wiring is correct (data flows through the pipeline as designed).
  Cost: $0. Time: < 1 second per test run.

Phase 2 — Swap phase (Block 7)
  Replace mocks with real API calls. Run the pipeline on an actual audio file.
  Proves: the prompts work on real Telugu narration.
  Cost: ~$0.05 per run. Requires OPENAI_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY.
```

**Rule:** Never skip Phase 1 to get to Phase 2 faster. A pipeline that doesn't pass mocked tests will waste money on real API calls debugging wiring bugs.

---

## Block 0 — Project scaffold

No RED-GREEN cycle. Pure setup — creates the skeleton everything else builds on.

#### Chunk 0.1 — requirements.txt + config.yaml + __init__.py files

Files:
- Create: `requirements.txt`
- Create: `data/config.yaml`
- Create: `tools/__init__.py`
- Create: `prompts/__init__.py`
- Create: `scripts/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

**requirements.txt**
```
openai>=1.0.0
supabase>=2.0.0
pyyaml>=6.0
pytest>=7.0.0
```

**data/config.yaml**
```yaml
llm:
  provider: openai
  model: gpt-4o

whisper:
  model: whisper-1
  language: te

supabase:
  table: recipes
```

**tests/conftest.py** — shared mock builder used across all test files
```python
from unittest.mock import MagicMock

def provider(response_text: str):
    """Build a mock LLMProvider that returns response_text from .generate()."""
    mock = MagicMock()
    mock.generate.return_value = response_text
    return mock
```

**Commit:**
```bash
git add requirements.txt data/config.yaml tools/__init__.py prompts/__init__.py scripts/__init__.py tests/__init__.py tests/conftest.py
git commit -m "[Add] [scaffold]: requirements, config, package init files, conftest"
```

---

## Block 1 — LLM Provider

#### Chunk 1.1 — `prompts/llm.py` + `tests/test_llm.py`

Files:
- Create: `prompts/llm.py`
- Create: `tests/test_llm.py`

**Step 1: Failing test**
```python
# tests/test_llm.py
from unittest.mock import MagicMock, patch
from prompts.llm import LLMProvider, OpenAIProvider

class TestLLMProvider:
    def test_is_abstract(self):
        """LLMProvider cannot be instantiated directly."""
        import pytest
        with pytest.raises(TypeError):
            LLMProvider()

class TestOpenAIProvider:
    def test_generate_returns_string(self):
        """generate() calls the OpenAI chat API and returns content string."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "translated text"

        with patch("prompts.llm.OpenAI") as mock_openai:
            mock_openai.return_value.chat.completions.create.return_value = mock_response
            provider = OpenAIProvider(model="gpt-4o")
            result = provider.generate(system="sys prompt", user="user input")

        assert result == "translated text"

    def test_generate_passes_correct_messages(self):
        """generate() sends system + user messages in the right structure."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "result"

        with patch("prompts.llm.OpenAI") as mock_openai:
            mock_client = mock_openai.return_value
            mock_client.chat.completions.create.return_value = mock_response
            provider = OpenAIProvider(model="gpt-4o")
            provider.generate(system="be a chef", user="translate this")

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            messages = call_kwargs["messages"]

        assert messages[0] == {"role": "system", "content": "be a chef"}
        assert messages[1] == {"role": "user", "content": "translate this"}
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_llm.py -v
# Expected: ModuleNotFoundError — prompts/llm.py doesn't exist yet
```

**Step 3: Minimal implementation**
```python
# prompts/llm.py
from abc import ABC, abstractmethod
from openai import OpenAI

class LLMProvider(ABC):
    @abstractmethod
    def generate(self, system: str, user: str) -> str: ...

class OpenAIProvider(LLMProvider):
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = OpenAI()
        return self._client

    def generate(self, system: str, user: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_llm.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add prompts/llm.py tests/test_llm.py
git commit -m "[Add] [prompts]: LLMProvider ABC and OpenAIProvider"
```

---

## Block 2 — Transcribe tool

#### Chunk 2.1 — `tools/transcribe.py` + `tests/test_transcribe.py`

Files:
- Create: `tools/transcribe.py`
- Create: `tests/test_transcribe.py`

**Step 1: Failing test**
```python
# tests/test_transcribe.py
from unittest.mock import patch, MagicMock, mock_open
from tools.transcribe import transcribe_audio

class TestTranscribeAudio:
    def test_returns_transcript_text(self):
        """transcribe_audio() calls Whisper and returns the .text field."""
        mock_transcript = MagicMock()
        mock_transcript.text = "ఇది ఒక రెసిపీ"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_openai.return_value.audio.transcriptions.create.return_value = mock_transcript
            result = transcribe_audio("test.m4a")

        assert result == "ఇది ఒక రెసిపీ"

    def test_uses_telugu_language_code(self):
        """transcribe_audio() always passes language='te' to Whisper."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert call_kwargs["language"] == "te"

    def test_uses_whisper_1_model(self):
        """transcribe_audio() uses the whisper-1 model."""
        mock_transcript = MagicMock()
        mock_transcript.text = "some text"

        with patch("tools.transcribe.OpenAI") as mock_openai, \
             patch("builtins.open", mock_open(read_data=b"audio bytes")):
            mock_client = mock_openai.return_value
            mock_client.audio.transcriptions.create.return_value = mock_transcript
            transcribe_audio("test.m4a")

            call_kwargs = mock_client.audio.transcriptions.create.call_args[1]

        assert call_kwargs["model"] == "whisper-1"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_transcribe.py -v
# Expected: ModuleNotFoundError
```

**Step 3: Minimal implementation**
```python
# tools/transcribe.py
from openai import OpenAI

def transcribe_audio(audio_path: str) -> str:
    """Call Whisper API with language='te'. Returns raw transcript text."""
    client = OpenAI()
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language="te",
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
git commit -m "[Add] [tools]: transcribe_audio with Whisper whisper-1, language=te"
```

---

## Block 3 — Translate prompt (Call A)

#### Chunk 3.1 — `prompts/translate.py` + `tests/test_translate.py`

Files:
- Create: `prompts/translate.py`
- Create: `tests/test_translate.py`

**Step 1: Failing test**
```python
# tests/test_translate.py
import pytest
from unittest.mock import MagicMock
from prompts.translate import translate_to_english, TRANSLATE_SYSTEM

def _provider(text):
    mock = MagicMock()
    mock.generate.return_value = text
    return mock

class TestTranslateToEnglish:
    def test_returns_provider_output(self):
        """translate_to_english() returns whatever the provider generates."""
        p = _provider("Add a little oil and fry until it smells right.")
        result = translate_to_english("కొంచెం నూనె వేసి వేయించాలి", p)
        assert result == "Add a little oil and fry until it smells right."

    def test_passes_transcript_as_user_message(self):
        """translate_to_english() sends the raw transcript as the user message."""
        p = _provider("result")
        translate_to_english("raw telugu text", p)
        p.generate.assert_called_once()
        _, kwargs = p.generate.call_args
        assert kwargs.get("user", p.generate.call_args[0][1] if len(p.generate.call_args[0]) > 1 else None) == "raw telugu text" or \
               p.generate.call_args[0][1] == "raw telugu text"

    def test_system_prompt_forbids_normalization(self):
        """TRANSLATE_SYSTEM prompt must mention vague term preservation."""
        assert "konjam" in TRANSLATE_SYSTEM.lower() or "vague" in TRANSLATE_SYSTEM.lower()
        assert "normalize" in TRANSLATE_SYSTEM.lower() or "do not" in TRANSLATE_SYSTEM.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_translate.py -v
```

**Step 3: Minimal implementation**
```python
# prompts/translate.py
from prompts.llm import LLMProvider

TRANSLATE_SYSTEM = (
    "You are a faithful translator. Translate this Telugu recipe narration to English. "
    "Preserve vague quantities verbatim: words like 'konjam', 'a little', 'to taste', "
    "'until it smells right', 'enough' must appear in the translation exactly as-is. "
    "Do not normalize or invent measurements. Do not add or remove any information."
)

def translate_to_english(transcript: str, provider: LLMProvider) -> str:
    """Call A: faithfully translate a raw Telugu transcript to English."""
    return provider.generate(system=TRANSLATE_SYSTEM, user=transcript)
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_translate.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add prompts/translate.py tests/test_translate.py
git commit -m "[Add] [prompts]: translate_to_english — Call A, faithful Telugu→English"
```

---

## Block 4 — Structure prompt (Call B)

#### Chunk 4.1 — `prompts/structure.py` + `tests/test_structure.py`

Files:
- Create: `prompts/structure.py`
- Create: `tests/test_structure.py`

**Step 1: Failing test**
```python
# tests/test_structure.py
import json
import pytest
from unittest.mock import MagicMock
from prompts.structure import structure_recipe, STRUCTURE_SYSTEM

def _provider(json_dict: dict):
    mock = MagicMock()
    mock.generate.return_value = json.dumps(json_dict)
    return mock

_SAMPLE = {
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal for 4 hours.", "Grind to a smooth batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": ["Possible implied step: drain water after soaking"],
}

class TestStructureRecipe:
    def test_returns_dict(self):
        """structure_recipe() returns a dict parsed from the provider's JSON."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        assert isinstance(result, dict)

    def test_preserves_all_fields(self):
        """All schema fields are present in the returned dict."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        for key in ("dish_name", "ingredients", "steps", "cook_notes", "review_flags"):
            assert key in result

    def test_ingredients_are_list_of_dicts(self):
        """ingredients is a list of {item, quantity} dicts."""
        result = structure_recipe("some english text", _provider(_SAMPLE))
        assert isinstance(result["ingredients"], list)
        assert "item" in result["ingredients"][0]
        assert "quantity" in result["ingredients"][0]

    def test_strips_markdown_code_fences(self):
        """structure_recipe() handles ```json ... ``` wrapped output."""
        mock = MagicMock()
        mock.generate.return_value = f"```json\n{json.dumps(_SAMPLE)}\n```"
        result = structure_recipe("some text", mock)
        assert result["dish_name"] == "Pesarattu"

    def test_system_prompt_forbids_normalization(self):
        """STRUCTURE_SYSTEM must tell the model to put vague quantities in cook_notes."""
        assert "cook_notes" in STRUCTURE_SYSTEM
        assert "vague" in STRUCTURE_SYSTEM.lower() or "konjam" in STRUCTURE_SYSTEM.lower()
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_structure.py -v
```

**Step 3: Minimal implementation**
```python
# prompts/structure.py
import json
from prompts.llm import LLMProvider

STRUCTURE_SYSTEM = """Extract a structured recipe from this English narration.
Output valid JSON only — no prose before or after, no markdown fences.

Schema:
{
  "dish_name": "string or null",
  "ingredients": [{"item": "string", "quantity": "string"}],
  "steps": ["string"],
  "cook_notes": "string",
  "review_flags": ["string"]
}

Rules:
- steps must be in cooking order even if narrated non-linearly
- where quantity is vague (a little, konjam, to taste, enough, until it smells right),
  put the full instruction verbatim in cook_notes — NOT in ingredients quantity field
- review_flags: list any implied steps or ambiguous instructions needing human review
- if dish_name is not stated, infer from context; if truly unknown, use null"""

def structure_recipe(english_text: str, provider: LLMProvider) -> dict:
    """Call B: extract structured recipe dict from English narration text."""
    raw = provider.generate(system=STRUCTURE_SYSTEM, user=english_text)
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
python -m pytest tests/test_structure.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add prompts/structure.py tests/test_structure.py
git commit -m "[Add] [prompts]: structure_recipe — Call B, JSON extraction with vague-term preservation"
```

---

## Block 5 — Storage tool

#### Chunk 5.1 — `tools/storage.py` + `tests/test_storage.py`

Files:
- Create: `tools/storage.py`
- Create: `tests/test_storage.py`

**Step 1: Failing test**
```python
# tests/test_storage.py
import os
import pytest
from unittest.mock import patch, MagicMock
from tools.storage import insert_recipe, get_recipe_by_token

def _mock_supabase(return_data):
    mock_client = MagicMock()
    mock_client.table.return_value.insert.return_value.execute.return_value.data = [return_data]
    mock_client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = return_data
    return mock_client

class TestInsertRecipe:
    def test_returns_inserted_row(self, monkeypatch):
        """insert_recipe() returns the first element of result.data."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = {"id": "abc-123", "dish_name": "Pesarattu"}

        with patch("tools.storage.create_client", return_value=_mock_supabase(expected)):
            result = insert_recipe({"dish_name": "Pesarattu"})

        assert result == expected

    def test_inserts_into_recipes_table(self, monkeypatch):
        """insert_recipe() targets the 'recipes' table."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        mock_client = _mock_supabase({"id": "abc"})

        with patch("tools.storage.create_client", return_value=mock_client):
            insert_recipe({"dish_name": "Pesarattu"})

        mock_client.table.assert_called_with("recipes")

class TestGetRecipeByToken:
    def test_returns_recipe_data(self, monkeypatch):
        """get_recipe_by_token() returns result.data for the matching token."""
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "fake-key")
        expected = {"id": "abc-123", "token": "tok-xyz", "dish_name": "Pesarattu"}

        with patch("tools.storage.create_client", return_value=_mock_supabase(expected)):
            result = get_recipe_by_token("tok-xyz")

        assert result == expected
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_storage.py -v
```

**Step 3: Minimal implementation**
```python
# tools/storage.py
import os
from supabase import create_client, Client

def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)

def insert_recipe(recipe: dict) -> dict:
    """Insert a recipe row into Supabase. Returns the saved row with id + token."""
    result = _client().table("recipes").insert(recipe).execute()
    return result.data[0]

def get_recipe_by_token(token: str) -> dict:
    """Fetch a single recipe by its share token."""
    result = (
        _client().table("recipes").select("*").eq("token", token).single().execute()
    )
    return result.data
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_storage.py -v
python -m pytest tests/ -v
```

**Step 5: Commit**
```bash
git add tools/storage.py tests/test_storage.py
git commit -m "[Add] [tools]: storage — insert_recipe and get_recipe_by_token via Supabase"
```

---

## Block 6 — Capture orchestrator

#### Chunk 6.1 — `scripts/capture.py` + `tests/test_capture.py`

Files:
- Create: `scripts/capture.py`
- Create: `tests/test_capture.py`

**Step 1: Failing test**
```python
# tests/test_capture.py
import pytest
from unittest.mock import patch, MagicMock
from scripts.capture import capture

_STRUCTURED = {
    "dish_name": "Pesarattu",
    "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
    "steps": ["Soak moong dal.", "Grind to batter."],
    "cook_notes": "Add oil until it smells right.",
    "review_flags": [],
}
_STORED = {**_STRUCTURED, "id": "uuid-123", "token": "tok-abc",
           "audio_url": "https://storage/audio.m4a",
           "transcript_raw": "raw telugu",
           "transcript_english": "english translation"}

class TestCapture:
    def test_returns_stored_recipe(self):
        """capture() returns the Supabase-saved recipe dict."""
        with patch("scripts.capture.transcribe_audio", return_value="raw telugu"), \
             patch("scripts.capture.translate_to_english", return_value="english translation"), \
             patch("scripts.capture.structure_recipe", return_value=_STRUCTURED), \
             patch("scripts.capture.insert_recipe", return_value=_STORED), \
             patch("scripts.capture.OpenAIProvider"):
            result = capture("audio.m4a", "https://storage/audio.m4a")

        assert result["id"] == "uuid-123"
        assert result["dish_name"] == "Pesarattu"

    def test_pipeline_order(self):
        """capture() calls transcribe → translate → structure → insert in order."""
        call_order = []

        with patch("scripts.capture.transcribe_audio",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or "raw") as mock_t, \
             patch("scripts.capture.translate_to_english",
                   side_effect=lambda *a, **k: call_order.append("translate") or "english") as mock_tr, \
             patch("scripts.capture.structure_recipe",
                   side_effect=lambda *a, **k: call_order.append("structure") or _STRUCTURED) as mock_s, \
             patch("scripts.capture.insert_recipe",
                   side_effect=lambda *a, **k: call_order.append("insert") or _STORED) as mock_i, \
             patch("scripts.capture.OpenAIProvider"):
            capture("audio.m4a", "https://storage/audio.m4a")

        assert call_order == ["transcribe", "translate", "structure", "insert"]

    def test_audio_url_stored_in_recipe(self):
        """capture() includes audio_url in the payload sent to insert_recipe."""
        with patch("scripts.capture.transcribe_audio", return_value="raw"), \
             patch("scripts.capture.translate_to_english", return_value="english"), \
             patch("scripts.capture.structure_recipe", return_value=_STRUCTURED), \
             patch("scripts.capture.insert_recipe", return_value=_STORED) as mock_insert, \
             patch("scripts.capture.OpenAIProvider"):
            capture("audio.m4a", "https://storage/audio.m4a")

        inserted = mock_insert.call_args[0][0]
        assert inserted["audio_url"] == "https://storage/audio.m4a"
        assert inserted["transcript_raw"] == "raw"
        assert inserted["transcript_english"] == "english"
```

**Step 2: Watch it fail**
```bash
python -m pytest tests/test_capture.py -v
```

**Step 3: Minimal implementation**
```python
# scripts/capture.py
from pathlib import Path
import yaml

from tools.transcribe import transcribe_audio
from prompts.translate import translate_to_english
from prompts.structure import structure_recipe
from prompts.llm import OpenAIProvider
from tools.storage import insert_recipe

_CONFIG_PATH = Path(__file__).parent.parent / "data" / "config.yaml"

def _load_config() -> dict:
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)

def capture(audio_path: str, audio_url: str) -> dict:
    """
    Orchestrate the full pipeline:
    audio file → Whisper → translate → structure → Supabase insert.
    Returns the saved recipe row.
    """
    config = _load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    print("Transcribing...")
    transcript_raw = transcribe_audio(audio_path)

    print("Translating...")
    transcript_english = translate_to_english(transcript_raw, provider)

    print("Structuring...")
    structured = structure_recipe(transcript_english, provider)

    recipe = {
        "audio_url": audio_url,
        "transcript_raw": transcript_raw,
        "transcript_english": transcript_english,
        **structured,
    }

    print("Storing...")
    return insert_recipe(recipe)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python -m scripts.capture <audio_path> <audio_url>")
        sys.exit(1)
    result = capture(sys.argv[1], sys.argv[2])
    print(f"\nRecipe saved!")
    print(f"  ID:    {result.get('id')}")
    print(f"  Dish:  {result.get('dish_name')}")
    print(f"  Token: {result.get('token')}")
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_capture.py -v
python -m pytest tests/ -v   # all blocks green
```

**Step 5: Commit**
```bash
git add scripts/capture.py tests/test_capture.py
git commit -m "[Add] [scripts]: capture orchestrator — full audio→Supabase pipeline"
```

---

---

## Block 7 — Real swap (end-to-end smoke test)

Run only after all mocked tests in Blocks 0–6 pass. This is where you validate the prompts, not the wiring.

#### Chunk 7.1 — Set up .env and install deps

```bash
# Install dependencies
pip install -r requirements.txt

# Create .env with real credentials (never commit this file)
cat > .env << 'EOF'
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
EOF
```

Make sure `.env` is in `.gitignore`:
```bash
echo ".env" >> .gitignore
```

#### Chunk 7.2 — Create the Supabase table

Run this SQL in the Supabase dashboard → SQL Editor:

```sql
CREATE TABLE recipes (
  id                  uuid primary key default gen_random_uuid(),
  token               text unique default gen_random_uuid()::text,
  dish_name           text,
  narrator            text default 'Grandma',
  language            text default 'te',
  recorded_at         timestamptz default now(),
  audio_url           text,
  transcript_raw      text,
  transcript_english  text,
  ingredients         jsonb,
  steps               jsonb,
  cook_notes          text,
  review_flags        jsonb,
  reviewed            boolean default false,
  shared_at           timestamptz
);
```

#### Chunk 7.3 — Smoke test each layer individually

Test Whisper first (cheapest, ~$0.006/min of audio):
```bash
# Drop a short test audio file at data/test_audio.m4a first
source .env
python -c "
from tools.transcribe import transcribe_audio
result = transcribe_audio('data/test_audio.m4a')
print('RAW TRANSCRIPT:')
print(result)
"
```

What to check: Does Whisper preserve Telugu words correctly? Are English words (ingredient names like "oil") kept as-is?

Test Call A (translate):
```bash
python -c "
from prompts.llm import OpenAIProvider
from prompts.translate import translate_to_english
provider = OpenAIProvider()
# Paste your actual Whisper output here
raw = 'కొంచెం నూనె వేసి, వేడి అయ్యాక వేయించాలి'
result = translate_to_english(raw, provider)
print('ENGLISH TRANSLATION:')
print(result)
"
```

What to check: Are vague words like "కొంచెం" (konjam) preserved as "a little" rather than "1 tsp"?

Test Call B (structure):
```bash
python -c "
from prompts.llm import OpenAIProvider
from prompts.structure import structure_recipe
import json
provider = OpenAIProvider()
english = 'Add a little oil. Once hot, add mustard seeds. When they splutter, add onions and fry until soft.'
result = structure_recipe(english, provider)
print('STRUCTURED RECIPE:')
print(json.dumps(result, indent=2))
"
```

What to check: Are steps in cooking order? Is "a little" in `cook_notes`, not normalized to a quantity?

#### Chunk 7.4 — Full pipeline run

Record a real 1–2 minute Telugu narration, upload to Supabase Storage, then run:

```bash
source .env
python -m scripts.capture data/test_audio.m4a "https://your-project.supabase.co/storage/v1/object/public/audio/test_audio.m4a"
```

Expected output:
```
Transcribing...
Translating...
Structuring...
Storing...

Recipe saved!
  ID:    <uuid>
  Dish:  <dish name>
  Token: <share token>
```

#### Chunk 7.5 — Prompt iteration (if needed)

If the output isn't right, the issue is always in one of three places:

| Problem | Likely cause | Fix |
|---|---|---|
| Vague quantities got normalized | Call B prompt not explicit enough | Strengthen `STRUCTURE_SYSTEM` — add more examples |
| Steps are out of order | Call B not reordering | Add explicit instruction + example to `STRUCTURE_SYSTEM` |
| Telugu words garbled | Whisper language detection | Confirm `language="te"` is being passed |
| `dish_name` is null | Grandma didn't say the name | Expected — will appear in `review_flags` |

Iterate on prompts in `prompts/translate.py` and `prompts/structure.py` until output matches the success criteria in the PRD. **Prompt changes do not need new unit tests** — they're validated by real runs.

---

## Completion gate

**Phase 1 (mock):**
- [ ] `python -m pytest tests/ -v` — all tests pass, $0 cost

**Phase 2 (real swap):**
- [ ] Supabase `recipes` table created
- [ ] Whisper correctly transcribes a real Telugu recording
- [ ] Call A preserves vague terms ("konjam", "to taste") verbatim
- [ ] Call B outputs steps in cooking order
- [ ] Full `capture()` run saves a row in Supabase

**Then:**
- [ ] ROADMAP.md Phase 0 checkboxes all ticked
- [ ] Ready for `/audit`
