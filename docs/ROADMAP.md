# Echoes of Home — Roadmap

> *Every family carries a world. Don't let it fade.*

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented — in production |
| 🚧 | In progress — partially built |
| 🔜 | Next — approved, not started |
| 📋 | Planned — scoped, future phase |
| ❌ | Won't build — explicit exclusion |

---

## MVP — Phases 0 through 1.5 ✅

Everything below is live. Recipe is the first memory type. The pipeline, web app, security hardening, and UI identity are complete.

---

### Epic 1 — Voice Capture Pipeline ✅

The core engine: voice in, structured memory out.

| Story | Status |
|---|---|
| Whisper transcription with explicit Telugu language setting | ✅ |
| Telugu cooking glossary injected into Whisper via `initial_prompt` | ✅ |
| Call A — faithful translation, vague language preserved verbatim | ✅ |
| Call B — structured extraction into typed JSON schema | ✅ |
| Two-step pipeline enforced — translate and structure never combined | ✅ |
| `LLMProvider` abstraction — swappable model backend | ✅ |
| CLI capture script for local testing | ✅ |
| All pipeline steps fully mocked in tests — no live API calls | ✅ |

---

### Epic 2 — Memory Review & Save ✅

The Keeper's editorial moment — review everything before committing.

| Story | Status |
|---|---|
| Three-step review wizard (confirm title → edit fields → save) | ✅ |
| Ingredients editable inline before save (add, remove, correct) | ✅ |
| Steps editable inline before save (add, remove, correct) | ✅ |
| LLM review flags surfaced in wizard for Keeper attention | ✅ |
| DALL-E image generated and attached to every memory | ✅ |
| Recipe-enriched DALL-E prompt (vessel, region, garnish, texture) | ✅ |
| Audio uploaded to private Supabase Storage bucket | ✅ |
| Memory saved to Supabase with full pipeline output | ✅ |
| Upload recording flow (existing audio file, same wizard) | ✅ |

---

### Epic 2.5 — Photo Upload ✅

*Completed 2026-07-09.*

| Story | Status |
|---|---|
| `POST /memories/{token}/photo` — multipart upload, validation, ownership check, rate-limited | ✅ |
| `upload_memory_photo()` in `tools/storage.py` — uploads to `memory-photos` Supabase bucket | ✅ |
| Review wizard Step 3 — optional photo section (replace AI image or add new) | ✅ |
| Memory detail page — "Change photo" / "Add a photo" button for all memory types | ✅ |
| `api.memories.uploadPhoto()` in `frontend/lib/api.ts` | ✅ |
| Supabase `memory-photos` bucket — public, 5 MB cap, JPEG/PNG/WebP | 🚧 manual SQL step |

---

### Epic 3 — Browse & Recall ✅

Finding and reliving captured memories.

| Story | Status |
|---|---|
| Home screen — favorites row + recent memories list + waveform bars | ✅ |
| All Memories list view | ✅ |
| Memory detail view — structured content, notes, transcript, audio player | ✅ |
| Language switcher — translate any memory to EN / TE / HI / KN / ES / FR | ✅ |
| Translation caching — translated content stored, not re-fetched | ✅ |
| Favorites — mark / unmark, persisted in localStorage | ✅ |
| Sort toggle — favorites-first or recent-first | ✅ |
| Delete memory — two-step confirmation, hard delete with audio cleanup | ✅ |
| Personal annotation (user notes) editable post-save | ✅ |
| Share token — per-memory URL for family access (auth required) | ✅ |

---

### Epic 4 — People Management ✅

Narrator profiles as first-class data.

| Story | Status |
|---|---|
| People screen — grid of narrator cards with photo, relationship, bio | ✅ |
| Add narrator — modal with name, relationship, emoji, photo, bio, notes | ✅ |
| Edit narrator — same modal pre-filled | ✅ |
| Delete narrator — confirmation, hard delete | ✅ |
| Narrator profiles stored in Supabase `people` table (not localStorage) | ✅ |
| Narrator chips on capture screen — select who is narrating | ✅ |
| First-login welcome modal — prompts Keeper to add first narrator | ✅ |

---

### Epic 5 — Authentication & Security ✅

Personal family data protected at every layer.

