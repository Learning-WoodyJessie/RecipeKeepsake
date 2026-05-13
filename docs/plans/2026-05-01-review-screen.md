# Plan: Human-in-the-loop Recipe Review Screen

```
Goal:         After pipeline completes, show a review screen where the user can
              verify and edit the structured recipe before it is saved to Supabase.
Layer:        Multi-layer (Python backend + frontend web/app.html)
Architecture: Split /capture into two endpoints: /capture/process (pipeline only,
              no Supabase) and /capture/save (upload audio + insert recipe).
              Frontend adds a review screen between saving animation and recipe-detail.
              Audio blob stays in memory on the client between process and save.
Design doc:   docs/plans/2026-05-01-review-screen.md (this file)
```

---

## Do NOT break
- Two-step translation pipeline (translate then structure — never combined)
- `cook_notes` field — vague measurements live here verbatim
- `insert_recipe` signature in `tools/storage.py` — unchanged
- `SCREEN_IDS` array drives the `go()` navigation — must register `'review'`
- All 30 existing tests must stay green after every chunk

---

## Reuse check
- `process_recipe()` — **No existing equivalent.** `capture()` in `scripts/capture.py`
  does pipeline + Supabase save combined. We extract pipeline-only into a new function.
- `insert_recipe()` in `tools/storage.py` — reused as-is in the new `/capture/save` endpoint.
- `upload_audio()` in `tools/storage.py` — reused as-is.
- `renderRecipeDetail()` in `web/app.html` — reused after save; review screen has its own render.

---

## Block A — Python Backend

### Chunk A.1 — Extract `process_recipe()` from `capture()`

Files:
- Modify: `scripts/capture.py`
- Modify: `tests/test_capture.py`

**Step 1: Failing test**
```python
# tests/test_capture.py — add to existing file
class TestProcessRecipe:
    def test_returns_pipeline_fields_without_insert(self):
        """process_recipe() returns structured data and does NOT call insert_recipe."""
        with patch("scripts.capture.transcribe_audio", return_value="raw telugu"), \
             patch("scripts.capture.translate_to_english", return_value="english"), \
             patch("scripts.capture.structure_recipe", return_value={
                 "dish_name": "Pesarattu",
                 "ingredients": [{"item": "moong dal", "quantity": "1 cup"}],
                 "steps": ["Soak", "Grind"],
                 "cook_notes": "add oil till it smells right",
                 "review_flags": [],
             }), \
             patch("scripts.capture.insert_recipe") as mock_insert, \
             patch("scripts.capture.OpenAIProvider"):
            from scripts.capture import process_recipe
            result = process_recipe("audio.m4a")

        mock_insert.assert_not_called()
        assert result["dish_name"] == "Pesarattu"
        assert result["transcript_raw"] == "raw telugu"
        assert result["transcript_english"] == "english"
        assert "id" not in result
        assert "token" not in result
        assert "audio_url" not in result

    def test_pipeline_order_without_insert(self):
        """process_recipe() calls transcribe → translate → structure in order."""
        call_order = []
        with patch("scripts.capture.transcribe_audio",
                   side_effect=lambda *a, **k: call_order.append("transcribe") or "raw"), \
             patch("scripts.capture.translate_to_english",
                   side_effect=lambda *a, **k: call_order.append("translate") or "english"), \
             patch("scripts.capture.structure_recipe",
                   side_effect=lambda *a, **k: call_order.append("structure") or {
                       "dish_name": "x", "ingredients": [], "steps": [],
                       "cook_notes": "", "review_flags": []}), \
             patch("scripts.capture.insert_recipe"), \
             patch("scripts.capture.OpenAIProvider"):
            from scripts.capture import process_recipe
            process_recipe("audio.m4a")

        assert call_order == ["transcribe", "translate", "structure"]
```

**Step 2: Watch it fail**
```bash
cd /Users/pavanibayappu/RecipeKeepsake
python -m pytest tests/test_capture.py::TestProcessRecipe -v
# Expected: FAILED — ImportError: cannot import name 'process_recipe'
```

**Step 3: Minimal implementation**

