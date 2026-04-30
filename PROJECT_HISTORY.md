# RecipeKeepsake — Project History

One-paragraph summary per session. Most recent first.

---

## 2026-04-30 — Session 3: Mobile App (Android) + Architecture Docs

Principal architect review: produced `docs/ARCHITECTURE.md` with PRD, full system design, ASCII flow diagrams (capture, browse, auth), 8 design decisions, test strategy, deployment, and env vars. DRY cleanup: extracted `load_config()` to `tools/config.py` (D-001 fixed). Added `store_image()` to `tools/storage.py` — downloads DALL-E URLs at capture time and stores permanently in Supabase `images` bucket (DALL-E CDN expires in ~1hr). Added `/privacy` endpoint serving `web/privacy.html` (Play Store / App Store requirement). Added per-user in-memory rate limiting (10 recordings/day, `MAX_RECORDINGS_PER_DAY` env var). Rebuilt the pre-auth landing page to match an Indian grandmother app wireframe (lp- CSS prefix, hero with food bg photo, feature grid, recipe card scroll, quote banner, bottom nav). Added sign-out button in topbar, and first-login welcome modal with name/relationship/photo/notes fields. Decided to publish to Android Play Store first (iOS later once verified), using Capacitor Live URL approach (loads Railway URL from native shell). Created `capacitor.config.json` (`com.recipekeepsake.app`), `package.json` with Capacitor 8.x packages. Built `scripts/make_assets.py` (Pillow, generates 1024×1024 icon + 2732×2732 splash). `npx cap add android` scaffolded full Android project; `capacitor-assets` generated 87 icon/splash variants. `AndroidManifest.xml` updated with RECORD_AUDIO permission and `recipekeepsake://` deep link intent filter. `signInWithGoogle()` updated to detect native context and use `Capacitor.Plugins.Browser` to open system browser (bypasses Google's WebView OAuth block); `initAuth()` adds `App.addListener('appUrlOpen')` deep link handler to capture OAuth tokens. Updated ROADMAP.md with Phases 2 (Android) and 3 (iOS).

**Status at end of session:** Android project built locally. Next step: open `android/` in Android Studio → build signed AAB → Play Console internal testing track. Also need Supabase setup: add `recipekeepsake://auth/callback` redirect URL + create public `images` bucket.

---

## 2026-04-29 — Session 1: Bootstrap + Brainstorm

Bootstrapped the project from scratch. Created the full SDLC scaffold: `CLAUDE.md`, `docs/ROADMAP.md`, `.agent/decisions.log`, `.agent/gotchas.md`, `.agent/workflows/` with all 8 workflow files (`/start`, `/brainstorm`, `/plan`, `/build`, `/audit`, `/kaizen`, `/log`, `/closeout`). Ran `/brainstorm` for the core pipeline feature — completed all 6 design steps. Key decisions made: voice-first Telugu capture (not OCR/video), two-step LLM pipeline (translate separate from structure to preserve vague measurements), Supabase for storage, human review before every share, WhatsApp link sharing (`/recipe/[token]`), Phase 0 = CLI only. PRD saved to `docs/plans/2026-04-29-core-pipeline-design.md`. All decisions appended to `.agent/decisions.log`. Also fixed slash commands — copied workflows from `.agent/workflows/` to `.claude/commands/` so `/brainstorm`, `/plan`, etc. work natively in Claude Code.

**Status at end of session:** PRD approved, ready for `/plan`.
