# Echoes of Home — Roadmap

> *Every family carries a world. Don't let it fade.*

Formerly "RecipeKeepsake". Pivoted in Session 4 to a broader family memory platform.
The recipe pipeline remains the core; the vision now extends to Remedies, Stories, Songs, and Wisdom.

---

## Phase 0 — Core pipeline ✅
- [x] PRD approved (brainstorm complete)
- [x] Whisper transcription tool (`tools/transcribe.py`) with Telugu glossary injection
- [x] Two-step LLM pipeline (`prompts/translate.py`, `prompts/structure.py`)
- [x] Telugu cooking glossary YAML (`data/glossary.yaml`) injected into both Whisper + Call A
- [x] CLI capture script (`scripts/capture.py`)
- [x] Supabase schema + storage bucket (`tools/storage.py`)
- [x] Tests for all tools and prompts (mocked)

## Phase 1 — Web app foundation ✅
- [x] Single-file HTML SPA (`web/app.html`) served by FastAPI on Railway
- [x] Three-step review wizard (grandma spinner → editable ingredients/steps → "Preserved forever")
- [x] Pipeline refactor: typed dataclasses (`TranscriptResult`, `RecipeData`, `SavedRecipe`), thin HTTP adapter
- [x] DALL-E image generation with permanent Supabase storage (`prompts/image.py`, `tools/storage.store_image`)
- [x] Audio + image upload to Supabase Storage (private bucket, signed URLs)
- [x] Individual recipe view — card + audio player + share token
- [x] Language switcher — translate ingredients/steps/cook_notes/dish_name into EN/TE/HI/KN/ES/FR
  - `prompts/translate_recipe.py`, `GET /recipe/{token}/translate`, Supabase `translations` JSONB caching
  - Client-side `_translationCache` for instant re-switching
- [x] Google OAuth (Supabase) — sign in / sign out
- [x] First-login welcome modal (name, relationship, emoji, photo, notes)
- [x] Per-user rate limiting (10 recordings/day, configurable via `MAX_RECORDINGS_PER_DAY`)
- [x] Privacy policy page at `/privacy` (Play Store / App Store compliant)
- [x] Indian grandmother-themed landing page (pre-auth)
- [x] Architecture docs — `docs/ARCHITECTURE.md`

## Phase 1.5 — Web app polish ✅
Full UI overhaul to match the "Echoes of Home" identity and make the app feel like a real keepsake product.

- [x] **App rename** — "Dadi's Recipes" → "Echoes of Home", tagline: *"Every family carries a world."*
  - All narrator-specific strings (kitchen badge, hear label, tip tab, ingredients title, cooking mode) are now dynamic — pulled from `r.narrator` at render time, not hardcoded as "Dadi"
- [x] **Home screen** — welcome card with polaroid illustration, favorites horizontal scroll row, recent memories list with waveform bars, right sidebar (quote card + tips)
  - Favorites persisted in `localStorage['rk_favorites']` as token set; sort toggle (favorites-first / recent-first)
  - Deterministic waveform bars per token (stable across re-renders)
- [x] **Our People screen** — two-column layout with person cards (avatar, relationship pill, bio, stats)
  - Full CRUD: add / edit / delete with photo upload (file → base64) or URL paste
  - Unified add/edit modal with dynamic title/button text
- [x] **Capture a Memory screen** — two-column layout, tips sidebar, waveform visualiser, privacy badge, narrator chips (Ammamma / Grandma)
- [x] **Upload Recording screen** — cassette hero illustration, tips sidebar, same post-upload wizard flow
- [x] **Delete recipe** — two-step confirmation: trash icon → slide-in red banner (shows dish name, irreversible warning, Cancel + "Delete forever")
  - `DELETE /recipe/{token}` endpoint with ownership check; `tools/storage.delete_recipe()`
- [x] **Translation 500 fix** — GPT-4o markdown fences crashing `json.loads()`; fixed with `json_mode=True` + fence-strip fallback in `translate_recipe.py`
- [x] **No-cache headers** on `app.html` — prevents Railway CDN + mobile browser (incognito) serving stale version
- [x] **Memories nav group** — sidebar now has a "Memories" heading with "All Recipes" nested under it; scaffolds future memory types

