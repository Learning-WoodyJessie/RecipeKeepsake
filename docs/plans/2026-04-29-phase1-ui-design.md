# RecipeKeepsake — Phase 1 UI PRD

*Brainstorm date: 2026-04-29*
*Status: Approved — ready for /plan*

---

## Goal

Build a mobile-first recording app and a family recipe blog so grandma's narrated recipes are permanently archived with her voice, beautifully presented, and shareable via WhatsApp.

---

## Audience

Two people with different jobs:

- **Pavani** — sits with grandma, records the narration on her phone, reviews the generated card, saves and notifies family
- **Family** — receives a WhatsApp link, opens the blog, browses all recipes and plays back grandma's voice

---

## Scope — what we're NOT building

- Edit-in-place on the blog (family can't edit — review is Pavani's job)
- User accounts or auth — the blog is link-accessible, no login
- Real-time transcription or live feedback during recording
- Push notifications (WhatsApp link is the notification)
- Search or tag filtering (Phase 2)
- Comments or reactions (private keepsake, not social)

---

## Core Requirements

### Recording page (`/record`) — Pavani's tool
1. **Single record button** — tap to start, tap to stop. No app install, works in mobile Safari and Chrome.
2. **Progress screen** — after stopping, show pipeline stages with status: Transcribing → Translating → Building recipe → Generating image. Never a blank spinner.
3. **Optional photo upload** — before or after recording, attach a photo of the dish from camera roll. If no photo, DALL-E 3 generates one automatically.
4. **Review screen** — Pavani sees the full recipe card before it goes live: dish name, ingredients, steps, cook_notes, image, review_flags. Can edit any text field. Can regenerate the image.
5. **Save & Notify** — one tap saves everything and opens WhatsApp pre-filled with: `"New recipe added to RecipeKeepsake 🫙 [recipe link]"`. Pavani decides who to send it to.

### Recipe blog (`/`) — family's view
6. **Home page** — grid of all saved recipes, each showing dish image + name + narrator + date. Most recent first.
7. **Individual recipe page** (`/recipe/[token]`) — full recipe card: dish image, dish name, ingredients list, numbered steps, cook_notes ("grandma's notes"), audio player for the original recording, narrator + date.
8. **Mobile-first** — both pages must be usable on a phone without pinching or horizontal scrolling.

### Storage
9. **Audio** — original recording uploaded to Supabase Storage. URL stored in `recipes.audio_url`.
10. **Image** — DALL-E-generated or user photo uploaded to Supabase Storage. URL stored in `recipes.image_url` (new column).

---

## Success Criteria

- [ ] Record a 3-minute Telugu narration → recipe card live on blog in < 90 seconds
- [ ] Audio player on recipe page plays back grandma's voice
- [ ] Recipe image appears on both home grid and individual recipe page
- [ ] Tapping "Save & Notify" opens WhatsApp pre-filled with the recipe link
- [ ] Home page loads all saved recipes on mobile without horizontal scroll
- [ ] If no photo provided, DALL-E image auto-generates and displays on card
- [ ] Pavani can edit dish name, ingredients, steps before saving
- [ ] Review flags from Call B are visible on review screen (hidden on public blog)

---

## Edge Cases & Failure Modes

| Failure | What breaks | Fallback |
|---|---|---|
| DALL-E generates wrong image | Card has irrelevant image | "Regenerate image" button on review screen |
| Pipeline takes > 60s (long recording) | User thinks it crashed | Progress stages shown live — each step updates as it completes |
| Audio upload fails | Recipe saved without audio | Save recipe anyway; show warning "audio not saved"; retry option |
| DALL-E API fails | No image | Use a placeholder dish illustration; allow manual upload after save |
| Supabase Storage quota hit | Upload fails silently | Catch error, show message, do not save incomplete recipe |
| WhatsApp not installed on device | `window.open(wa.me/...)` does nothing | Show the recipe link as copyable text as fallback |

---

## Architecture

