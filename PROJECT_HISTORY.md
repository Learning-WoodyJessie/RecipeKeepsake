# Echoes of Home — Project History

One-paragraph summary per session. Most recent first.

---

## 2026-05-05 — Observability, Evals, and Model Config

### Accomplished
- **Observability P0**: React ErrorBoundary wraps root layout (D-007); `_RequestIDMiddleware` adds `X-Request-ID` to every response, `authFetch` surfaces it on errors (D-008)
- **Observability P1**: `[pipeline] stage=... duration=...s` timing logs on every capture (D-009); `/health` endpoint probes DB and returns 503 on failure (D-010)
- **Evals Tier 1**: `tests/evals/test_vague_placement.py` — 4 parametrized live-model cases gated behind `@pytest.mark.evals` + `addopts = -m "not evals"` in `pytest.ini` (D-012)
- **Model config split**: `translate_model` / `structure_model` keys in `config.yaml`; each pipeline stage reads its own key with fallback (D-014 partial)
- **Kaizen**: `scripts/capture.py` refactored to use `run_transcribe` + `run_transform` — CLI captures now get timing logs and model config split
- **Test count**: 97 → 107 (+10 unit tests, +4 eval cases deselected)

### Learned
- `@pytest.mark.evals` marks tests but does NOT exclude them — `addopts = -m "not evals"` in `pytest.ini` is required for actual exclusion (gotcha logged)
- First eval run immediately found a real quality regression: `gpt-4o-mini` placed "a little" in `ingredients.quantity` on 1/4 cases — proves the eval harness works and that model swap needs prompt tuning first (D-015)
- `scripts/capture.py` was a parallel orchestration path that bypassed the pipeline abstraction — CLI and HTTP server now share the same code path

### Deferred
- D-011: Structured logging (P2) — large refactor, deferred
- D-013: Golden audio fixtures (Eval Tier 2) — manual recording task outside codebase
- D-014: LLM-as-judge harness (Eval Tier 3) — deferred until fixtures exist
- D-015: `gpt-4o-mini` for Call B — reverted; needs `STRUCTURE_SYSTEM` prompt hardening first

### Next
- D-002: Whisper hallucination fix (blocks Phase 4 Memories Expansion)
- Phase 4: Memories Expansion brainstorm once D-002 resolved

---

## 2026-05-05 — Observability + Evals Brainstorm

### Accomplished
- Logged D-007 through D-014: observability P0/P1/P2 and eval tiers 1–3 + model hybrid config
- Completed full evals analysis: 97 existing tests are behavioral/contract only — zero semantic quality assertions on LLM outputs
- Completed model analysis: translate_model stays gpt-4o (linguistic nuance), structure_model moves to gpt-4o-mini (schema fill, ~20x cheaper)
- Wrote PRD: `docs/plans/2026-05-05-observability-evals-design.md` — 4 blocks, 6 chunks

### Learned
- All current tests verify the right API calls are made — none verify the AI output is correct. The most important invariant (vague measurements preserved) is only tested at prompt level, never at output level.
- `gpt-4o-mini` is the safest model swap for Call B because structured extraction with a fully-specified schema is where size gap is smallest.
- ErrorBoundary must be a React class component — hooks cannot catch render errors.

### Deferred
- Eval Tier 2 (golden audio fixtures): requires recording real Telugu audio with known content — manual task outside codebase
- Eval Tier 3 (LLM-as-judge): deferred until golden fixtures exist
- P2 structured logging (D-011): large refactor, low immediate payoff vs P0/P1

### Next
- `/build` — execute `docs/plans/2026-05-05-observability-evals-design.md` chunk by chunk

---

## 2026-05-05 — Session 6: Phase 1.7 Frontend UI Polish + Responsive Layout