Add to `scripts/capture.py` (above the existing `capture()` function):
```python
def process_recipe(audio_path: str) -> dict:
    """
    Run the pipeline without saving to Supabase.
    Returns: transcript_raw, transcript_english, dish_name, ingredients,
             steps, cook_notes, review_flags.
    No id, token, or audio_url — those come after the user reviews.
    """
    config = load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    print("Transcribing...")
    transcript_raw = transcribe_audio(audio_path)

    print("Translating...")
    transcript_english = translate_to_english(transcript_raw, provider)

    print("Structuring...")
    structured = structure_recipe(transcript_english, provider)

    return {
        "transcript_raw": transcript_raw,
        "transcript_english": transcript_english,
        **structured,
    }
```

**Step 4: Watch it pass**
```bash
python -m pytest tests/test_capture.py -v
python -m pytest tests/ -v   # full suite — must stay at 30+
```

**Step 5: Commit**
```bash
git add scripts/capture.py tests/test_capture.py
git commit -m "[Add] [tools]: process_recipe() — pipeline without Supabase save"
```

---

### Chunk A.2 — Add `/capture/process` and `/capture/save` endpoints

Files:
- Modify: `scripts/serve.py`

No new test file needed — the endpoints are thin wrappers over already-tested functions.
Verified manually by running the app.

**Step 1: Implementation**

In `scripts/serve.py`, add these two endpoints AFTER the existing `/capture` endpoint:

```python
@app.post("/capture/process")
async def capture_process_endpoint(
    audio: UploadFile = File(...),
    user: dict = Depends(require_auth)
):
    """
    Run pipeline only (Whisper + translate + structure + image).
    Does NOT save to Supabase. Returns structured JSON for client review.
    """
    _check_rate_limit(user.get("id", ""))

    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    config = load_config()
    provider = OpenAIProvider(model=config["llm"]["model"])

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        from scripts.capture import process_recipe
        print(f"[serve/process] Processing {audio.filename}...")
        recipe = process_recipe(tmp_path)

        # Image generation (non-fatal)
        image_url = ""
        try:
            from prompts.image import generate_dish_image
            from tools.storage import store_image
            raw_url = generate_dish_image(recipe.get("dish_name") or "Indian dish")
            if raw_url and os.environ.get("SUPABASE_URL"):
                image_url = store_image(raw_url)
            else:
                image_url = raw_url
        except Exception as img_err:
            print(f"[serve/process] Image generation failed (non-fatal): {img_err}")

        recipe["image_url"] = image_url
        print(f"[serve/process] Done: {recipe.get('dish_name')}")
        return JSONResponse(content=recipe)

    except Exception as e:
        print(f"[serve/process] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/capture/save")
async def capture_save_endpoint(
    audio: UploadFile = File(...),
    recipe: str = Form(...),
    narrator: str = Form(default="Grandma"),
    user: dict = Depends(require_auth)
):
    """
    Save a reviewed + edited recipe to Supabase.
    Receives: audio file + recipe JSON string (edited by user) + narrator name.
    """
    import json as _json

    try:
        recipe_data = _json.loads(recipe)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recipe JSON")

    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        raise HTTPException(status_code=500, detail="Supabase not configured")

    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        from tools.storage import insert_recipe, upload_audio, _sign_audio, _client as _sb
        import uuid

        audio_filename = f"{uuid.uuid4()}{suffix}"
        print(f"[serve/save] Uploading audio as {audio_filename}...")
        try:
            stored_path = upload_audio(tmp_path, audio_filename)
        except Exception as audio_err:
            print(f"[serve/save] Audio upload failed (non-fatal): {audio_err}")
            stored_path = ""

        saved = insert_recipe({
            **recipe_data,
            "audio_url": stored_path,
            "narrator": narrator,
            "user_id": user.get("id", ""),
            "recorded_by_email": user.get("email", ""),
            "recorded_by_name": (user.get("user_metadata") or {}).get("full_name", ""),
        })

        result = {**recipe_data, **saved}
        if stored_path:
            result["audio_url"] = _sign_audio(stored_path, _sb())

        print(f"[serve/save] Saved: {saved.get('id')}")
        return JSONResponse(content=result)

    except Exception as e:
        print(f"[serve/save] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
```

**Step 2: Verify app still starts**
```bash
python -m pytest tests/ -v   # must stay at 32+
```

