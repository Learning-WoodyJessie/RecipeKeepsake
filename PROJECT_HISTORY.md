# Echoes of Home — Project History

One-paragraph summary per session. Most recent first.

---

## 2026-07-08 — Phase 4: Memories Expansion (recipes→memories migration + song/story pipeline)

### Accomplished
- **M.1 — Python migration**: Renamed `recipes` table → `memories`, `dish_name` → `title` across all Python files (`tools/storage.py`, `tools/groups.py`, `pipeline/persist.py`, `pipeline/transform.py`, `pipeline/models.py`, `scripts/serve.py`, `scripts/capture.py`, `prompts/structure.py`, `prompts/image.py`, `prompts/translate_fields.py`) and all test files (12 files swept via batch sed). 137 tests stayed green.
- **M.2 — Frontend migration**: Swept `dish_name` → `title` across 9 frontend files (`home`, `memories`, `memory`, `family`, `shared/detail`, `shared`, `MemoryCard`, `MemoryListRow`, `ReviewWizard`). Next.js build verified clean (20 static routes, 0 TS errors).
- **A.1 — Auto-transcription for song/story**: `/save-audio` endpoint now calls `run_transcribe()` (Whisper + translate) when audio is uploaded, `original_text` is empty, and `memory_type != "recipe"`. Recipes continue using `/capture/process`. New test file `tests/test_save_audio.py` with 4 tests covering: auto-transcribe path, transcript fields populated correctly, user-supplied text skips Whisper, recipe type skips Whisper.
- **C.1 — Song/story detail view**: Added `isNonRecipe()` helper. Transcript `<details>` now opens by default for song/story (closed for recipe). Label changes to "Transcript" vs "Full transcript". Recipe fields (ingredients, steps, cook notes) already gated behind `!memory.type || memory.type === 'recipe'` — confirmed working.
- **Test count**: 137 → 196 (+59 tests)

### Learned
- FastAPI `File(...)` form fields must be passed as `data={}` in TestClient requests, not bundled into `files={}` — mixing them causes 422 Unprocessable Entity.
- `pipeline.transcribe.run_transcribe()` already does Whisper + translate as a single composable call returning `TranscriptResult(raw, english)` — reuse it in `/save-audio` rather than duplicating the logic.
- Migration scope is always larger than the initial grep: `scripts/capture.py` and `prompts/translate_fields.py` were missed in the initial plan but surfaced immediately by running the test suite after the first sweep.

### Deferred
- Supabase SQL must be run in dashboard before deploying: `ALTER TABLE recipes RENAME TO memories; ALTER TABLE memories RENAME COLUMN dish_name TO title;` (project: `wucsfihcophwqynqkqkf`)
- `isNonRecipe()` added but lines 653/696 in `memory/page.tsx` still use inline `memory.type !== 'recipe'` — nitpick, consistent logic
- Call B prompts for song/story (lyrics, era, people_mentioned) — Phase 4 continued work
- Per-type review wizard (song/story gets single-screen; recipe stays 3-step) — Phase 4 continued work

### Next
- Phase 4 continued: per-type Call B prompts (song schema, story schema), type-aware review wizard, memories browse by type
- D-002 real-model eval confirmation (Whisper hallucination)
- D-015 `gpt-4o-mini` re-eval
- Android app identity rename (Phase 2 — paused)

---

## 2026-07-07 — Family Sharing: Content Types, Groups, Portal, WhatsApp

### Accomplished
- **Gemini file polling fix**: Added `client.files.get()` polling loop in `tools/transcribe.py` — waits for `state.name == "ACTIVE"` before calling `generate_content()`. Fixed `400 FAILED_PRECONDITION` crash on real device. Tests updated in `test_transcribe.py`, `test_pipeline_stages.py`, `test_pipeline_timing.py`.
- **Content types (Phase A)**: `type` field added to `/save-audio` endpoint (`recipe|song|story|fable|moral`). Type picker UI on upload page. Type badge on memory detail page. `run_persist()` writes `type: "recipe"` by default.
- **Family groups (Phase B)**: `tools/groups.py` — 8 functions for family group CRUD (create, join, member list, recipe list). 5 new endpoints in `serve.py` (`POST /family/groups`, `GET /family/groups/me`, `POST /family/groups/join/{token}`, `GET /family/members`, `GET /family/recipes`). Account page `FamilyGroupSection` — create group, copy portal/invite URLs. Home page shows family recipes with contributor attribution when in a group. Join page (`/join`) with Suspense wrapper.
- **Public portal (Phase C)**: `portal_visible` boolean column opt-in per memory. `GET /portal/{token}` — public, no auth. Portal toggle button on memory detail (Chunk 3.3). `publicFetch` + `api.portal.get` in `api.ts` (Chunk 3.4). Public `/family?p=TOKEN` page with type filter tabs, inline audio, join nudge (Chunk 3.5).
- **WhatsApp sharing (Phase D)**: `frontend/lib/share.ts` — bilingual (English + Telugu) message builder for all 5 content types + portal intro. `openWhatsApp()` on memory detail upgraded to use per-type bilingual copy pointing to portal URL. Green WhatsApp Share button on account page next to portal URL copy row.
- **Architecture docs**: `docs/ARCHITECTURE.md` and `docs/SYSTEM_DESIGN.md` updated to reflect Gemini 2.5 Flash, Next.js frontend, current layout, and security model.
- **Test count**: 137 → 192 (+55 tests across groups, persist, transcribe, pipeline)