## Phase 2 — Android app 🚧
Paused while Phase 1.5 polish and Memories expansion are underway. Resume after Phase 4.

- [x] Brainstorm + PRD: `docs/plans/2026-04-30-mobile-app.md`
- [x] Capacitor scaffold: `capacitor.config.json`, `package.json`
- [x] App icon (1024×1024) + splash (2732×2732) — `scripts/make_assets.py`
- [x] 87 Android icon/splash variants generated via `capacitor-assets`
- [x] AndroidManifest: `RECORD_AUDIO`, deep link `recipekeepsake://auth/callback`
- [x] Google OAuth native fix: Capacitor Browser → system browser → deep link callback
- [x] Build signed AAB in Android Studio (Build → Generate Signed Bundle)
- [ ] **Supabase setup** (manual, required before testing auth):
  - [ ] Add `recipekeepsake://auth/callback` to Supabase Auth → URL Configuration → Redirect URLs
  - [x] Create public `images` bucket (for DALL-E permanent storage)
- [ ] **Update app identity** — rename to "Echoes of Home" in `capacitor.config.json`, regenerate assets
- [ ] **Test on emulator/device** (before Play Store):
  - Android Studio → Run ▶ on emulator or physical device
  - Verify Railway URL loads inside the app
  - Verify Google sign-in opens Chrome and returns correctly via deep link
  - Verify microphone permission prompt appears on first record
  - Verify a recipe can be captured end-to-end
- [ ] **Final sync + rebuild** after all tests pass:
  - `npx cap sync` — copy latest web assets into Android project
  - Rebuild signed AAB
- [ ] **Google Play Console submission** (last step):
  - New app → "Echoes of Home" → `com.recipekeepsake.app` (or update bundle ID)
  - Privacy policy URL: `https://vibrant-spontaneity-production-9f92.up.railway.app/privacy`
  - Internal testing track → upload AAB → invite testers via Gmail
  - Production release after internal testing verified

## Phase 3 — iOS (TestFlight) — after Android verified
- [ ] `npx cap add ios` (requires macOS + Xcode 15+)
- [ ] Apple Developer account ($99/year)
- [ ] Microphone usage description in `Info.plist`
- [ ] URL scheme `recipekeepsake://` in Xcode
- [ ] `npx cap sync ios` → Xcode → Archive → TestFlight upload
- [ ] App Store submission after TestFlight verified

## Phase 4 — Echoes of Home: Memories expansion 🔜
*Brainstormed 2026-05-01. The Memories nav group is already in place as the scaffold.*

The recipe pipeline is the proven template. Each new memory type follows the same pattern:
**voice recording → narrator → structured content** — just with a different schema.

- [ ] **Brainstorm** — finalise which memory types to build first (Remedies, Stories, Songs, Wisdom)
- [ ] **Schema design** — Supabase `memories` table with `type` discriminator, or separate tables per type
- [ ] **Remedies** — `ailment`, `ingredients`, `preparation`, `caution`
- [ ] **Stories** — `title`, `era`, `people_mentioned`, `transcript`  
- [ ] **Songs / Lullabies** — `title`, `language`, `occasion`, `lyrics` (transcribed)
- [ ] **Wisdom / Proverbs** — `saying`, `language`, `meaning`, `origin`
- [ ] **Unified capture flow** — narrator chip → memory type selector → record → review → preserve
- [ ] **Memories browse** — "All Recipes" becomes one item; Memories landing shows type grid

## Phase 5 — Search + discovery
- [ ] Full-text search across all memory types
- [ ] Filter by memory type, narrator, era, occasion
- [ ] "On this day" — surface a memory from the archive each time you open the app
- [ ] Collections / albums — group memories by event (e.g. "Diwali", "Wedding")

---

## Won't build (explicit exclusions)
- Sharing / social features — this is private family data
- Automated sends or notifications — no delivery layer needed
- Edit-in-place UI for ingredients — edit via review flow only
- PWA — explicitly excluded in favour of native Capacitor app
- Transliteration (Roman script for Telugu words) — not needed; native script is the authentic form
