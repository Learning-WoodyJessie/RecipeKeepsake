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

## Phase 1.6 — Scale Hardening 🔜

*Approved 2026-05-04. PRD: `docs/plans/2026-05-04-scale-hardening-design.md`. Pure code changes — no new infrastructure.*

Target: system handles 10,000 users safely. All fixes are in `tools/storage.py` and `scripts/serve.py` plus one new Postgres table.

**Deferred from this phase:** job queue for async capture pipeline (revisit when concurrent captures regularly exceed 5); API gateway for infrastructure-layer rate limiting (Phase 5+).

### Epic A — Connection & Auth Hardening

| Story | Status |
|---|---|
| Supabase client singleton — `_client()` returns module-level instance, not a new client per call | 🔜 |
| `require_auth` uses `httpx.AsyncClient` + `await` — non-blocking in async handler | 🔜 |
| Local JWT verification via `PyJWT` + `SUPABASE_JWT_SECRET` — no Supabase round-trip on happy path | 🔜 |
| Supabase network call retained as fallback when local verification fails | 🔜 |
| `require_auth` raises HTTP 500 (not silent pass) when `SUPABASE_URL` missing in production | 🔜 |
| CORS: explicit `allow_methods` and `allow_headers` — no wildcards | 🔜 |
| Add `PyJWT` to `requirements.txt` | 🔜 |

### Epic B — Distributed Rate Limiting

Rate limiting applies to all LLM-backed endpoints — not capture only. Translate and generate-image also call OpenAI on the user's account; abuse on any endpoint incurs cost.

| Story | Status |
|---|---|
| `rate_limits` table migration — `(user_id, date)` primary key, atomic upsert | 🔜 |
| Rate limit enforced on `POST /capture` via Postgres upsert | 🔜 |
| Rate limit enforced on `GET /recipe/{token}/translate` | 🔜 |
| Rate limit enforced on `POST /generate-image` | 🔜 |
| Per-endpoint daily limits configurable via env vars | 🔜 |
| Remove in-memory `_rec_counts` / `_rec_dates` dicts | 🔜 |

### Epic C — RLS Confirmation (D-004)

| Story | Status |
|---|---|
| Confirm RLS enabled on `recipes` table in Supabase dashboard | 🔜 |
| Confirm RLS enabled on `people` table in Supabase dashboard | 🔜 |
| Policy verified: `user_id::text = auth.uid()::text` on both tables | 🔜 |
| D-004 closed in `docs/BUGS.md` | 🔜 |

### Epic D — Tests

| Story | Status |
|---|---|
| `tests/test_auth.py` — singleton, async auth, local JWT verify, fail-closed behaviour | 🔜 |
| `tests/test_rate_limit.py` — Postgres upsert, cross-endpoint limits, 429 response | 🔜 |

---

## Phase 1.7 — Frontend Migration 🔜

*After Phase 1.6 completes. Migrate the production frontend from `web/app.html` (single-file HTML SPA, 4 900 lines) to `web/nextjs/` (Next.js 14 + TypeScript). Frontend deployed on Vercel; backend stays on Railway. The API shape is already clean — FastAPI serves JSON, the frontend consumes it.*

**Why now:** Phase 1.6 finalises the auth and API contracts the Next.js frontend will depend on. Migrating before those contracts are stable would mean doing it twice.

**Scope — what this is NOT:**
- No new features — this is a like-for-like screen migration
- No backend changes — API endpoints and response shapes are unchanged
- No new infrastructure beyond Vercel (already scaffolded via `web/nextjs/vercel.json`)

### Epic F1 — Foundation & Auth

| Story | Status |
|---|---|
| Rebrand `web/nextjs/` — "Echoes of Home" branding, correct tagline, logo | 🔜 |
| Supabase Auth wired up — Google OAuth, session management, protected routes | 🔜 |
| Landing page (pre-auth) — matches current `web/app.html` landing | 🔜 |
| First-login welcome modal — prompt Keeper to add first narrator | 🔜 |
| Sidebar navigation — all nav groups, active state, mobile-responsive | 🔜 |

### Epic F2 — Capture Flow

| Story | Status |
|---|---|
| Capture screen — waveform visualizer, narrator picker, tips sidebar, privacy badge | 🔜 |
| 3-step review wizard — confirm title → edit fields → save | 🔜 |
| Upload recording flow — existing audio file through same wizard | 🔜 |

### Epic F3 — Browse & Recall

| Story | Status |
|---|---|
| Home screen — favorites row, recent memories list, waveform bars | 🔜 |
| All Memories list view | 🔜 |
| Memory detail view — structured content, notes, transcript, audio player | 🔜 |
| Language switcher — translate any memory to EN / TE / HI / KN / ES / FR | 🔜 |
| Favorites — mark/unmark, persisted | 🔜 |
| Delete memory — two-step confirmation | 🔜 |
| Personal annotations — editable post-save | 🔜 |

### Epic F4 — People Management

| Story | Status |
|---|---|
| People screen — narrator grid with photo, relationship, bio | 🔜 |
| Add / edit / delete narrator modal | 🔜 |

### Epic F5 — Account

| Story | Status |
|---|---|
| Account deletion — cascades audio, memories, people, auth user | 🔜 |
| Privacy policy page at `/privacy` | 🔜 |

### Epic F6 — Cutover

| Story | Status |
|---|---|
| Deploy `web/nextjs/` to Vercel, pointed at Railway API | 🔜 |
| Remove `app.html` route from FastAPI — redirect `/` to Vercel URL | 🔜 |
| Capacitor `webDir` updated to point at Vercel URL (Android app cutover) | 🔜 |

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

## Phase 4 — Memories Expansion 🔜

*Next priority after open bugs D-002 and D-004 are resolved. The Memories nav group and pipeline abstraction are already in place as scaffolding.*

Recipe proved the pipeline. Every new memory type follows the same pattern — voice → transcribe → translate → structure — with a different Call B schema and display config.

### Epic 9 — Memory Type Platform

| Story | Status |
|---|---|
| Brainstorm — finalise which memory types to build first | 🔜 |
| Schema design — `memories` table with `type` discriminator replacing `recipes` | 🔜 |
| Unified capture flow — memory type selector before record | 🔜 |
| Memories browse — type grid landing, "All Memories" replaces "All Recipes" | 🔜 |

### Epic 10 — Remedies Memory Type

| Story | Status |
|---|---|
| Call B prompt for remedy schema — `ailment`, `ingredients`, `preparation`, `caution` | 🔜 |
| Review wizard fields for remedy | 🔜 |
| Remedy detail view — structured display | 🔜 |

### Epic 11 — Stories Memory Type

| Story | Status |
|---|---|
| Call B prompt for story schema — `title`, `era`, `people_mentioned`, `transcript` | 🔜 |
| Review wizard fields for story | 🔜 |
| Story detail view — narrative display | 🔜 |

### Epic 12 — Songs & Lullabies Memory Type

| Story | Status |
|---|---|
| Call B prompt for song schema — `title`, `language`, `occasion`, `lyrics` | 🔜 |
| Review wizard fields for song | 🔜 |
| Song detail view — lyrics display with audio | 🔜 |

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
