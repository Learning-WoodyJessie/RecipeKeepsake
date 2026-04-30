# Plan: Simple HTML UI (no framework)

```
Goal:         Replace Next.js with a single web/app.html served by FastAPI
Layer:        Frontend HTML/CSS/JS + minor FastAPI additions
Architecture: prototype_v4.html redesigned UI wired to real API endpoints.
              FastAPI serves app.html at /. No build step, no npm, one deployment.
Design doc:   web/prototype_v4.html (approved design reference)
```

---

## Existing API (already working — do NOT break)

| Endpoint | What it does |
|---|---|
| `GET /` | Serves HTML file |
| `GET /recipes` | Returns `{recipes: [...]}` — all recipes, newest first |
| `POST /capture` | Accepts audio file → full pipeline → returns recipe JSON |
| `POST /generate-image` | Generates DALL-E image for dish name |

**Missing endpoint needed:**
- `GET /recipe/{token}` — fetch single recipe by token (storage.py already has `get_recipe_by_token`)

---

## Block 1 — Backend: add missing endpoint

### Chunk 1.1 — Add GET /recipe/{token} to serve.py

Files:
- Modify: `scripts/serve.py`

**Step 1: Add the endpoint** (no test needed — FastAPI route, verified manually)

```python
# In scripts/serve.py, after list_recipes_endpoint:
@app.get("/recipe/{token}")
async def get_recipe_endpoint(token: str):
    """Fetch a single recipe by share token."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        raise HTTPException(status_code=503, detail="Storage not configured")
    from tools.storage import get_recipe_by_token
    try:
        recipe = get_recipe_by_token(token)
        return JSONResponse(content=recipe)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Recipe not found")
```

**Step 2: Update `/` to serve `web/app.html`**

```python
@app.get("/")
async def index():
    html = _WEB_DIR / "app.html"          # changed from prototype.html
    if html.exists():
        return FileResponse(html)
    return JSONResponse(content={"status": "RecipeKeepsake API running"})
```

**Step 3: Verify**
```bash
python -m scripts.serve &
curl http://localhost:8080/recipe/test-token  # expect 404 Not Found (not 500)
pkill -f scripts.serve
```

**Step 4: Commit**
```bash
git add scripts/serve.py
git commit -m "[Add] [serve]: GET /recipe/{token} endpoint + serve app.html at /"
```

---

## Block 2 — Frontend: web/app.html

Single file. All screens in one HTML. SPA-style show/hide. Real API calls.

### Chunk 2.1 — Scaffold: design system + layout + screen router

Files:
- Create: `web/app.html`

Build the shell:
- CSS variables (terracotta palette from prototype_v4)
- Google Fonts: Playfair Display + Inter
- `.app` flex layout: sidebar (desktop) + main content area
- `.bottom-nav` (mobile, hidden on desktop via media query)
- Screen system: `div.screen` → `display:none`, `div.screen.active` → `display:block`
- `go(screenId)` JS function — hides all, shows target, updates nav active state
- `toast(msg)` helper

Screens declared (empty for now):
```
home | capture | saving | recipe-detail | people | profile | all-recipes | hear-dadi | add-voice
```

**Verify:** Open file in browser. Sidebar visible on desktop, bottom nav on mobile (resize window). Clicking sidebar items switches active screen.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: app.html scaffold — design system, layout, screen router"
```

---

### Chunk 2.2 — Home screen (real data)

Files:
- Modify: `web/app.html` — fill `#screen-home`

On `DOMContentLoaded` (and whenever home is navigated to):
```js
async function loadHome() {
  const res = await fetch('/recipes')
  const { recipes } = await res.json()
  renderFavorites(recipes.slice(0, 5))      // top 5 most recent as chips
  renderRecentlyRemembered(recipes.slice(0, 3))  // 3 items with play button
}
```

Recipe card chip template:
```html
<div class="fav-chip" onclick="openRecipe('TOKEN')">
  <img src="IMAGE_URL" onerror="this.style.display='none'"/>
  <div class="fav-chip-overlay"></div>
  <div class="fav-chip-name">DISH_NAME</div>
</div>
```

Recently remembered item template:
```html
<div class="recent-card" onclick="openRecipe('TOKEN')">
  <div class="recent-avatar">NARRATOR_EMOJI</div>
  <div class="recent-info">
    <div class="recent-dish">DISH_NAME</div>
    <div class="recent-when">Recorded DATE by NARRATOR</div>
  </div>
  <div class="recent-play" onclick="event.stopPropagation(); openHearDadi('TOKEN')">▶</div>
</div>
```

Empty state: show "No recipes yet — capture the first one" with CTA.

**Verify:** Start server, open browser, home screen shows real recipes from Supabase.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: home screen loads real recipes from /recipes"
```

---

### Chunk 2.3 — Capture screen + Saving animation

Files:
- Modify: `web/app.html` — fill `#screen-capture` and `#screen-saving`

**Capture screen:**
- Narrator selector chips (hardcoded: Dadi, Nani, Mumma + custom)
- Dashed mic circle (tap to record, tap again to stop)
- Upload audio file → file input → triggers same pipeline
- Tips card

**Recording flow:**
```js
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
  // collect chunks...
  mediaRecorder.start()
  // update timer every second
}

async function stopRecording() {
  mediaRecorder.stop()
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' })
    submitAudio(blob)
  }
}
```

**submitAudio(blob):**
```js
async function submitAudio(blob) {
  go('saving')          // switch to saving screen, start animation
  startSavingAnimation()

  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  const res = await fetch('/capture', { method: 'POST', body: form })
  const recipe = await res.json()

  currentRecipe = recipe   // store globally
  finishSavingAnimation()  // mark all steps done
  setTimeout(() => openRecipe(recipe.token, recipe), 600)
}
```

