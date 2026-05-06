# iOS release — task list (simulator first, then App Store)

Use this as a single checklist from first Xcode run through App Store submission. Order matters: validate on **Simulator** (no $99), then **device**, then pay for **Apple Developer Program** when you need TestFlight or the store.

---

## 5. Review risks to schedule (not blocking local testing)

These matter for **App Store review / listing quality**, not for **Simulator or device smoke tests** (Phases B–C). Schedule decisions and work before first **TestFlight or review submission** (Phases F–G and metadata).

- [ ] **Sign in with Apple vs Google-only ([Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple))** — Re-read Apple’s **current** text (it changes). Decide whether **Google-only via Supabase** needs **Sign in with Apple** or an allowed exception; if engineering is required, plan it before relying on first-pass approval. Tracked in detail: **P4**, **F1**, `docs/app-store-privacy-and-support.md` §4.
- [ ] **Icons / splash after display-name or brand change** — Regenerate native assets (**`npx @capacitor/assets generate`** from source artwork, then **`npx cap sync ios`** from repo root so `ios/` picks up `frontend/out` and native resources). Sanity-check icon and launch screen in Xcode on a device before archive. Related: **P9**, **G1–G2**, **A4**.

---

## Phase P — Parallel (no Xcode required) — compliance & store prep

Do these while Xcode installs or on any machine.

- [ ] **P1. Public Privacy Policy URL** — **Done in repo:** FastAPI serves **`/privacy-policy`** from `www/privacy-policy.html` (no auth). Use `https://<production-host>/privacy-policy` in App Store Connect. Details: `docs/app-store-privacy-and-support.md`. In-app `/privacy` remains post-login; keep both copies aligned when policy changes.
- [ ] **P2. Support URL** — **`/support`** serves `www/support.html` with **theechoesofhomesupport@gmail.com**. Use `https://<production-host>/support` in App Store Connect (or the same address as primary support contact).
- [ ] **P3. App Privacy “nutrition labels” draft** — See **`docs/app-store-privacy-and-support.md` §3** (code-backed table: account, audio, user content, IDs, diagnostics via `/client-error`). Transfer answers into App Store Connect when ready.
- [ ] **P4. Sign in with Apple decision** — Read current **[App Store Review Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple)** vs your **Google-only** flow; schedule engineering if you must add Sign in with Apple (Supabase supports it).
- [ ] **P5. Reviewer demo account** — Create a dedicated Supabase user (Google or email), add **non-production** sample memories if helpful, document **email + password** (or magic-link flow) for **App Review notes**.
- [ ] **P6. Review notes draft** — Short text: login-gated family archive; **microphone** for recording; Telugu/English; backend on Railway; test account credentials; anything non-obvious (OAuth redirect, `recipekeepsake://`).
- [ ] **P7. Account deletion** — Confirm **Account** page is easy to find (sidebar); run delete in staging and confirm Supabase rows/storage cleanup; aligns with Apple account-deletion expectations.
- [ ] **P8. Info.plist audit (read-only in repo)** — `ios/App/App/Info.plist`: `NSMicrophoneUsageDescription` present; add **NSPhotoLibraryUsageDescription** / **NSCameraUsageDescription** only if you add those flows (avoid empty strings).
- [ ] **P9. Icons & splash** — Run **`npx @capacitor/assets generate`** (or equivalent) from brand artwork; replace placeholder app icon if needed.
- [ ] **P10. Production hygiene** — Ensure `capacitor.config.json` does not need **`webContentsDebuggingEnabled: false`** for store builds on Android; for iOS, avoid shipping obvious debug-only endpoints. Confirm **no secrets** in client bundle (`NEXT_PUBLIC_*` only for safe keys).
- [ ] **P11. Third-party content rights** — If the app ships stock hero images (e.g. Unsplash), keep **license** evidence or replace with owned art before release.
- [ ] **P12. Age rating & kids** — Complete Apple’s questionnaire honestly (family app with accounts and UGC is rarely “made for kids” unless designed as such).

---

## Phase A — Build web bundle and sync Capacitor (any machine with Node)

- [ ] **A1.** Install deps: `cd frontend && npm ci`
- [ ] **A2.** Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (e.g. `.env.production` or export in shell) so the static build is not using placeholders.
- [ ] **A3.** `npm run build` in `frontend/` → confirm `frontend/out/` exists and loads in a browser when served (optional sanity check).
- [ ] **A4.** From **repo root**: `npx cap sync ios` (or `npm run cap:sync` if using root scripts) so `ios/` embeds latest `frontend/out`.

---

## Phase B — Xcode + Simulator (no paid Apple Developer Program required)

**Xcode-first quick path (testing):** (1) Complete **Phase A** so `frontend/out` exists and `npx cap sync ios` has run. (2) Open **`ios/App/App.xcodeproj`**. (3) **Xcode → Settings → Accounts** — add your Apple ID (free is fine). (4) Select the **App** scheme, pick an **iPhone Simulator** (e.g. iPhone 16). (5) **Signing & Capabilities** on the App target — **Automatically manage signing**, Team = *Personal Team*. (6) **Product → Run** (⌘R). The WebView loads **`server.url`** from `capacitor.config.json` (your Railway host) unless you change it — ensure that URL is reachable and Supabase redirect URLs allow it for OAuth.