### Accomplished
- **Mockup alignment**: All 5 screens (Home, Our People, All Recipes, Capture, Upload) fully aligned to product mockups — hero banners, 2-column grids, right-panel tips sidebars, narrator photos, relationship pills, filter tags, CTA banners.
- **Watercolor hero images**: 3 bespoke illustrations deployed — `hero-home.png` (recipe book + family photos), `hero-people.png` (portrait + tea cup + book), `hero-memories.png` (recipe book + pie + cookies). FastAPI catch-all patched to serve direct files from `out/` (was 404ing all `public/` assets).
- **SVG logo**: Sidebar logo rebuilt as inline SVG — double ring, 14 waveform bars, heart centre, "Echoes of Home" serif text, decorative `—✦—` divider. Crisp at any size, no image dependency.
- **Responsive mobile layout**: Sidebar hidden on ≤699px; hamburger ☰ in top bar slides it in as a fixed drawer with backdrop overlay and × close button. Content wrapper gets `width: 100%` to prevent left-edge clipping in block context.
- **People page UX fix**: Row click navigates to `/memories?narrator=Name` (filtered recipes) instead of opening edit modal. Small pencil icon opens edit. "Play sample" removed. Live recipe count fetched from API (was hardcoded "0 recipes").
- **Narrator filter on All Recipes**: `?narrator=` URL param pre-filters the recipe grid when arriving from Our People.
- **Welcome home + P avatar**: Greeting updated to "Welcome home, {name} ♡" in serif; avatar changed to filled accent circle with white initial — consistent across top bar and sidebar footer.
- **Kaizen**: Extracted `readFavorites()` / `toggleFavorite()` to `frontend/lib/favorites.ts` — localStorage key `'rk_favorites'` was duplicated across 3 files with slightly different logic. Now single source of truth.

### Learned
- FastAPI `StaticFiles` only mounts `/_next/` — any flat file in `public/` (images, icons) returns 404 from the catch-all unless you explicitly check for direct files first. Local `next dev` masks this because it serves `public/` natively.
- `flex: 1` on a div inside `display: block` parent has no effect — `width: 100%` required alongside it for mobile layout switching.
- Wide watercolor illustrations with empty left half need `objectPosition: 65%+` to crop into the content area rather than showing blank cream space on mobile.

### Deferred
- D-001: `_load_config()` duplicated in `capture.py` + `serve.py`
- D-002: Whisper hallucination on mid-sentence stop
- D-003: `/generate-image` missing recipe fields
- D-005: `_user_id()` helper (4× repeated pattern in `serve.py`)
- Bottom CTA "Add Recipe" exact pixel match to mockup (colour/layout close but not pixel-perfect)

---

## 2026-05-05 — Session 5: Phase 1.6 Scale Hardening + Architecture Review

Six critical infrastructure fixes to support 10,000 users. All pure code changes — no new infrastructure.

### Accomplished
- **Supabase client singleton** (`tools/storage.py`): module-level `_supabase` — one client per process instead of one per DB call. Migrated all `create_client` patches in tests to `monkeypatch.setattr(_supabase, ...)`.
- **Async auth + local JWT verification** (`scripts/serve.py`): `require_auth` rewritten to `async` with `httpx.AsyncClient`; PyJWT added to verify token signature locally in microseconds; Supabase network call retained as fallback for revoked tokens. Eliminates ~75ms round-trip on every authenticated request.
- **Fail-closed auth** (`scripts/serve.py`): missing `SUPABASE_URL` in production now raises HTTP 500 instead of silently granting access to all endpoints.
- **Explicit CORS** (`scripts/serve.py`): `allow_methods` and `allow_headers` changed from `["*"]` to explicit lists — no wildcards.
- **Postgres distributed rate limiting** (`tools/storage.py`, `scripts/serve.py`, `data/migrations/003_rate_limits.sql`): replaced in-memory `_rec_counts` dict (broken across Railway instances) with `rate_limits` table + `increment_rate_limit()` Postgres function. Rate limiting now covers all LLM-backed endpoints: capture, translate, generate-image — each with its own configurable daily limit.
- **RLS confirmed** (D-004 closed): `user_id::text = auth.uid()::text` policies verified active on `recipes` and `people` tables.
- **Architecture docs**: rewrote `docs/ARCHITECTURE.md` Section 1 (PRD) with empathic problem statement, 5 personas, 7 user journeys. Added Section 11 (Data Models with ER diagram, known gaps) and Section 12 (Security map). Updated `docs/ROADMAP.md` with Phase 1.6 (scale hardening), Phase 1.7 (frontend migration), Phase 5 expansion (profiles, family invite/roles). PRD, plan, and decisions all logged.
- **Test count**: 81 → 97 (+16 tests across `test_auth.py`, `test_rate_limit.py`, `test_storage.py`)