| Story | Status |
|---|---|
| Google OAuth via Supabase Auth | ✅ |
| JWT validation on every API request — stateless, no server session | ✅ |
| Auth required on all endpoints — no content accessible anonymously | ✅ |
| Per-user data isolation — all queries filter by `user_id` | ✅ |
| Audio bucket private — signed URLs generated server-side, 1hr expiry | ✅ |
| Ownership check on mutating endpoints (PATCH, DELETE) | ✅ |
| Per-user rate limiting — 10 recordings/day, configurable | ✅ |
| CORS locked to known origins via `ALLOWED_ORIGINS` env var | ✅ |
| Account deletion — cascades audio files, memories, people, auth user | ✅ |
| Privacy policy page at `/privacy` | ✅ |

---

### Epic 6 — Product Identity & UI ✅

The app feels like a family keepsake, not a utility.

| Story | Status |
|---|---|
| App renamed — "Echoes of Home", tagline: "Every family carries a world." | ✅ |
| Brand logo — waveform + heart circle | ✅ |
| Landing page — Indian family-themed, pre-auth | ✅ |
| Home screen — welcome card, polaroid illustration, sidebar quote | ✅ |
| Narrator-aware strings — all labels pull from `narrator` field, not hardcoded | ✅ |
| Capture screen — waveform visualiser, tips sidebar, privacy badge | ✅ |
| Memories nav group in sidebar — scaffolds future memory types | ✅ |
| No-cache headers on `app.html` — prevents stale version on Railway CDN | ✅ |

---

## Phase 1.6 — Scale Hardening ✅

*Completed 2026-05-05. PRD: `docs/plans/2026-05-04-scale-hardening-design.md`. Pure code changes — no new infrastructure.*

Target: system handles 10,000 users safely. All fixes are in `tools/storage.py` and `scripts/serve.py` plus one new Postgres table.

**Deferred from this phase:** job queue for async capture pipeline (revisit when concurrent captures regularly exceed 5); API gateway for infrastructure-layer rate limiting (Phase 5+).

### Epic A — Connection & Auth Hardening

| Story | Status |
|---|---|
| Supabase client singleton — `_client()` returns module-level instance, not a new client per call | ✅ |
| `require_auth` uses `httpx.AsyncClient` + `await` — non-blocking in async handler | ✅ |
| Local JWT verification via `PyJWT` + `SUPABASE_JWT_SECRET` — no Supabase round-trip on happy path | ✅ |
| Supabase network call retained as fallback when local verification fails | ✅ |
| `require_auth` raises HTTP 500 (not silent pass) when `SUPABASE_URL` missing in production | ✅ |
| CORS: explicit `allow_methods` and `allow_headers` — no wildcards | ✅ |
| Add `PyJWT` to `requirements.txt` | ✅ |

### Epic B — Distributed Rate Limiting

Rate limiting applies to all LLM-backed endpoints — not capture only. Translate and generate-image also call OpenAI on the user's account; abuse on any endpoint incurs cost.

| Story | Status |
|---|---|
| `rate_limits` table migration — `(user_id, date, endpoint)` primary key, atomic upsert | ✅ |
| Rate limit enforced on `POST /capture` via Postgres upsert | ✅ |
| Rate limit enforced on `GET /recipe/{token}/translate` | ✅ |
| Rate limit enforced on `POST /generate-image` | ✅ |
| Per-endpoint daily limits configurable via env vars | ✅ |
| Remove in-memory `_rec_counts` / `_rec_dates` dicts | ✅ |

### Epic C — RLS Confirmation (D-004)

| Story | Status |
|---|---|
| Confirm RLS enabled on `recipes` table in Supabase dashboard | ✅ |
| Confirm RLS enabled on `people` table in Supabase dashboard | ✅ |
| Policy verified: `user_id::text = auth.uid()::text` on both tables | ✅ |
| D-004 closed in `docs/BUGS.md` | ✅ |

### Epic D — Tests

| Story | Status |
|---|---|
| `tests/test_auth.py` — singleton, async auth, local JWT verify, fail-closed behaviour | ✅ |
| `tests/test_rate_limit.py` — Postgres upsert, cross-endpoint limits, 429 response | ✅ |

---

## Phase 1.7 — Frontend Migration ✅