- [ ] **B1.** Install **Xcode** from the Mac App Store; open once to finish installing components.
- [ ] **B2.** Sign in to Xcode with a **free Apple ID** (Settings → Accounts).
- [ ] **B3.** Open **`ios/App/App.xcodeproj`** in Xcode (this repo uses the Xcode project directly; there is no separate CocoaPods workspace).
- [ ] **B4.** Select a **Simulator** destination (e.g. iPhone 16 Pro).
- [ ] **B5.** **Signing:** for Simulator-only runs, Personal Team is usually enough; resolve any signing warnings Xcode shows.
- [ ] **B6.** **Product → Run** (⌘R): app launches; **landing / auth** WebView loads your `server.url` or bundled assets as configured.
- [ ] **B7.** **Sign-in flow:** Google OAuth completes or fails clearly; no blank white screen after redirect (fix redirect URLs / custom URL scheme if needed).
- [ ] **B8.** **Navigation:** open main tabs/routes (home, memories, capture, people) — no repeated crashes.
- [ ] **B9.** **Simulator limits:** note that **microphone capture** is not a full substitute for a real device; Simulator is mainly for UI, navigation, and network-backed flows.

---

## Phase C — Physical device (still before or after $99; Personal Team for dev install)

- [ ] **C1.** Connect iPhone; trust computer; enable **Developer Mode** on device if iOS asks.
- [ ] **C2.** In Xcode, select your **device** as destination; set **Signing & Capabilities** to your **Personal Team** (free Apple ID) for debug builds.
- [ ] **C3.** Run on device; accept “Untrusted Developer” in **Settings → VPN & Device Management** if shown.
- [ ] **C4.** **Microphone:** open capture flow; iOS should show the permission alert (copy comes from `NSMicrophoneUsageDescription` in `Info.plist`). Grant and record a short clip; confirm upload/processing path works or errors are understandable.
- [ ] **C5.** **Playback:** open a memory and play audio (real device audio stack).
- [ ] **C6.** **Deep link / OAuth:** repeat sign-in and return-to-app using `recipekeepsake://` (or your configured scheme) if applicable.

---

## Phase D — Apple Developer Program ($99/year) — when you want TestFlight / App Store

- [ ] **D1.** Enroll at [developer.apple.com](https://developer.apple.com) (Individual or Organization).
- [ ] **D2.** In Xcode → Settings → Accounts: add the **paid** team; set project signing to that team for **Release** / **Archive** builds.
- [ ] **D3.** Confirm **Bundle ID** in Apple Developer portal matches Xcode (`com.echoesofhome.app` per `capacitor.config.json` / Xcode).

---

## Phase E — App Store Connect (metadata and compliance)

- [ ] **E1.** Create the app in **App Store Connect** (name, primary language, bundle ID, SKU).
- [ ] **E2.** **Privacy Policy URL** — live HTTPS page describing data use (required for review in practice for this app class).
- [ ] **E3.** **App Privacy** (nutrition labels) — declare data collected/linked (account, user content such as audio and text, identifiers, etc.); keep in sync with real behavior.
- [ ] **E4.** **Export compliance** — complete the encryption / ERN questionnaire honestly (standard HTTPS is routine; follow the current form wording).
- [ ] **E5.** **Age rating** questionnaire completed.
- [ ] **E6.** **Screenshots** — capture required device sizes (App Store Connect will list them; often 6.7" minimum for iPhone-only apps; Simulator OK).
- [ ] **E7.** **App Review notes** — demo account email/password (if app is login-gated), short explanation: family audio/recipes, Telugu support, microphone is core, any backend dependencies (e.g. Railway URL).

---

## Phase F — Sign in with Apple / auth (review risk)

- [ ] **F1.** Confirm current **Guideline 4.8** expectations for your sign-in mix (e.g. Google-only may require **Sign in with Apple** unless an exception applies). Plan implementation if required before relying on first-time approval.

---

## Phase G — Assets and native polish

- [ ] **G1.** **App icons** — all required sizes (use `@capacitor/assets` or manual asset catalog).
- [ ] **G2.** **Launch screen / splash** — matches brand; no stretched placeholders.
- [ ] **G3.** **Versioning** — bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (or Capacitor-driven flow) each upload.
- [ ] **G4.** **Account deletion** — visible in-app path to delete account (Apple expectation); matches backend behavior.

---

## Phase H — TestFlight then production

- [ ] **H1.** **Archive:** Xcode → **Product → Archive** (Release configuration, correct team).
- [ ] **H2.** **Distribute** archive to **App Store Connect** (Validate, then Upload).
- [ ] **H3.** **TestFlight:** internal testing first; fix crashers; then external if needed.
- [ ] **H4.** **App Store listing:** description, keywords, support URL, promotional text (optional).
- [ ] **H5.** **Submit for review**; respond to any **Resolution Center** messages within SLA.

---

## Quick reference — repo commands

```bash
cd frontend && npm ci && npm run build && cd .. && npx cap sync ios
```

Then open the iOS project in Xcode and run (Simulator or device).

---

## Optional CI (later)

- [ ] macOS runner: `npm ci` in `frontend` → `npm run build` with secrets for `NEXT_PUBLIC_*` → `npx cap sync ios` → export/archive (often still done locally unless you invest in Xcode automation).