**Step 3: Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: /capture/process and /capture/save endpoints for review flow"
```

---

## Block B — Frontend

> No unit tests for frontend. Verification: Railway deploy + manual test in browser/emulator.

### Chunk B.1 — Review screen HTML + CSS

Files:
- Modify: `web/app.html`

**What to add:**

1. Add `'review'` to `SCREEN_IDS` array (line ~1852):
```javascript
const SCREEN_IDS = [
  'home','capture','saving','recipe-detail',
  'people','profile','all-recipes','hear-dadi','add-voice','review'
];
```

2. Add the review screen HTML block after `screen-saving` and before `screen-recipe-detail`:
```html
<!-- ════ REVIEW ════ -->
<div class="screen" id="screen-review">
  <div class="page review-page">

    <!-- Top bar -->
    <div class="review-topbar">
      <button class="review-discard-btn" onclick="discardReview()">✕ Discard</button>
      <div class="review-topbar-title">Review Recipe</div>
      <button class="review-save-top-btn" onclick="saveReviewedRecipe()">Save ✓</button>
    </div>

    <!-- Audio playback (plays from local blob before Supabase upload) -->
    <div class="review-audio-bar" id="rv-audio-bar" style="display:none">
      <button class="rv-play-btn" id="rv-play-btn" onclick="toggleReviewAudio()">▶</button>
      <div class="rv-audio-label">Listen to recording</div>
      <div class="rv-audio-time" id="rv-duration">0:00</div>
    </div>

    <!-- Dish name -->
    <div class="review-section">
      <div class="review-label">Dish name</div>
      <input type="text" id="rv-dish-name" class="review-input" placeholder="What is this dish?"/>
    </div>

    <!-- Ingredients -->
    <div class="review-section">
      <div class="review-label">Ingredients <span class="review-hint">tap × to remove</span></div>
      <div id="rv-ingredients-list" class="rv-list"></div>
      <div class="rv-add-row">
        <input type="text" id="rv-new-ing" class="rv-add-input" placeholder="e.g. 2 cups rice"/>
        <button class="rv-add-btn" onclick="addIngredient()">+ Add</button>
      </div>
    </div>

    <!-- Steps -->
    <div class="review-section">
      <div class="review-label">Steps <span class="review-hint">tap × to remove</span></div>
      <div id="rv-steps-list" class="rv-list"></div>
      <div class="rv-add-row">
        <input type="text" id="rv-new-step" class="rv-add-input" placeholder="Add a step…"/>
        <button class="rv-add-btn" onclick="addStep()">+ Add</button>
      </div>
    </div>

    <!-- Cook notes -->
    <div class="review-section">
      <div class="review-label">Dadi's notes <span class="review-hint">vague terms OK</span></div>
      <textarea id="rv-cook-notes" class="review-textarea" placeholder="e.g. add oil until it smells right…" rows="3"></textarea>
    </div>

    <!-- Transcript (collapsible reference) -->
    <details class="review-transcript-details">
      <summary class="review-transcript-summary">🎙️ Raw transcript ▾</summary>
      <div class="review-transcript-body">
        <div class="review-transcript-lang">Original</div>
        <div id="rv-transcript-raw" class="review-transcript-text"></div>
        <div class="review-transcript-lang" style="margin-top:.75rem">English translation</div>
        <div id="rv-transcript-english" class="review-transcript-text"></div>
      </div>
    </details>

    <!-- Save/discard bottom bar -->
    <div class="review-bottom-bar">
      <button class="rv-btn-discard" onclick="discardReview()">Discard</button>
      <button class="rv-btn-save" id="rv-save-btn" onclick="saveReviewedRecipe()">Save Recipe ✓</button>
    </div>

    <div style="height:5rem"></div>
  </div>