*Completed 2026-05-05. PRD: `docs/plans/2026-05-05-frontend-migration-design.md`.*

Migrated production frontend from `web/app.html` (single-file vanilla JS SPA, 4,900 lines) to `frontend/` (Next.js 14 + React + TypeScript, static export). FastAPI serves the Next.js static export from `frontend/out/` on Railway — Vercel cutover deferred to Phase 1.8.

**Key decisions:**
- **Static export** (`output: 'export'`) — not SSR. App is private/authenticated, all screens use browser APIs.
- **`frontend/` top-level directory** — moved from `web/nextjs/`. Clear separation from backend.
- **FastAPI serves `frontend/out/`** — `/_next/` mounted as StaticFiles; catch-all checks direct files before `index.html` (fixes public asset 404s).
- **Vercel cutover deferred** — frontend is live on Railway; separate Vercel deployment is Phase 1.8.

### Epic F1 — Foundation & Auth

| Story | Status |
|---|---|
| Rebrand — "Echoes of Home" branding, tagline, SVG logo (double ring + waveform bars + heart) | ✅ |
| Supabase Auth wired up — Google OAuth, session management, protected routes | ✅ |
| Landing page (pre-auth) — watercolor hero, feature grid, quote banner | ✅ |
| First-login welcome modal — prompt Keeper to add first narrator | ✅ |
| Sidebar navigation — all nav groups, active state, mobile-responsive drawer | ✅ |
| Mobile hamburger ☰ — fixed drawer, backdrop overlay, × close | ✅ |
| Welcome greeting — "Welcome home, {name} ♡" serif, filled accent avatar | ✅ |

### Epic F2 — Capture Flow

| Story | Status |
|---|---|
| Capture screen — waveform visualizer, narrator picker, tips sidebar, privacy badge | ✅ |
| 3-step review wizard — confirm title → edit fields → save | ✅ |
| Upload recording flow — existing audio file through same wizard | ✅ |

### Epic F3 — Browse & Recall

| Story | Status |
|---|---|
| Home screen — watercolor hero banner, favorites row, recent memories list, waveform bars | ✅ |
| All Memories list view — watercolor hero banner, narrator filter, recipe count | ✅ |
| Memory detail view — structured content, notes, transcript, audio player | ✅ |
| Language switcher — translate any memory to EN / TE / HI / KN / ES / FR | ✅ |
| Favorites — mark/unmark, persisted in localStorage via `lib/favorites.ts` | ✅ |
| Delete memory — two-step confirmation | ✅ |
| Personal annotations — editable post-save | ✅ |
| Narrator filter — `?narrator=` URL param pre-filters grid from Our People page | ✅ |

### Epic F4 — People Management

| Story | Status |
|---|---|
| People screen — watercolor hero banner, narrator grid with live recipe count, relationship pill | ✅ |
| Add / edit / delete narrator modal | ✅ |
| Card click navigates to narrator's recipes (not edit modal); pencil icon for edit | ✅ |

### Epic F5 — Account

| Story | Status |
|---|---|
| Account deletion — cascades audio, memories, people, auth user | ✅ |
| Privacy policy page at `/privacy` | ✅ |

### Epic F6 — Cutover

| Story | Status |
|---|---|
| FastAPI static file serving fixed — direct files checked before index.html fallback | ✅ |
| `app.html` route removed from FastAPI — frontend served exclusively from `frontend/out/` | ✅ |
| Capacitor `server.url` + `webDir` pointed at Railway URL | ✅ |
| Deploy to separate Vercel CDN | ❌ Won't build — staying on Railway |

---

## Phase 1.8 — Observability & Evals Foundation ✅

*Completed 2026-05-05.*

| Story | Status |
|---|---|
| React ErrorBoundary — blank screen crashes show branded fallback (D-007) | ✅ |
| Request correlation IDs — `X-Request-ID` header on every response; surfaced in frontend errors (D-008) | ✅ |
| Pipeline stage timing — `[pipeline] stage=... duration=...s` logs on every capture (D-009) | ✅ |
| Real `/health` endpoint — probes Supabase, returns 503 on DB failure (D-010) | ✅ |
| Eval Tier 1 — `tests/evals/test_vague_placement.py`, gated `@pytest.mark.evals` (D-012) | ✅ |
| Model config split — `translate_model` / `structure_model` keys, independent tuning (D-014 partial) | ✅ |
| `scripts/capture.py` uses pipeline abstraction — CLI shares code path with HTTP server | ✅ |

