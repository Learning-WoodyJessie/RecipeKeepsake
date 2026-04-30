# RecipeKeepsake — Roadmap

## Phase 0 — Core pipeline ✅
- [x] PRD approved (brainstorm complete)
- [x] Whisper transcription tool (`tools/transcribe.py`)
- [x] Two-step LLM pipeline (`prompts/translate.py`, `prompts/structure.py`)
- [x] CLI capture script (`scripts/capture.py`)
- [x] Supabase schema + storage bucket (`tools/storage.py`)
- [x] Tests for all tools and prompts (mocked)

## Phase 1 — Web app ✅
- [x] Single-file HTML SPA (`web/app.html`) served by FastAPI on Railway
- [x] DALL-E image generation with permanent Supabase storage (`prompts/image.py`, `tools/storage.store_image`)
- [x] Audio + image upload to Supabase Storage
- [x] Recipe grid home — most recent first, narrator filter chips
- [x] Individual recipe view — card + audio player + share token
- [x] Google OAuth (Supabase) — sign in / sign out
- [x] First-login welcome modal (name, relationship, emoji, photo, notes)
- [x] Per-user rate limiting (10 recordings/day, configurable via `MAX_RECORDINGS_PER_DAY`)
- [x] Privacy policy page at `/privacy` (Play Store / App Store compliant)
- [x] Indian grandmother-themed landing page (pre-auth)
- [x] Architecture docs — `docs/ARCHITECTURE.md`

## Phase 2 — Android app (in progress) 🚧
- [x] Brainstorm + PRD: `docs/plans/2026-04-30-mobile-app.md`
- [x] Capacitor scaffold: `capacitor.config.json`, `package.json`
- [x] App icon (1024×1024) + splash (2732×2732) — `scripts/make_assets.py`
- [x] 87 Android icon/splash variants generated via `capacitor-assets`
- [x] AndroidManifest: `RECORD_AUDIO`, deep link `recipekeepsake://auth/callback`
- [x] Google OAuth native fix: Capacitor Browser → system browser → deep link callback
- [ ] **Next: Build signed APK/AAB in Android Studio**
  - Open `android/` in Android Studio
  - Build → Generate Signed Bundle/APK → AAB → upload keystore info
  - `npx cap sync` before each build
- [ ] **Supabase setup required before testing auth**:
  - Add `recipekeepsake://auth/callback` to Supabase Auth → URL Configuration → Redirect URLs
  - Create public `images` bucket (for DALL-E permanent storage)
- [ ] Google Play Console submission
  - New app → "Recipe Keepsake" → `com.recipekeepsake.app`
  - Internal testing track → upload AAB → invite testers
  - Production release after internal testing

## Phase 3 — iOS (TestFlight) — after Android verified
- [ ] `npx cap add ios` (requires macOS + Xcode 15+)
- [ ] Apple Developer account ($99/year)
- [ ] Microphone usage description in `Info.plist`
- [ ] URL scheme `recipekeepsake://` in Xcode
- [ ] `npx cap sync ios` → Xcode → Archive → TestFlight upload
- [ ] App Store submission after TestFlight verified

## Phase 4 — Search + playback
- [ ] Full-text search across recipes
- [ ] Audio playback alongside structured recipe
- [ ] Tag-based filtering (by dish type, occasion, etc.)

## Won't build (explicit exclusions)
- Sharing / social features — this is private family data
- Automated sends or notifications — no delivery layer needed
- Edit-in-place UI for ingredients — edit via review flow only
- PWA — explicitly excluded in favour of native Capacitor app