```
Next.js app (web/)
  app/
    page.tsx              ← blog home — recipe grid
    record/
      page.tsx            ← recording page + review screen
    recipe/[token]/
      page.tsx            ← individual recipe page with audio player
    api/
      capture/route.ts    ← POST: receive audio + optional photo → run pipeline → return recipe
      recipes/route.ts    ← GET: fetch all recipes from Supabase
      image/route.ts      ← POST: generate DALL-E image for a dish name

Python pipeline (unchanged)
  tools/transcribe.py     ← called by capture API route via Python subprocess or direct import
  prompts/translate.py
  prompts/structure.py
  tools/storage.py
```

**Key decision to make at /plan time:** Does the Next.js API route call the Python pipeline directly (subprocess), or does it call the FastAPI server as a sidecar? Recommend: keep FastAPI as the backend, Next.js calls `http://localhost:8080/capture`. Clean separation, no Python-in-Node.

---

## Image generation (new Call C)

```python
# prompts/image.py
IMAGE_PROMPT_TEMPLATE = (
    "A beautiful, appetizing photograph of {dish_name}, "
    "a traditional South Indian dish. "
    "Warm lighting, rustic wooden surface, authentic presentation. "
    "No text, no watermarks."
)

def generate_dish_image(dish_name: str) -> str:
    """Call DALL-E 3. Returns image URL (hosted by OpenAI for 1hr, then save to Supabase)."""
```

---

## Supabase schema additions

```sql
ALTER TABLE recipes ADD COLUMN image_url text;

-- Supabase Storage buckets needed:
-- "audio"   — private, accessed via signed URL for playback
-- "images"  — public, served directly on blog
```

---

## Pages — visual spec

### `/record`
```
┌─────────────────────────────┐
│  🫙 RecipeKeepsake          │
│                             │
│  [ 📷 Add photo ]           │  ← optional, from camera roll
│                             │
│        🎙️                   │  ← big record button
│     Tap to record           │
│                             │
│  ── after stop ──           │
│  ✅ Transcribing...         │
│  ✅ Translating...          │
│  ⏳ Building recipe...      │
│  ○  Generating image...     │
│                             │
│  ── review screen ──        │
│  [dish image]               │
│  Dish: Pesarattu      ✏️    │
│  Ingredients          ✏️    │
│  Steps                ✏️    │
│  Grandma's notes            │
│  ⚠️ Review flags            │
│  [Regenerate image]         │
│                             │
│  [ Save & Notify 💬 ]       │
└─────────────────────────────┘
```

### `/` (blog home)
```
┌─────────────────────────────┐
│  🫙 Grandma's Recipes       │
│                             │
│  [img] Pesarattu            │
│        Grandma · Apr 29     │
│                             │
│  [img] Gongura Pachadi      │
│        Grandma · Apr 28     │
│                             │
│  [img] Pongal               │
│        Grandma · Apr 27     │
└─────────────────────────────┘
```

### `/recipe/[token]`
```
┌─────────────────────────────┐
│  [full dish image]          │
│  Pesarattu                  │
│  Grandma · Apr 29, 2026     │
│                             │
│  ▶ [audio player]           │
│                             │
│  INGREDIENTS                │
│  moong dal      1 cup       │
│  green chilli   2           │
│                             │
│  STEPS                      │
│  1. Soak moong dal...       │
│  2. Grind to batter...      │
│                             │
│  GRANDMA'S NOTES            │
│  "Add oil until it          │
│   smells right"             │
└─────────────────────────────┘
```

---

## Decisions to append to decisions.log

- Phase 1 = Next.js blog + FastAPI sidecar (not combined). Next.js handles UI and routing; FastAPI handles Python pipeline. Clean separation.
- Image: photo-first (user uploads), DALL-E 3 fallback if no photo. Stored in Supabase Storage `images` bucket.
- Audio: stored in Supabase Storage `audio` bucket (private, signed URL for playback).
- Share: manual WhatsApp share after review. No auto-notify. Pavani controls who sees what and when.
- Blog is public (link-accessible) but obscure (token-based URLs, not indexed).