**Deferred from this phase:**
- D-011: Structured logging (P2) — large refactor, low immediate payoff
- D-013: Golden audio fixtures (Eval Tier 2) — manual recording task
- D-014: LLM-as-judge harness (Tier 3) — needs fixtures first
- D-015: `gpt-4o-mini` for Call B — needs `STRUCTURE_SYSTEM` prompt hardening (failed 1/4 eval cases)

---

## Phase 2 — Android App 🚧

*Paused — resume after Phase 4 (Memories expansion). Core infrastructure built; identity and testing remain.*

### Epic 7 — Native Android App

| Story | Status |
|---|---|
| Capacitor scaffold — `capacitor.config.json`, `package.json` | ✅ |
| App icon (1024×1024) + splash (2732×2732) | ✅ |
| 87 Android icon/splash size variants generated | ✅ |
| AndroidManifest — `RECORD_AUDIO` permission, deep link scheme | ✅ |
| Google OAuth via system browser + deep link callback | ✅ |
| Signed AAB built in Android Studio | ✅ |
| Rename app identity to "Echoes of Home" in `capacitor.config.json` | 🚧 |
| Regenerate icons and splash under new branding | 🚧 |
| Add deep link redirect URL to Supabase Auth configuration | 🚧 |
| End-to-end test on emulator — load, sign in, capture, playback | 🚧 |
| Final `npx cap sync` + rebuild signed AAB | 🚧 |
| Google Play Console submission — internal testing track | 🚧 |
| Production release after internal testing verified | 🚧 |

---

## Phase 3 — iOS App 📋

*After Android verified on Play Store.*

### Epic 8 — Native iOS App

| Story | Status |
|---|---|
| `npx cap add ios` (requires macOS + Xcode 15+) | 📋 |
| Apple Developer account ($99/year) | 📋 |
| Microphone usage description in `Info.plist` | 📋 |
| URL scheme `recipekeepsake://` configured in Xcode | 📋 |
| `npx cap sync ios` → Xcode → Archive → TestFlight upload | 📋 |
| App Store submission after TestFlight verified | 📋 |

---

## Phase 1.9 — Family Sharing ✅

*Completed 2026-07-07. PRD: `docs/plans/2026-07-07-family-sharing-design.md`.*

Multi-phase feature: content type system, family groups, public portal, and WhatsApp sharing.

### Phase A — Content Types ✅

| Story | Status |
|---|---|
| `type` field on `/save-audio` endpoint — `recipe\|song\|story\|fable\|wisdom\|poem` | ✅ |
| Type picker UI on upload page (6 types with emoji) | ✅ |
| Type badge on memory detail page | ✅ |
| `pipeline/persist.py` writes `type: "recipe"` by default | ✅ |

### Phase B — Family Groups ✅

| Story | Status |
|---|---|
| `tools/groups.py` — 8 CRUD functions (create, join, member list, recipe list, portal lookup) | ✅ |
| `POST /family/groups` — create group | ✅ |
| `GET /family/groups/me` — get current user's group | ✅ |
| `POST /family/groups/join/{invite_token}` — join via invite link | ✅ |
| `GET /family/members` — list group members | ✅ |
| `GET /family/recipes` — all recipes from all group members | ✅ |
| Account page `FamilyGroupSection` — create group, copy portal/invite URLs | ✅ |
| Home page shows family recipes with contributor attribution | ✅ |
| `/join` public page — invite link landing, Suspense-wrapped | ✅ |

### Phase C — Public Portal ✅

| Story | Status |
|---|---|
| `portal_visible` boolean column on recipes — explicit opt-in, default false | ✅ |
| `GET /portal/{token}` — public endpoint, no auth required | ✅ |
| Portal toggle button on memory detail page | ✅ |
| `publicFetch` helper + `api.portal.get` in `frontend/lib/api.ts` | ✅ |
| `/family?p=TOKEN` public portal page — type filter tabs, inline audio, join nudge | ✅ |

### Phase D — WhatsApp Sharing ✅

