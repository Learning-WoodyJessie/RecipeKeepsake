# Phase A — Content Types Plan

```
Goal:         Add `type` field (recipe|song|story|fable|moral) to memories, wired through DB, pipeline, API, and frontend.
Layer:        Multi-layer — DB → Python pipeline → FastAPI → Next.js
Architecture: Add `type text DEFAULT 'recipe'` to the `recipes` table. The AI pipeline
              (run_persist) always writes 'recipe'. The /save-audio endpoint accepts a
              `memory_type` form field (defaults to 'song'). Frontend: direct-upload mode
              gets a type selector; memory detail and home cards render a type badge and
              conditionally show recipe-specific fields.
Design doc:   docs/plans/2026-07-07-family-sharing-design.md
```

---

## Chunk 1.1 — DB Migration

**Manual step — run in Supabase SQL editor, then confirm before proceeding.**

```sql
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'recipe'
  CHECK (type IN ('recipe', 'song', 'story', 'fable', 'moral'));
```

Verify:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'recipes' AND column_name = 'type';
```

No code changes in this chunk. Commit once column is confirmed live:

```bash
git commit --allow-empty -m "[DB]: add type column to recipes (recipe|song|story|fable|moral)"
```

---

## Chunk 1.2 — Python: `type` through pipeline + `/save-audio`

Files:
- Modify: `pipeline/persist.py`
- Modify: `scripts/serve.py` (lines ~681–741, `/save-audio` endpoint)
- Create: `tests/test_persist.py`
- Modify: `tests/test_capture.py` (add type assertion)

### Step 1: Failing tests

```python
# tests/test_persist.py
from unittest.mock import patch, MagicMock
from pipeline.persist import run_persist
from pipeline.models import RecipeData

def _recipe(**kwargs):
    defaults = dict(
        dish_name="Pesarattu", ingredients=[], steps=[],
        cook_notes="", review_flags=[], transcript_raw="",
        transcript_english="", image_url="", category="",
    )
    return RecipeData(**{**defaults, **kwargs})


class TestRunPersist:
    def test_inserts_type_recipe(self):
        """run_persist() always writes type='recipe' — it is only used for the AI pipeline."""
        captured = {}
        def _fake_insert(row):
            captured.update(row)
            return {"id": "x", "token": "t", "audio_url": ""}

        with patch("pipeline.persist.upload_audio"), \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert):
            run_persist(_recipe(), audio_path="/tmp/a.m4a", audio_filename="a.m4a")

        assert captured["type"] == "recipe"

    def test_type_not_overridden_by_category(self):
        """Category tag and type field are independent — category goes into tags, not type."""
        captured = {}
        def _fake_insert(row):
            captured.update(row)
            return {"id": "x", "token": "t", "audio_url": ""}

        with patch("pipeline.persist.upload_audio"), \
             patch("pipeline.persist.insert_recipe", side_effect=_fake_insert):
            run_persist(_recipe(category="Snacks"), audio_path="/tmp/a.m4a", audio_filename="a.m4a")

        assert captured["type"] == "recipe"
        assert "Snacks" in captured["tags"]
```

### Step 2: Watch it fail

```bash
cd /Users/pavanibayappu/RecipeKeepsake
python -m pytest tests/test_persist.py -v
# Expected: FAILED — KeyError or AssertionError ('type' not in captured)
```

### Step 3: Implementation

**`pipeline/persist.py`** — add `"type": "recipe"` to row dict:

```python
    row = {
        "type": "recipe",          # ← add this line
        "dish_name": recipe.dish_name,
        # ... rest unchanged
    }
```

**`scripts/serve.py`** — `/save-audio` endpoint, add `memory_type` param and validate:

```python
_VALID_MEMORY_TYPES = {"recipe", "song", "story", "fable", "moral"}

@app.post("/save-audio")
async def save_audio_endpoint(
    audio: UploadFile | None = File(default=None),
    title: str = File(...),
    narrator: str = File(default=""),
    description: str = File(default=""),
    original_text: str = File(default=""),
    memory_type: str = File(default="song"),   # ← add
    user: dict = Depends(require_auth),
):
```

Then in the `insert_recipe` call inside that endpoint, add `"type"`:

```python
        row = insert_recipe({
            "type": memory_type if memory_type in _VALID_MEMORY_TYPES else "song",  # ← add
            "dish_name": title.strip() or "Untitled",
            # ... rest unchanged
        })