**Saving animation:**
- 5 steps: Listening → Writing → Understanding → Tips → Saving
- Each step: `pending` → `active` (spin) → `done` (green ✓)
- Steps advance on a timer (1.5s each) — don't wait for API, animate independently
- When API returns, jump straight to done

**Error handling:**
```js
catch (err) {
  go('capture')
  toast('Something went wrong — ' + err.message)
}
```

**Upload flow (file input):**
- Same `submitAudio(blob)` — just source is a File instead of recorded Blob

**Verify:** Record 5 seconds → stops → saving animation plays → recipe detail appears.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: capture screen with real MediaRecorder + saving animation"
```

---

### Chunk 2.4 — Recipe detail screen (real data + tabs)

Files:
- Modify: `web/app.html` — fill `#screen-recipe-detail`

**openRecipe(token, recipeData?):**
```js
async function openRecipe(token, data) {
  // If data already passed (from capture response) use it directly
  // Otherwise fetch from /recipe/{token}
  const recipe = data ?? await fetch(`/recipe/${token}`).then(r => r.json())
  currentRecipe = recipe
  renderRecipeDetail(recipe)
  go('recipe-detail')
}
```

**renderRecipeDetail(recipe):**
- Hero image (or placeholder emoji if no image_url)
- "From Dadi's kitchen 🧡" badge
- Dish name (Playfair Display)
- "Hear Dadi say it" bar → `openHearDadi(token)` (only if `audio_url` exists)
- Meta pills: serves (hardcoded "–" if unknown), cook time (unknown), level
- Ingredients card (right column on desktop, below on mobile)
- **Tabs**: Steps | Dadi's Tip | Transcript | Notes
  - Steps: numbered plain list from `recipe.steps[]`
  - Dadi's Tip: `recipe.cook_notes`
  - Transcript: raw Telugu (`transcript_raw`) + English (`transcript_english`)
  - Notes: `review_flags[]` if present
- "Cook with Dadi" button → `openHearDadi(token)`

**Verify:** Open a recipe from home screen → detail shows correct data, tabs switch, audio bar visible if audio exists.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: recipe detail screen with real data + tabs (Steps/Tip/Transcript/Notes)"
```

---

### Chunk 2.5 — Hear Dadi audio player

Files:
- Modify: `web/app.html` — fill `#screen-hear-dadi`

```js
function openHearDadi(token) {
  const recipe = currentRecipe
  if (!recipe?.audio_url) { toast('No audio for this recipe'); return }

  // Populate screen
  document.getElementById('hd-dish-name').textContent = recipe.dish_name
  document.getElementById('hd-narrator').textContent = recipe.narrator ?? 'Dadi'
  document.getElementById('hd-narrator-photo').src = ''  // placeholder

  // Wire <audio> element
  const audio = document.getElementById('hd-audio')
  audio.src = recipe.audio_url
  audio.load()

  go('hear-dadi')
}
```

Audio player wired to a real `<audio>` element (hidden):
- Play/pause button toggles `audio.play()` / `audio.pause()`
- Time display updates on `audio.ontimeupdate`
- Waveform bars are decorative (static), progress shown via time display
- Skip ±15 buttons call `audio.currentTime += 15` etc.

**Verify:** Recipe with audio_url → click "Hear Dadi say it" → audio plays, pause/play works, skip works.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: hear-dadi audio player wired to real audio_url"
```

---

### Chunk 2.6 — People + All Recipes screens

Files:
- Modify: `web/app.html` — fill `#screen-people`, `#screen-all-recipes`

**People screen:**
Derives narrator list from recipes already loaded:
```js
function renderPeople(recipes) {
  const narrators = [...new Map(
    recipes.map(r => [r.narrator, { name: r.narrator, count: 0 }])
  ).values()]
  recipes.forEach(r => narrators.find(n => n.name === r.narrator).count++)
  // render list
}
```
Clicking a narrator → `openProfile(narratorName)` → filters recipes by narrator, shows profile screen.

**All Recipes screen:**
- Grid of recipe cards from global recipes array
- Filter chips (All / by narrator name) — client-side filter, no new API call
- Clicking card → `openRecipe(token)`

**Verify:** People page lists narrators with correct counts. All Recipes shows grid. Filters work.

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: people + all-recipes screens wired to real data"
```

---

### Chunk 2.7 — Polish: empty states, error states, loading spinners

Files:
- Modify: `web/app.html`

- Home: skeleton loaders while `/recipes` is fetching
- Capture: mic permission denied → friendly error message
- Recipe detail: if no `audio_url`, hide "Hear Dadi say it" bar
- People: if 0 recipes, show "No memories yet" with record CTA
- Catch-all: unhandled errors show toast instead of blank screen

**Commit:**
```bash
git add web/app.html
git commit -m "[Add] [web]: empty states, error states, loading skeletons"
```

---

## Verification after all chunks

```bash
# 1. Start server
python -m scripts.serve

# 2. Open http://localhost:8080
# - Home loads real recipes
# - Record a short clip → saving animation → recipe detail appears
# - Hear Dadi plays audio
# - All Recipes shows grid
# - People shows narrator list

# 3. Test on mobile viewport (DevTools)
# - Bottom nav visible, sidebar hidden
# - Recording works on mobile Chrome

# 4. Build check (nothing to build — it's plain HTML)
echo "No build step needed ✓"
```

---

## Files changed summary

| File | Change |
|---|---|
| `scripts/serve.py` | Add `GET /recipe/{token}`, update `/` to serve `app.html` |
| `web/app.html` | New file — full UI wired to real API |

**Next.js is NOT touched** — leave `web/nextjs/` in place for now, just stop deploying it.

---

Ready to build? Use `/build`.
