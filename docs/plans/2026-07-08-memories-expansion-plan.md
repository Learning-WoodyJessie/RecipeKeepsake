# Phase 4 — Memories Expansion Plan

**Goal:** Migrate `recipes` → `memories` table (`dish_name` → `title`), then add song + story support with Whisper + translate (no Call B).  
**Layer:** Multi-layer (Python tools + serve.py + prompts + frontend)  
**Architecture:** Four chunks — (M.1) Python + test sweep, (M.2) frontend sweep, (A.1) add Whisper+translate to /save-audio for non-recipe types, (C.1) memory detail transcript display for song/story. The migration is a rename-in-place (no data loss); the pipeline addition runs Whisper+translate but skips Call B for song/story.  
**Design doc:** `docs/plans/2026-07-08-memories-expansion-design.md`

**Pre-read findings:**
- `/save-audio` (serve.py:683) does NOT call Whisper — stores audio as-is. Chunk A.1 adds transcription for non-recipe types.
- `dish_name` appears at: `tools/storage.py` (8 hits), `tools/groups.py` (2 hits), `pipeline/persist.py` (1 hit), `scripts/serve.py` (13+ hits), `prompts/structure.py` (3 hits), `prompts/image.py` (1 hit), `tests/` (49 hits), `frontend/` (23 hits across 6 files + ReviewWizard.tsx).
- `.table("recipes")` appears in `tools/storage.py` (8 hits), `tools/groups.py` (2 hits), `scripts/serve.py` (1 hit — health check).
- `ReviewWizard.tsx` uses `dish_name` in the `Draft` type and in `save()`.
- No existing function covers "Whisper + translate without Call B" — this is a new code path in `save_audio_endpoint`.
- No `CLOSE_RELATIONSHIPS` logic involved.

**Supabase SQL (user runs in dashboard BEFORE deploying M.1):**
```sql
ALTER TABLE recipes RENAME TO memories;
ALTER TABLE memories RENAME COLUMN dish_name TO title;
```

---

## Chunk M.1 — Python + test migration sweep

**Files:**
- Modify: `tools/storage.py` — `.table("recipes")` → `.table("memories")`, `"dish_name"` → `"title"`
- Modify: `tools/groups.py` — `.table("recipes")` → `.table("memories")`, `dish_name` → `title` in select fields
- Modify: `pipeline/persist.py` — `"dish_name"` → `"title"` in row dict
- Modify: `scripts/serve.py` — all `dish_name` → `title`, `"recipes"` → `"memories"` where table name appears
- Modify: `prompts/structure.py` — `"dish_name"` → `"title"` in JSON schema + system prompt
- Modify: `prompts/image.py` — `dish_name` parameter → `title`
- Modify: `tests/test_storage.py` — `"dish_name"` → `"title"`, table assertion `"recipes"` → `"memories"`
- Modify: `tests/test_persist.py` — `dish_name=` → `title=`
- Modify: `tests/test_groups.py` — `dish_name` → `title` in select field assertions

**Step 1: Identify all hits (confirm before editing)**
```bash
grep -rn "dish_name\|\.table.*recipes\|table.*recipes" \
  tools/storage.py tools/groups.py pipeline/persist.py \
  scripts/serve.py prompts/structure.py prompts/image.py \
  tests/test_storage.py tests/test_persist.py tests/test_groups.py
```

**Step 2: Apply changes — tools/storage.py**

All `.table("recipes")` → `.table("memories")`.  
All `"dish_name"` → `"title"` in select fields and insert dicts.

Key lines to change:
```python
# Before
_client().table("recipes").insert(recipe)
sb.table("recipes").select("id, token, dish_name, narrator, ...")
# After
_client().table("memories").insert(recipe)
sb.table("memories").select("id, token, title, narrator, ...")
```

**Step 3: Apply changes — tools/groups.py**

```python
# Before
sb.table("recipes").select("id, token, dish_name, narrator, ...")
# After
sb.table("memories").select("id, token, title, narrator, ...")
```

**Step 4: Apply changes — pipeline/persist.py**

```python
# Before
"dish_name": recipe.dish_name,
# After
"title": recipe.dish_name,   # field renamed; recipe.dish_name still exists on StructuredRecipe until prompt updated
```

Actually: update `prompts/structure.py` first so the model returns `title` in the JSON schema, then update `persist.py` to write `recipe.title`. Also update `StructuredRecipe` dataclass if one exists.

Check for StructuredRecipe:
```bash
grep -rn "StructuredRecipe\|class Recipe\|dataclass" pipeline/ prompts/ | head -20
```

**Step 5: Apply changes — scripts/serve.py**

```python
# All occurrences:
"dish_name"  →  "title"
recipe.dish_name  →  recipe.title    # if StructuredRecipe attribute
recipe_data.dish_name  →  recipe_data.title
recipe.get("dish_name")  →  recipe.get("title")
dish=recipe_data.dish_name  →  dish=recipe_data.title   # in log lines
```