| Story | Status |
|---|---|
| `frontend/lib/share.ts` — bilingual (EN + TE) message builder for all 5 types | ✅ |
| Memory detail `openWhatsApp()` — per-type bilingual copy + portal URL destination | ✅ |
| Account page — green WhatsApp Share button for family portal | ✅ |

---

## Phase 4 — Memories Expansion 🚧

*Started 2026-07-08. Schema migration + song/story/fable/wisdom/poem light pipelines complete. Text capture ("Their words") shipped 2026-07-09. Per-type Call B prompts (Remedies, Wisdom) next.*

Recipe proved the pipeline. Every new memory type follows the same pattern — voice → transcribe → translate → structure — with a different Call B schema and display config.

### Epic 9 — Memory Type Platform

| Story | Status |
|---|---|
| Brainstorm — finalise which memory types to build first (song + story) | ✅ |
| Schema design — `memories` table with `type` discriminator replacing `recipes` | ✅ Supabase SQL pending dashboard run |
| Python layer migration — `recipes` → `memories`, `dish_name` → `title` | ✅ 2026-07-08 |
| Frontend migration — `dish_name` → `title` across all pages and components | ✅ 2026-07-08 |
| `/save-audio` auto-transcription — Whisper + translate for song/story when audio uploaded | ✅ 2026-07-08 |
| Song/story detail view — transcript open by default, recipe fields suppressed | ✅ 2026-07-08 |
| Unified capture flow — type picker (Song/Story/Fable/Moral) before record in direct mode | ✅ 2026-07-08 |
| Memories browse — type grid landing, "All Memories" replaces "All Recipes" | ✅ 2026-07-08 |
| Audio memories browse — type filter tabs (Song/Story/Fable/Wisdom/Poem/Favorites) | ✅ 2026-07-09 |
| Upload flow SingleScreenReview — post-save review screen in direct mode | ✅ 2026-07-08 |
| Fable/Wisdom/Poem pipeline — light pipeline confirmed, no Call B needed | ✅ 2026-07-08 |
| Rename Moral→Wisdom, add Poem — type sweep across all frontend + backend | ✅ 2026-07-09 |
| "Their words" tab — paste text, translate via Call A, save as memory | ✅ 2026-07-09 |

### Epic 10 — Remedies Memory Type

| Story | Status |
|---|---|
| Call B prompt for remedy schema — `ailment`, `ingredients`, `preparation`, `caution` | 🔜 |
| Review wizard fields for remedy | 🔜 |
| Remedy detail view — structured display | 🔜 |

### Epic 11 — Stories Memory Type

| Story | Status |
|---|---|
| Light pipeline (Whisper + translate, no Call B) — transcript is the structured output | ✅ 2026-07-08 |
| Single-screen review (title + save, no wizard) | ✅ 2026-07-08 |
| Story detail view — transcript as primary content | ✅ 2026-07-08 |

### Epic 12 — Songs & Lullabies Memory Type

| Story | Status |
|---|---|
| Light pipeline (Whisper + translate, no Call B) — transcript is the structured output | ✅ 2026-07-08 |
| Single-screen review (title + save, no wizard) | ✅ 2026-07-08 |
| Song detail view — transcript + audio | ✅ 2026-07-08 |

### Epic 13 — Wisdom & Proverbs Memory Type

| Story | Status |
|---|---|
| Call B prompt for wisdom schema — `saying`, `meaning`, `origin`, `language` | 🔜 |
| Review wizard fields for wisdom | 🔜 |
| Wisdom detail view | 🔜 |

---

## Phase 5 — Family & Identity 📋

*After Memories expansion is stable. Two parallel tracks: user identity (profiles) and family access (invite + roles).*

### Epic 14 — User Profiles & Email

User identity beyond what Google Auth provides. Required before family sharing — once multiple users are in the system, each needs a joinable row.

| Story | Status |
|---|---|
| `profiles` table — `user_id` (1:1 with auth), `display_name`, `avatar_url`, `email`, `bio` | 📋 |
| Profile created at first login — populated from Google OAuth data | 📋 |
| Email stored in `profiles` (single source of truth, replaces `recorded_by_email` denormalization) | 📋 |
| Profile edit screen — update display name, avatar, bio | 📋 |
| `narrator_id` FK on memories table — replaces plain string `narrator` field | 📋 |
| Narrator photo migrated from base64 in DB to Supabase Storage URL | 📋 |