### Learned
- Module-level singletons break `patch("module.factory_fn")` test patterns — must migrate to `monkeypatch.setattr(module, "singleton_var", mock)` for test isolation.
- Local imports inside function bodies (`from tools.storage import X`) prevent patching the name at test time; module-level imports are required for patchability.
- `web/nextjs/` is a very early scaffold (3 incomplete pages, no auth, old branding) — Phase 1.7 is a frontend rebuild, not a small refactor. Sequencing it after Phase 1.6 was the right call.

### Deferred
- D-002: Whisper hallucination on mid-sentence stop — still blocks Phase 4
- D-003: `/generate-image` endpoint missing recipe fields in enriched prompt
- D-005: `user.get("sub") or user.get("id", "")` repeated 4× — extract to `_user_id()` helper (nitpick)
- Phase 1.7 (Frontend Migration): `web/app.html` → `web/nextjs/` — planned after Phase 1.6

---

## 2026-05-01 — Session 4: Web App Polish + Echoes of Home pivot

Major UI overhaul across five screens and a product rename. **Our People** screen rebuilt as a two-column card layout with full CRUD — add/edit/delete person with photo upload (file → base64) or URL paste, unified modal with dynamic title/button. **Home screen** redesigned: welcome card with polaroid illustration, horizontal favorites scroll row (persisted in `localStorage['rk_favorites']`), recent memories list with deterministic waveform bars per token, right sidebar with quote card and tips. **Capture a Memory** and **Upload Recording** screens redesigned with two-column layouts, tips sidebars, waveform visualiser, and narrator chips. **App renamed** from "Dadi's Recipes" to "Echoes of Home" with tagline *"Every family carries a world. Don't let it fade."* — all narrator-specific strings (`rd-kitchen-badge`, `rd-hear-label`, `rd-tip-tab`, `rd-ing-title`, `cooking-mode-label`) made dynamic from `r.narrator` at render time. **Delete recipe** implemented: trash icon → slide-in red confirmation banner with dish name, `DELETE /recipe/{token}` endpoint with ownership check, `tools/storage.delete_recipe()`. **Translation 500 fix**: GPT-4o returning markdown-fenced JSON despite instructions — fixed with `json_mode=True` (→ `response_format: json_object`) + fence-strip fallback in `translate_recipe.py`; same pattern already existed in `structure.py`. **No-cache headers** added on `app.html` FileResponse — prevents Railway CDN + mobile browser (including incognito) serving stale versions. **Memories nav scaffold**: sidebar now has a "Memories" group heading with "All Recipes" nested under it, setting up the structure for Remedies, Stories, Songs, Wisdom.

**Status at end of session:** All Phase 1 + 1.5 web features complete and live on Railway. Memories nav structure in place. Android app paused (needs app rename + re-sync + testing before Play Store). Next: brainstorm Memories expansion (Phase 4).

---

## 2026-04-30 — Session 3: Mobile App (Android) + Architecture Docs