Also rename the parameter in `generate_dish_image` call sites and in `ImageRequest` model:
```python
# ImageRequest
dish_name: str  →  title: str
# call site
body.dish_name  →  body.title
```

**Step 6: Apply changes — prompts/structure.py**

```python
# JSON schema
"dish_name": "string or null"  →  "title": "string or null"
# System prompt rule
dish_name: use EXACTLY as spoken  →  title: use EXACTLY as spoken
# Example
"dish_name": "Gongura Pachadi"  →  "title": "Gongura Pachadi"
```

**Step 7: Apply changes — prompts/image.py**

```python
# Function signature
def generate_dish_image(dish_name: str, ...)  →  def generate_dish_image(title: str, ...)
# All internal uses
dish_name  →  title
dish_lower = dish_name.lower()  →  dish_lower = title.lower()
```

**Step 8: Apply changes — tests**

```python
# test_storage.py
{"dish_name": "Pesarattu"}  →  {"title": "Pesarattu"}
mock_client.table.assert_called_with("recipes")  →  mock_client.table.assert_called_with("memories")

# test_persist.py
dish_name="Pesarattu"  →  title="Pesarattu"

# test_groups.py
"dish_name" in select field assertion strings  →  "title"
```

**Step 9: Watch it pass**
```bash
python -m pytest tests/ -q
# Expected: 192 passed (same count — no new tests, just renames)
```

**Step 10: Commit**
```bash
git add tools/storage.py tools/groups.py pipeline/persist.py \
        scripts/serve.py prompts/structure.py prompts/image.py \
        tests/test_storage.py tests/test_persist.py tests/test_groups.py
git commit -m "[Refactor] [tools]: rename recipes→memories, dish_name→title across Python layer (Chunk M.1)"
```

---

## Chunk M.2 — Frontend migration sweep

**Files:**
- Modify: `frontend/app/(app)/home/page.tsx` — `dish_name` → `title`
- Modify: `frontend/app/(app)/memories/page.tsx` — `dish_name` → `title`
- Modify: `frontend/app/(app)/memory/page.tsx` — `dish_name` → `title`
- Modify: `frontend/app/family/page.tsx` — `dish_name` → `title`
- Modify: `frontend/app/shared/detail/page.tsx` — `dish_name` → `title`
- Modify: `frontend/app/shared/page.tsx` — `dish_name` → `title`
- Modify: `frontend/components/ReviewWizard.tsx` — `dish_name` in `Draft` type + `save()` + `useState`
- Modify: `frontend/app/(app)/upload/page.tsx` — any `dish_name` references

**Step 1: Confirm all frontend hits**
```bash
grep -rn "dish_name" frontend/ --include="*.tsx" --include="*.ts"
```

**Step 2: Apply rename across all files**

In every file, replace:
- Type field `dish_name: string` → `title: string`  
- Property access `m.dish_name` / `memory.dish_name` / `r.dish_name` → `.title`
- Object literal key `dish_name:` → `title:`
- State init `draft.dish_name` → `draft.title`
- JSON stringify key `"dish_name"` → `"title"`

ReviewWizard.tsx specific changes:
```typescript
// Draft type
dish_name: string  →  title: string

// useState init
const [title, setTitle] = useState(draft.dish_name ?? '')
→
const [title, setTitle] = useState(draft.title ?? '')

// save() function
const recipe = { ...draft, dish_name: title, ... }
→
const recipe = { ...draft, title: title, ... }
```

**Step 3: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: clean build, 20 static routes, 0 TS errors
```

**Step 4: Commit**
```bash
git add frontend/app frontend/components/ReviewWizard.tsx
git commit -m "[Refactor] [frontend]: rename dish_name→title across all pages and ReviewWizard (Chunk M.2)"
```

---

## Chunk A.1 — Add Whisper + translate to /save-audio for non-recipe types

**Context:** `/save-audio` currently stores audio directly with no transcription. For song/story, we want `transcript_raw` and `transcript_english` populated so the memory is searchable and the detail page can show the text. Pipeline: audio file → `run_transcribe()` → `translate_to_english()` → store. No Call B (no structuring). Runs only when audio is provided AND `memory_type != "recipe"`.

**Files:**
- Modify: `scripts/serve.py` — `save_audio_endpoint()` — add transcription branch
- Modify: `tests/test_save_audio.py` (or the existing test file covering save-audio) — add test for transcript population

**Step 1: Find existing save-audio tests**
```bash
grep -rn "save.audio\|save_audio" tests/ | head -20
```

**Step 2: Failing test**

Add to the appropriate test file (create `tests/test_save_audio.py` if none exists):

```python
# tests/test_save_audio.py
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