</div>
```

3. Add CSS (in the `<style>` block, near the bottom of the existing styles):
```css
/* ── Review Screen ── */
.review-page { padding: 0 0 2rem; max-width: 520px; margin: 0 auto; }
.review-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: .85rem 1rem; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 10;
}
.review-topbar-title { font-weight: 700; font-size: .95rem; color: var(--text1); }
.review-discard-btn { background: none; border: none; color: var(--muted); font-size: .85rem; cursor: pointer; padding: .35rem .6rem; }
.review-save-top-btn { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: .38rem .85rem; font-size: .82rem; font-weight: 600; cursor: pointer; }
.review-audio-bar {
  display: flex; align-items: center; gap: .75rem;
  padding: .65rem 1rem; background: var(--surface); margin: .75rem 1rem;
  border-radius: 11px; border: 1px solid var(--border);
}
.rv-play-btn { background: var(--accent); color: #fff; border: none; border-radius: 50%; width: 32px; height: 32px; font-size: .85rem; cursor: pointer; flex-shrink: 0; }
.rv-audio-label { flex: 1; font-size: .82rem; color: var(--text2); }
.rv-audio-time { font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.review-section { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
.review-label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-bottom: .45rem; }
.review-hint { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: .68rem; color: var(--accent); margin-left: .4rem; }
.review-input {
  width: 100%; border: none; border-bottom: 1.5px solid var(--border);
  background: transparent; font-size: 1rem; font-weight: 600; color: var(--text1);
  padding: .35rem 0; outline: none; font-family: inherit;
}
.review-input:focus { border-bottom-color: var(--accent); }
.review-textarea {
  width: 100%; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); color: var(--text1); font-family: inherit;
  font-size: .85rem; padding: .55rem .7rem; outline: none; resize: vertical; box-sizing: border-box;
}
.review-textarea:focus { border-color: var(--accent); }
.rv-list { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .55rem; }
.rv-list-item {
  display: flex; align-items: center; gap: .5rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: .45rem .6rem;
}
.rv-item-num { font-size: .7rem; color: var(--muted); font-weight: 700; min-width: 1.2rem; }
.rv-item-text { flex: 1; font-size: .84rem; color: var(--text1); border: none; background: transparent; outline: none; font-family: inherit; min-width: 0; }
.rv-item-del { background: none; border: none; color: var(--muted); cursor: pointer; font-size: .8rem; padding: .1rem .3rem; flex-shrink: 0; }
.rv-item-del:hover { color: #e55; }
.rv-add-row { display: flex; gap: .5rem; align-items: center; }
.rv-add-input { flex: 1; border: 1px solid var(--border); border-radius: 8px; padding: .42rem .65rem; font-size: .84rem; background: var(--surface); color: var(--text1); font-family: inherit; outline: none; }
.rv-add-input:focus { border-color: var(--accent); }
.rv-add-btn { background: var(--surface); border: 1.5px solid var(--accent); color: var(--accent); border-radius: 8px; padding: .4rem .75rem; font-size: .82rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.review-transcript-details { margin: .75rem 1rem; }
.review-transcript-summary { font-size: .8rem; color: var(--muted); cursor: pointer; padding: .4rem 0; user-select: none; }
.review-transcript-body { padding: .5rem 0; }
.review-transcript-lang { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-bottom: .3rem; }
.review-transcript-text { font-size: .8rem; color: var(--text2); line-height: 1.55; }
.review-bottom-bar {
  display: flex; gap: .75rem; padding: 1rem;
  position: sticky; bottom: 0; background: var(--bg);
  border-top: 1px solid var(--border);
}
.rv-btn-discard { flex: 1; border: 1.5px solid var(--border); background: none; color: var(--text2); border-radius: 11px; padding: .75rem; font-size: .9rem; cursor: pointer; }
.rv-btn-save { flex: 2; background: var(--accent); color: #fff; border: none; border-radius: 11px; padding: .75rem; font-size: .9rem; font-weight: 700; cursor: pointer; }
.rv-btn-save:disabled { opacity: .55; cursor: not-allowed; }
```

**Step 2: Manual verification**

Push to Railway. Open the app. Navigate to capture screen. The new screen shouldn't be visible yet (no navigation to it). Confirm no JS errors in console. Existing tests must still pass:
```bash
python -m pytest tests/ -v
```

**Step 3: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: review screen HTML + CSS"
```

---

### Chunk B.2 — Wire pipeline to review screen

Files:
- Modify: `web/app.html`

**What to add/change:**

1. Add `_pendingReview` state variable near `currentRecipe`:
```javascript
let _pendingReview = null;  // { blob, filename, recipe }
let _reviewAudio = new Audio();
```

2. Add `openReviewScreen(recipe, blob, filename)` function:
```javascript
function openReviewScreen(recipe, blob, filename) {
  _pendingReview = { blob, filename, recipe };

  // Dish name
  document.getElementById('rv-dish-name').value = recipe.dish_name || '';

  // Ingredients
  _renderRvIngredients(recipe.ingredients || []);

  // Steps
  _renderRvSteps(recipe.steps || []);

  // Cook notes
  document.getElementById('rv-cook-notes').value = recipe.cook_notes || '';

  // Transcript
  document.getElementById('rv-transcript-raw').textContent = recipe.transcript_raw || '(none)';
  document.getElementById('rv-transcript-english').textContent = recipe.transcript_english || '(none)';

  // Audio playback from local blob
  if (blob && blob.size > 0) {
    const blobUrl = URL.createObjectURL(blob);
    _reviewAudio.src = blobUrl;
    _reviewAudio.load();
    _reviewAudio.onloadedmetadata = () => {
      document.getElementById('rv-duration').textContent = formatAudioTime(_reviewAudio.duration);
    };
    _reviewAudio.onended = () => { document.getElementById('rv-play-btn').textContent = '▶'; };
    document.getElementById('rv-audio-bar').style.display = 'flex';
  } else {
    document.getElementById('rv-audio-bar').style.display = 'none';
  }

  go('review');
}

function toggleReviewAudio() {
  const btn = document.getElementById('rv-play-btn');
  if (_reviewAudio.paused) {
    _reviewAudio.play();
    btn.textContent = '⏸';
  } else {
    _reviewAudio.pause();
    btn.textContent = '▶';
  }
}
```

3. Change `submitAudio()` — replace the success block to call `/capture/process` and `openReviewScreen`:
```javascript
// OLD (remove these lines after the fetch succeeds):
//   currentRecipe = recipe;
//   allRecipes.unshift(recipe);
//   localStorage.setItem(...)
//   finishProcessingAnimation();
//   setTimeout(() => { renderRecipeDetail(recipe); go('recipe-detail'); }, 600);

// NEW:
    const recipe = await res.json();
    console.log('[submit] pipeline done:', recipe?.dish_name);
    finishProcessingAnimation();
    setTimeout(() => openReviewScreen(recipe, blob, filename), 600);
```

Also update the fetch URL from `/capture` to `/capture/process`:
```javascript
let res = await fetch('/capture/process', { method: 'POST', body: form, headers: authHdrs });
// ...retry also uses /capture/process
res = await fetch('/capture/process', { method: 'POST', body: form, headers: retryHdrs });
```

**Step 3: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: wire submitAudio to /capture/process and open review screen"
```

---

### Chunk B.3 — Inline editing helpers (ingredients + steps)

Files:
- Modify: `web/app.html`

**Add these functions:**

```javascript
// ── Review screen — ingredients ──

function _renderRvIngredients(ings) {
  const list = document.getElementById('rv-ingredients-list');
  list.innerHTML = ings.map((ing, i) => {
    const label = ing.quantity ? `${ing.quantity} ${ing.item}` : ing.item;
    return `
      <div class="rv-list-item">
        <span class="rv-item-num">•</span>
        <input class="rv-item-text" value="${esc(label)}" id="rv-ing-${i}" placeholder="e.g. 1 cup rice"/>
        <button class="rv-item-del" onclick="removeIngredient(${i})">×</button>
      </div>`;
  }).join('');
}

function _getRvIngredients() {
  const list = document.getElementById('rv-ingredients-list');
  return Array.from(list.querySelectorAll('.rv-item-text'))
    .map(inp => inp.value.trim())
    .filter(Boolean)
    .map(raw => {
      // Try to split "quantity item" — first token is quantity if it's a number/fraction/word+number
      const parts = raw.match(/^([\d\/¼-¾⅐-⅞][\d\/\s¼-¾]*(?:cup|tsp|tbsp|g|kg|ml|l|pinch|handful|piece|pieces)?\.?)\s+(.+)$/i);
      return parts ? { quantity: parts[1].trim(), item: parts[2].trim() } : { item: raw, quantity: '' };
    });
}

function addIngredient() {
  const inp = document.getElementById('rv-new-ing');
  const val = inp.value.trim();
  if (!val) return;
  const current = _getRvIngredients();
  current.push({ item: val, quantity: '' });
  _renderRvIngredients(current);
  inp.value = '';
  inp.focus();
}

function removeIngredient(i) {
  const current = _getRvIngredients();
  current.splice(i, 1);
  _renderRvIngredients(current);
}

// ── Review screen — steps ──

function _renderRvSteps(steps) {
  const list = document.getElementById('rv-steps-list');
  list.innerHTML = steps.map((s, i) => `
    <div class="rv-list-item">
      <span class="rv-item-num">${i + 1}</span>
      <input class="rv-item-text" value="${esc(s)}" id="rv-step-${i}" placeholder="Describe this step…"/>
      <button class="rv-item-del" onclick="removeStep(${i})">×</button>
    </div>`).join('');
}

function _getRvSteps() {
  const list = document.getElementById('rv-steps-list');
  return Array.from(list.querySelectorAll('.rv-item-text'))
    .map(inp => inp.value.trim())
    .filter(Boolean);
}

function addStep() {
  const inp = document.getElementById('rv-new-step');
  const val = inp.value.trim();
  if (!val) return;
  const current = _getRvSteps();
  current.push(val);
  _renderRvSteps(current);
  inp.value = '';
  inp.focus();
}

function removeStep(i) {
  const current = _getRvSteps();
  current.splice(i, 1);
  _renderRvSteps(current);
}
```

**Step 3: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: inline ingredient and step editing on review screen"
```

---

### Chunk B.4 — Save and discard flows

Files:
- Modify: `web/app.html`

**Add these functions:**

```javascript
// ── Review screen — save ──

async function saveReviewedRecipe() {
  if (!_pendingReview) { showToast('Nothing to save.'); return; }

  const btn = document.getElementById('rv-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { blob, filename } = _pendingReview;

  // Collect edited fields
  const editedRecipe = {
    dish_name:          document.getElementById('rv-dish-name').value.trim() || 'Untitled recipe',
    ingredients:        _getRvIngredients(),
    steps:              _getRvSteps(),
    cook_notes:         document.getElementById('rv-cook-notes').value.trim(),
    transcript_raw:     _pendingReview.recipe.transcript_raw || '',
    transcript_english: _pendingReview.recipe.transcript_english || '',
    image_url:          _pendingReview.recipe.image_url || '',
    review_flags:       _pendingReview.recipe.review_flags || [],
  };

  // Determine narrator (from the selected chip before recording)
  const activeChip = document.querySelector('.narrator-chip.active');
  const narrator = activeChip?.dataset?.name || 'Grandma';

  const form = new FormData();
  form.append('audio', blob, filename || 'recording.webm');
  form.append('recipe', JSON.stringify(editedRecipe));
  form.append('narrator', narrator);

  try {
    const authHdrs = await getAuthHeaders();
    let res = await fetch('/capture/save', { method: 'POST', body: form, headers: authHdrs });
    if (res.status === 401) {
      const retryHdrs = await getAuthHeaders({ forceRefresh: true });
      res = await fetch('/capture/save', { method: 'POST', body: form, headers: retryHdrs });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Save failed' }));
      throw new Error(err.detail || 'Save failed');
    }
    const saved = await res.json();
    currentRecipe = saved;
    allRecipes.unshift(saved);
    localStorage.setItem('rk_recipes_cache', JSON.stringify(allRecipes));
    seedPeopleFromRecipes();
    _pendingReview = null;
    _reviewAudio.pause();
    renderRecipeDetail(saved);
    go('recipe-detail');
  } catch (err) {
    showToast('Error saving: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Save Recipe ✓';
  }
}

// ── Review screen — discard ──

function discardReview() {
  if (!confirm('Discard this recording? It will not be saved.')) return;
  _pendingReview = null;
  _reviewAudio.pause();
  _reviewAudio.src = '';
  go('capture');
}
```

Also add to the `go()` side-effects block:
```javascript
if (screen === 'review') {
  // pause review audio when navigating away via back button etc.
}
// (already handled by discardReview/saveReviewedRecipe)
```

And make sure `'review'` is already in `SCREEN_IDS` (done in Chunk B.1).

**Step 3: Commit**
```bash
git add web/app.html
git commit -m "[Add] [web]: saveReviewedRecipe() and discardReview() — complete review flow"
```

---

## Progress checklist

- [x] A.1 — `process_recipe()` extracted, tests green (32 passing)
- [x] A.2 — `/capture/process` and `/capture/save` endpoints added
- [x] B.1 — review screen HTML + CSS (registered in SCREEN_IDS)
- [x] B.2 — submitAudio() wired to `/capture/process` + openReviewScreen()
- [x] B.3 — inline ingredient/step editing helpers
- [x] B.4 — saveReviewedRecipe() and discardReview()

## Completion gate

1. `python -m pytest tests/ -v` — all tests green (32+ after A.1)
2. Push to Railway — deploy succeeds
3. Manual test: record audio → saving animation → review screen populates → edit dish name → Save → recipe-detail shows with correct data
4. Manual test: discard flow returns to capture screen
5. `/audit` → `/closeout`