### Epic 15 — Family Invite & Roles

| Story | Status |
|---|---|
| `family_members` table — `inviter_id`, `invitee_email`, `role` (viewer \| contributor), `accepted_at` | 📋 |
| `POST /invite` — generate single-use token with role, send via email or WhatsApp | 📋 |
| Invite acceptance flow — `/join?code=xxx` → Google sign-in → role granted | 📋 |
| Per-memory share settings — share with family circle or keep private | 📋 |
| Keeper can revoke any family member's access at any time | 📋 |

### Epic 16 — Viewer Role

| Story | Status |
|---|---|
| Read-only access to shared memories — browse, listen, translate | 📋 |
| Viewer cannot capture, edit, delete, or manage access | 📋 |

### Epic 17 — Contributor Role

| Story | Status |
|---|---|
| Contributor can record new memories and add to shared archive (full pipeline + review wizard) | 📋 |
| New memories attributed to the Contributor | 📋 |
| Contributor can edit structured fields on existing memories | 📋 |
| `memory_edits` audit table — edits layered with attribution, original output preserved | 📋 |
| Contributor can add tags and mark favourites (visible to all members) | 📋 |
| `collections` table — Keeper-managed groupings of memories | 📋 |

---

## Phase 6.5 — Infrastructure Maturity 📋

*After Phase 6. Operational improvements as user base grows.*

### Epic — Translation Cache Table Migration

| Story | Status |
|---|---|
| New `recipe_translations(recipe_token, lang, dish_name, ingredients, steps, cook_notes, cached_at)` table | 📋 |
| Migrate existing `recipes.translations` JSONB data into new table | 📋 |
| Update `get_cached_translation` / `cache_translation` / `clear_translation_cache` to use new table | 📋 |
| Drop `translations` column from `recipes` table | 📋 |
| Benefit: atomic upsert by PK, per-language delete, queryable cache stats (most popular language, hit rate per recipe) | 📋 |

---

## Phase 6 — Search & Discovery 📋

*After family access is stable.*

### Epic 18 — Search

| Story | Status |
|---|---|
| Full-text search across all memory types — title, content, notes | 📋 |
| Filter by memory type, narrator, era, occasion | 📋 |
| Search results page with memory type indicators | 📋 |

### Epic 19 — Discovery

| Story | Status |
|---|---|
| "On this day" — surface a memory from the archive on each open | 📋 |
| Collections / albums — browse memories grouped by event or theme | 📋 |
| Tag-based filtering | 📋 |

---

## Open Bugs (blocking or high priority)

| ID | Description | Severity | Blocks |
|---|---|---|---|
| D-002 | Whisper hallucinates completions on abrupt mid-sentence stops — worsened by recipe vocabulary `initial_prompt` priming | High | Phase 4 launch |
| D-003 | `POST /generate-image` endpoint doesn't pass `ingredients`/`steps`/`cook_notes` to enriched prompt | Improvement | — |
| D-004 | Supabase RLS policies designed but dashboard setup unconfirmed | High | Phase 5 (family access) |

---

## Won't Build (explicit exclusions)

These are deliberate scope decisions, not deferred work. Each has a reason.

| What | Why not |
|---|---|
| **Social features** (likes, comments, public profiles) | Private family archive only. Social features require content moderation, abuse handling, and public URLs — none of which belong here. Phase 5 family access is the ceiling. |
| **Automated sends or notifications** | The app is pull-based. Push notifications require a background job, notification service, and device permissions — complexity without benefit for a personal archive. |
| **Post-save editing of structured fields** | The wizard review flow is the editorial moment. Once saved, the pipeline output is a record. Only personal annotations are editable post-save. Structured field editing would require versioning — that belongs to the Contributor role in Phase 5, not general editing. |
| **PWA (Progressive Web App)** | Microphone access is unreliable across Android browsers without a native wrapper. Capacitor gives us a real Play Store / App Store listing with correct permissions. |
| **Transliteration (Roman script for Telugu)** | Romanised Telugu is a workaround, not the authentic form. The system enforces Unicode script output. Displaying "కొంచెం" is the goal. |