class TestSaveAudioTranscription:
    def test_song_gets_transcript_when_audio_provided(self, monkeypatch):
        """save-audio endpoint transcribes + translates for song type."""
        # This test verifies the new code path — will FAIL before A.1 is implemented
        from scripts.serve import app
        client = TestClient(app)

        mock_insert = MagicMock(return_value={"id": "1", "token": "tok", "audio_url": "file.mp3"})
        monkeypatch.setattr("tools.storage.insert_recipe", mock_insert)
        monkeypatch.setattr("tools.storage.upload_audio", MagicMock())
        monkeypatch.setattr("tools.storage._sign_audio", MagicMock(return_value="http://signed"))
        monkeypatch.setattr("tools.storage._client", MagicMock())
        monkeypatch.setattr("pipeline.transcribe.run_transcribe", MagicMock(return_value="ఆడిన్ పాట"))
        monkeypatch.setattr("prompts.translate.translate_to_english", MagicMock(return_value="A song we sang"))

        import io
        audio_bytes = io.BytesIO(b"fake audio")
        audio_bytes.name = "song.mp3"

        # ... (auth mock pattern from existing tests)
        row = mock_insert.call_args[0][0]
        assert row["transcript_raw"] == "ఆడిన్ పాట"
        assert row["transcript_english"] == "A song we sang"
```

**Step 3: Minimal implementation**

In `save_audio_endpoint()`, after uploading the audio file and before `insert_recipe`, add:

```python
# Transcribe + translate for non-recipe types when audio provided
transcript_raw_val = original_text.strip()
transcript_english_val = description.strip()

if audio_filename and memory_type != "recipe":
    from pipeline.transcribe import run_transcribe
    from prompts.translate import translate_to_english
    from prompts.llm import OpenAIProvider
    try:
        transcript_raw_val = run_transcribe(tmp_path)
        provider = OpenAIProvider()
        transcript_english_val = translate_to_english(transcript_raw_val, provider)
    except Exception as e:
        _logger.error(f"event=save_audio_transcribe_failed error={type(e).__name__} msg={e}")
        # Non-fatal — save continues with empty transcript

row = insert_recipe({
    ...
    "transcript_raw": transcript_raw_val,
    "transcript_english": transcript_english_val,
})
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/ -q
# Expected: 192+ passed (new test added)
```

**Step 5: Commit**
```bash
git add scripts/serve.py tests/test_save_audio.py
git commit -m "[Add] [serve]: transcribe + translate for song/story in save-audio endpoint (Chunk A.1)"
```

---

## Chunk C.1 — Memory detail: transcript display for song/story

**Context:** The memory detail page currently shows recipe fields (ingredients, steps, cook notes) for all types. For song/story, we want to show: title, narrator, audio player, and the English transcript (collapsible). The `isAudioMemory()` helper already exists but it checks for the `"audio"` tag, not the `type` field.

**Files:**
- Modify: `frontend/app/(app)/memory/page.tsx`

**Step 1: Add type-aware helper**

```typescript
// Replace or supplement isAudioMemory()
function isNonRecipe(m: Memory) {
  return m.type != null && m.type !== 'recipe'
}
```

**Step 2: In the render section, add transcript block for non-recipe types**

After the audio player / before the ingredients section:

```tsx
{isNonRecipe(memory) && display.transcript_english && (
  <div style={{ marginBottom: '1.5rem' }}>
    <button
      onClick={() => setTranscriptOpen(o => !o)}
      style={{ ... }}
    >
      {transcriptOpen ? '▾ Hide transcript' : '▸ Show transcript'}
    </button>
    {transcriptOpen && (
      <p style={{ color: 'var(--text)', lineHeight: 1.8, fontSize: 15, marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
        {display.transcript_english}
      </p>
    )}
  </div>
)}
```

**Step 3: Suppress recipe fields for non-recipe types**

Wrap the ingredients / steps / cook notes / image sections in:
```tsx
{!isNonRecipe(memory) && (
  // ... existing recipe-specific JSX
)}
```

**Step 4: Watch it pass**
```bash
cd frontend && node_modules/.bin/next build
# Expected: clean build
```

**Step 5: Commit**
```bash
git add frontend/app/\(app\)/memory/page.tsx
git commit -m "[Add] [frontend]: transcript display + hide recipe fields for song/story detail page (Chunk C.1)"
```

---

## Completion gate

- [ ] Supabase SQL migration run in dashboard before deploying M.1 (`ALTER TABLE recipes RENAME TO memories; ALTER TABLE memories RENAME COLUMN dish_name TO title;`)
- [ ] M.1 committed — Python layer clean, 192 tests green
- [ ] M.2 committed — frontend build clean, 0 TS errors
- [ ] A.1 committed — save-audio transcribes for song/story, test added (192+ tests)
- [ ] C.1 committed — song/story detail shows transcript, recipe fields hidden
- [ ] Full build: `cd frontend && node_modules/.bin/next build`
- [ ] Full suite: `python -m pytest tests/ -q`
- [ ] `/audit` passes → `/closeout`