```

### Step 4: Watch it pass

```bash
python -m pytest tests/test_persist.py -v
python -m pytest tests/ -q   # full suite — must stay at 173+
```

### Step 5: Commit

```bash
git add pipeline/persist.py scripts/serve.py tests/test_persist.py
git commit -m "[Add] [pipeline/api]: type field for content types (recipe|song|story|fable|moral)"
```

---

## Chunk 1.3 — Upload UI: type selector in direct mode

Files:
- Modify: `frontend/app/(app)/upload/page.tsx`
- Modify: `frontend/lib/api.ts` (if `memory_type` not already in FormData)

### Step 1: Implementation (frontend-only — no Python test)

**`frontend/app/(app)/upload/page.tsx`**

Add state after existing `mode` state (around line 140):

```tsx
const DIRECT_TYPES = [
  { value: 'song',  label: '🎵 Song' },
  { value: 'story', label: '📖 Story' },
  { value: 'fable', label: '✨ Fable' },
  { value: 'moral', label: '🙏 Moral' },
] as const
type DirectType = typeof DIRECT_TYPES[number]['value']

const [memoryType, setMemoryType] = useState<DirectType>('song')
```

Add type picker inside the `{mode === 'direct' && (` block, above the title input:

```tsx
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
  {DIRECT_TYPES.map(({ value, label }) => (
    <button
      key={value}
      type="button"
      onClick={() => setMemoryType(value)}
      style={{
        padding: '6px 14px',
        borderRadius: 20,
        border: '1px solid var(--border)',
        background: memoryType === value ? 'var(--accent)' : 'transparent',
        color: memoryType === value ? 'white' : 'var(--muted)',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >{label}</button>
  ))}
</div>
```

**`handleFileDirect`** — append `memory_type` to FormData:

```tsx
async function handleFileDirect(file: File) {
  const form = new FormData()
  form.append('audio', file)
  form.append('title', title)
  form.append('narrator', narrator)
  form.append('memory_type', memoryType)   // ← add
  // ...rest unchanged
}
```

**`handleFileAI`** — append `memory_type: 'recipe'` to FormData:

```tsx
  form.append('memory_type', 'recipe')   // ← add before api.capture.process(form)
```

### Step 2: Verify

```bash
cd /Users/pavanibayappu/RecipeKeepsake/frontend
node_modules/.bin/next build
# Must complete with 0 TypeScript errors
```

### Step 3: Commit

```bash
git add frontend/app/\(app\)/upload/page.tsx
git commit -m "[Add] [frontend]: memory type selector for direct upload (song/story/fable/moral)"
```

---

## Chunk 1.4 — Memory detail: type badge + conditional recipe fields

Files:
- Modify: `frontend/app/(app)/memory/page.tsx`

### Step 1: Implementation

Find where `memory` type is used and add a type badge near the top of the detail view. Add after the title heading:

```tsx
{memory.type && memory.type !== 'recipe' && (
  <span style={{
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 12,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    fontSize: 12,
    color: 'var(--muted)',
    marginBottom: 8,
    textTransform: 'capitalize',
  }}>
    {memory.type}
  </span>
)}
```

Wrap the ingredients/steps/cook_notes section with a type guard so recipe fields only render for recipes:

```tsx
{(!memory.type || memory.type === 'recipe') && (
  <>
    {/* existing ingredients, steps, cook_notes JSX */}
  </>
)}
```

### Step 2: Verify

```bash
cd /Users/pavanibayappu/RecipeKeepsake/frontend
node_modules/.bin/next build
```

### Step 3: Commit

```bash
git add frontend/app/\(app\)/memory/page.tsx
git commit -m "[Add] [frontend]: type badge + conditional recipe fields on memory detail"
```

---

## Chunk 1.5 — Home cards: type badge

Files:
- Modify: `frontend/app/(app)/home/page.tsx` (or wherever memory list cards are rendered)

### Step 1: Locate card rendering

```bash
grep -n "dish_name\|narrator\|recorded_at\|card\|Card" frontend/app/\(app\)/home/page.tsx | head -20
```

### Step 2: Add type badge to each card

Find the card JSX and add a small label if `memory.type !== 'recipe'`:

```tsx
{r.type && r.type !== 'recipe' && (
  <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
    {r.type}
  </span>
)}
```

### Step 3: Verify

```bash
cd /Users/pavanibayappu/RecipeKeepsake/frontend
node_modules/.bin/next build
python -m pytest tests/ -q   # must stay 173+
```

### Step 4: Commit

```bash
git add frontend/app/\(app\)/home/page.tsx
git commit -m "[Add] [frontend]: memory type badge on home cards"
```

---

## Completion gate

- [ ] Supabase `type` column confirmed live (Chunk 1.1)
- [ ] `python -m pytest tests/ -q` — 175+ passing, 0 failures
- [ ] `cd frontend && node_modules/.bin/next build` — clean
- [ ] Direct upload: type selector visible, selection sends correct `memory_type` to `/save-audio`
- [ ] AI upload: sends `memory_type: 'recipe'`
- [ ] Memory detail: song/story/fable/moral show type badge, hide ingredient/step fields
- [ ] Home cards: type label visible for non-recipe memories