### Learned
- Gemini File API is async — `files.upload()` returns before the file is ready. Must poll `files.get()` until `state.name == "ACTIVE"`. Tests need `files.get.return_value.state.name = "ACTIVE"`.
- `useSearchParams()` in Next.js static export (`output: 'export'`) requires the calling component to be wrapped in `<Suspense>` — otherwise `next build` fails with prerendering error. Use `?p=TOKEN` query params (not `/[token]` route segments) for runtime tokens.
- WhatsApp Business Groups API only works for business-created groups (max 8 members) — cannot read consumer group membership. Deep link (`wa.me/?text=...`) is the only viable approach for family sharing.
- `window.open()` must be the first synchronous call in a click handler on iOS Safari — any `await` before it causes the popup to be silently blocked.
- Family group data model doesn't need a `family_group_id` on recipes — two-query pattern (member `user_id`s → recipes `IN` those ids) derives group membership without schema changes.

### Deferred
- D-017: `WaIcon` SVG duplicated in `memory/page.tsx` and `account/page.tsx` — extract to `frontend/components/WaIcon.tsx` when a third usage appears (nitpick)
- Instagram sharing — future phase, requires image card generation
- WhatsApp Business API — not feasible; documented as won't-build
- Phase 4 (Memories Expansion) — full schema migration (`memories` table replacing `recipes`), per-type Call B prompts, type-aware review wizard

### Next
- Phase 4 — Memories Expansion: `memories` table, type-discriminated schema, per-type pipelines (remedy, song, story, wisdom)
- D-002 real-model eval confirmation (Whisper hallucination — fix applied, live eval still pending)
- D-015 `gpt-4o-mini` re-eval (structure prompt fix applied, live eval still pending)
- Android app identity rename (Phase 2 — paused)

---

## 2026-05-06 — Structured Logging, Cache Correctness, and Observability Gaps

### Accomplished
- **Structured JSON logging** (Chunk 1.1): Python `logging` + `contextvars.ContextVar` replaces all `print()` in `serve.py`. `_JSONFormatter` outputs `{ts, level, req, event}` JSON to stdout. `_RequestIDMiddleware` now sets the ContextVar so every log line in a request carries the same `req` ID — searchable in Railway. Print removed from `pipeline/` and `tools/storage.py` too (Chunk 1.2).
- **DALL-E timing** (Chunk 1.3): `_generate_image()` logs `event=image_done duration=Xs` with `time.perf_counter()` so image generation cost is visible per capture.
- **4xx/5xx rate logging** (Chunk 1.3): `_RequestIDMiddleware` logs `event=request_error status=NNN method=... path=...` for every non-2xx response — Railway search now shows error frequency by status code.
- **Frontend error reporting** (Chunk 1.4): `POST /client-error` endpoint receives error reports from `ErrorBoundary.componentDidCatch` and logs them as `event=client_error` to Railway — silent client crashes now surface without a third-party service.
- **Admin cache-clear** (Chunk 2.3): `POST /admin/clear-translation-cache?lang=te&secret=xxx` clears stale cached translations for one language across all recipes, protected by `ADMIN_SECRET` env var.
- **Atomic JSONB cache** (Chunk 2.1): Replaced read-modify-write in `cache_translation()` with a single atomic Postgres UPDATE via `set_recipe_translation()` RPC. Two concurrent translation requests for different languages can no longer overwrite each other.
- **Cache hit/miss events** (Chunk 2.2): `event=translation_cache_hit/miss` and `event=translation_llm_done duration=Xs` added to translate endpoint — Railway search now shows cache economics and LLM call frequency.
- **Test count**: 107 → 114 (+7 tests)

### Learned
- `propagate = False` on a named logger blocks pytest's `caplog` — caplog installs its handler on the root logger, so records only flow there if the child logger propagates. Removing `propagate = False` is the right fix; there's no double-logging risk in production since no root handlers are configured there.
- FastAPI `Depends()` cannot be overridden with `unittest.mock.patch()` — must use `app.dependency_overrides[dep_fn] = lambda: value` for test isolation, with a `finally: app.dependency_overrides.clear()` guard.
- The SPA catch-all in serve.py returns 200 (index.html fallback) for any unknown path when `frontend/out/index.html` exists — testing 4xx middleware logging requires hitting an actual auth-protected API endpoint without credentials.

### Deferred
- Supabase SQL setup for `set_recipe_translation()` RPC — must be run once in SQL editor before Chunk 2.1 goes live in production (documented in PRD and PRD header).
- `recipe_translations` table migration — logged to Phase 6.5 roadmap.

### Next
- Push to Railway, run `set_recipe_translation` SQL in Supabase editor, set `ADMIN_SECRET` env var.
- D-002: Whisper hallucination fix (still blocks Phase 4 Memories Expansion).

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