Principal architect review: produced `docs/ARCHITECTURE.md` with PRD, full system design, ASCII flow diagrams (capture, browse, auth), 8 design decisions, test strategy, deployment, and env vars. DRY cleanup: extracted `load_config()` to `tools/config.py` (D-001 fixed). Added `store_image()` to `tools/storage.py` — downloads DALL-E URLs at capture time and stores permanently in Supabase `images` bucket (DALL-E CDN expires in ~1hr). Added `/privacy` endpoint serving `web/privacy.html` (Play Store / App Store requirement). Added per-user in-memory rate limiting (10 recordings/day, `MAX_RECORDINGS_PER_DAY` env var). Rebuilt the pre-auth landing page to match an Indian grandmother app wireframe (lp- CSS prefix, hero with food bg photo, feature grid, recipe card scroll, quote banner, bottom nav). Added sign-out button in topbar, and first-login welcome modal with name/relationship/photo/notes fields. Decided to publish to Android Play Store first (iOS later once verified), using Capacitor Live URL approach (loads Railway URL from native shell). Created `capacitor.config.json` (`com.recipekeepsake.app`), `package.json` with Capacitor 8.x packages. Built `scripts/make_assets.py` (Pillow, generates 1024×1024 icon + 2732×2732 splash). `npx cap add android` scaffolded full Android project; `capacitor-assets` generated 87 icon/splash variants. `AndroidManifest.xml` updated with RECORD_AUDIO permission and `recipekeepsake://` deep link intent filter. `signInWithGoogle()` updated to detect native context and use `Capacitor.Plugins.Browser` to open system browser (bypasses Google's WebView OAuth block); `initAuth()` adds `App.addListener('appUrlOpen')` deep link handler to capture OAuth tokens. Updated ROADMAP.md with Phases 2 (Android) and 3 (iOS).

**Status at end of session:** Android project built locally. Next step: open `android/` in Android Studio → build signed AAB → Play Console internal testing track. Also need Supabase setup: add `recipekeepsake://auth/callback` redirect URL + create public `images` bucket.

---

## 2026-04-30 — Session 2: Phase 1 Web App Build

Built the full Phase 1 web application on top of the Phase 0 pipeline. Three-step review wizard: audio submitted → grandma spinner with rotating encouragement messages → editable review screen (inline ingredient and step editing) → "Preserved forever" confirmation card. Pipeline refactored into typed dataclasses (`TranscriptResult`, `RecipeData`, `SavedRecipe`) and a thin HTTP adapter so `serve.py` delegates to `pipeline/` package rather than doing pipeline logic itself. Two FastAPI endpoints added: `POST /capture/process` (transcribe + translate + structure, no save) and `POST /capture/save` (persist reviewed recipe to Supabase). Telugu cooking glossary YAML (`data/glossary.yaml`) built and injected into both Whisper `initial_prompt` and the Call A translation system prompt — improves term recognition for Tamil/Telugu cooking vocabulary. Transcription engine updated to `gpt-4o-transcribe` with `language=te` (Whisper-1 was misdetecting Telugu as Hindi). DALL-E image generation added (`prompts/image.py`) with permanent Supabase storage so DALL-E CDN expiry doesn't break cards. Language switcher built: `prompts/translate_recipe.py` translates structured fields into EN/TE/HI/KN/ES/FR; `GET /recipe/{token}/translate?lang=` endpoint with Supabase `translations` JSONB column caching; client-side `_translationCache` for instant re-switching without re-fetching. Upload Recording screen built alongside Capture — same wizard flow, different entry point.

**Status at end of session:** Full capture-to-card pipeline working end-to-end. Language switcher live. Ready for UI polish (Session 4) and Android packaging (Session 3).

---

## 2026-04-29 — Session 1: Bootstrap + Brainstorm

Bootstrapped the project from scratch. Created the full SDLC scaffold: `CLAUDE.md`, `docs/ROADMAP.md`, `.agent/decisions.log`, `.agent/gotchas.md`, `.agent/workflows/` with all 8 workflow files (`/start`, `/brainstorm`, `/plan`, `/build`, `/audit`, `/kaizen`, `/log`, `/closeout`). Ran `/brainstorm` for the core pipeline feature — completed all 6 design steps. Key decisions made: voice-first Telugu capture (not OCR/video), two-step LLM pipeline (translate separate from structure to preserve vague measurements), Supabase for storage, human review before every share, WhatsApp link sharing (`/recipe/[token]`), Phase 0 = CLI only. Built Phase 0 tools: `tools/transcribe.py` (Whisper), `prompts/translate.py` (Call A), `prompts/structure.py` (Call B), `tools/storage.py` (Supabase insert/get), `scripts/capture.py` (orchestrator). FastAPI server scaffolded (`scripts/serve.py`). First web prototype (`web/index.html`) for voice→recipe card smoke testing. PRD saved to `docs/plans/2026-04-29-core-pipeline-design.md`. All decisions appended to `.agent/decisions.log`. Fixed slash commands — copied workflows from `.agent/workflows/` to `.claude/commands/` so `/brainstorm`, `/plan`, etc. work natively in Claude Code.

**Status at end of session:** Phase 0 CLI pipeline working. Phase 1 web app ready to plan and build.
