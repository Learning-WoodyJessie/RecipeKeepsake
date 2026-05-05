# Phase 1.7 — Frontend Migration Design PRD

*Date: 2026-05-05*
*Status: Approved — ready for /plan*

---

## Goal

Migrate the production frontend from `web/app.html` (4,900-line single-file vanilla JS SPA) to a maintainable React/Next.js app in `frontend/`, deployed on Vercel as a static export, with Capacitor configured to serve both the Android app (Phase 2) and iOS app (Phase 3) from the same Vercel URL.

---

## Audience

Family Keepers and their family members — authenticated users on web, Android, and iOS.

---

## Scope — what we are NOT building

- **No new features** — like-for-like screen migration only. Every screen in `web/app.html` is reproduced exactly. No additions.
- **No backend changes** — Railway FastAPI API is unchanged. All endpoints, response shapes, and auth contracts stay as-is from Phase 1.6.
- **No iOS App Store submission** — `npx cap add ios` scaffolds the iOS project and configures it correctly, but Play Store / App Store submissions are Phase 2 and Phase 3 respectively.
- **No PWA** — explicitly excluded (see ROADMAP.md Won't Build). No service workers, no offline mode.
- **No SSR** — Next.js static export only. No server-side data fetching, no API routes in Next.js, no middleware. The Railway API is the only backend.

---

## Why static export (decision summary)

The app is private, authenticated, and mobile-first. Every screen uses browser APIs (MediaRecorder, navigator.mediaDevices, localStorage, Supabase Auth client). SSR conflicts with these APIs and provides no benefit for a private app with no public pages. Static export:

- Loads from Vercel's global CDN (~30ms) vs SSR serverless cold start (~200–400ms)
- No `'use client'` conflicts with Capacitor browser APIs
- One build output serves web, Android, and iOS identically
- Vercel invalidates on every deploy via content-hashed filenames — no staleness
- Supabase Auth runs client-side only (no middleware needed)

Revisit SSR only if Phase 5 introduces unauthenticated public share pages.

---

## Repo reorganisation

```
Before:
  web/
    app.html          ← production frontend (legacy, stays live during migration)
    nextjs/           ← incomplete scaffold
    assets/

After:
  frontend/           ← Next.js app (moved from web/nextjs/, renamed)
    app/
    components/
    lib/
    public/           ← brand assets moved from web/assets/
    next.config.ts    ← output: 'export' added
    vercel.json
    package.json
    ...
  web/
    app.html          ← legacy, still served by FastAPI during migration
    privacy.html      ← moved to frontend/app/privacy/page.tsx at cutover
    assets/           ← source assets (also copied to frontend/public/)
```

At cutover (Epic F6), `web/app.html` route is removed from FastAPI and `web/` is archived.

---

## New repo structure (full)

```
/
├── frontend/          ← Next.js 14, React 19, TypeScript, Tailwind, static export
├── backend (implicit) ← tools/, pipeline/, prompts/, scripts/ (unchanged)
├── android/           ← Capacitor Android project (npx cap sync updates it)
├── ios/               ← Capacitor iOS project (npx cap add ios in this phase)
├── web/               ← legacy SPA (retired at Phase 1.7 cutover)
├── data/              ← migrations, config, glossary
├── tests/             ← Python tests
├── docs/              ← architecture, roadmap, plans
└── capacitor.config.json  ← updated: appName, appId, webDir, server.url
```

---

## Capacitor strategy

Capacitor loads a remote URL via `server.url`. Both Android and iOS use this — no local bundling needed. After Vercel deploy:

```json
{
  "appId": "com.echoesofhome.app",
  "appName": "Echoes of Home",
  "webDir": "frontend/out",
  "server": {
    "url": "https://<vercel-url>.vercel.app",
    "cleartext": false,
    "androidScheme": "https"
  }
}
```

`webDir: "frontend/out"` is the static export output directory — used by `npx cap sync` for local builds (fallback if `server.url` is unreachable). In production the app always loads from the Vercel URL.

### Auth deep links
Both Android and iOS need the `recipekeepsake://auth/callback` deep link registered in Supabase Auth redirect URLs. Android's `AndroidManifest.xml` already has the intent filter. iOS needs `Info.plist` URL scheme registration (done via `npx cap add ios` + Xcode config in Epic F7).

---

## Supabase Auth in static export

No `@supabase/ssr` middleware (SSR only). Use `@supabase/supabase-js` client directly in the browser:

```typescript
// frontend/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

Auth flow:
1. User hits any route → check `supabase.auth.getSession()` in a root layout client component
2. No session → redirect to `/` (landing/login page)
3. Login → `supabase.auth.signInWithOAuth({ provider: 'google' })`
4. OAuth callback → `recipekeepsake://auth/callback` (native) or `https://<vercel-url>/auth/callback` (web)
5. Session stored in localStorage by Supabase client — persists across page loads

All API calls to Railway include the session JWT:
```typescript
const { data: { session } } = await supabase.auth.getSession()
const res = await fetch(`${API_URL}/recipes`, {
  headers: { Authorization: `Bearer ${session?.access_token}` }
})
```

---

## Environment variables

### Vercel (frontend)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Railway backend URL |

### Supabase Auth — add redirect URLs
| URL | Purpose |
|---|---|
| `https://<vercel-url>.vercel.app/auth/callback` | Web OAuth callback |
| `recipekeepsake://auth/callback` | Android + iOS deep link callback |

---

## Screens to migrate (from web/app.html)

| Screen | Route | Notes |
|---|---|---|
| Landing (pre-auth) | `/` | Google sign-in button |
| Home | `/home` | Favorites row, recent memories, waveform bars |
| All Memories | `/memories` | List view, sort toggle |
| Memory Detail | `/memory/[token]` | Audio player, transcript, language switcher, annotations |
| Capture | `/capture` | Waveform visualizer, narrator picker, 3-step wizard |
| Upload Recording | `/upload` | Same wizard, file input instead of mic |
| People | `/people` | Narrator grid, add/edit/delete modal |
| Auth Callback | `/auth/callback` | Handles OAuth redirect, sets session |
| Privacy | `/privacy` | Static page |
| Account | `/account` | Delete account |

---

## Component structure

```
frontend/
  app/
    layout.tsx              ← root layout, auth gate
    page.tsx                ← landing / login
    auth/callback/page.tsx  ← OAuth callback handler
    home/page.tsx
    memories/page.tsx
    memory/[token]/page.tsx
    capture/page.tsx
    upload/page.tsx
    people/page.tsx
    privacy/page.tsx
    account/page.tsx
  components/
    AuthGuard.tsx           ← wraps protected routes
    Sidebar.tsx             ← navigation
    AudioPlayer.tsx         ← reusable across memory detail + capture
    WaveformBars.tsx        ← deterministic waveform visualizer
    NarratorChip.tsx        ← narrator selector
    LanguageSwitcher.tsx    ← translate dropdown
    MemoryCard.tsx          ← card used in home + all-memories
    ReviewWizard.tsx        ← 3-step capture review flow
  lib/
    supabase.ts             ← Supabase client singleton
    api.ts                  ← typed fetch wrappers for Railway API
```

---

## Build & deploy

```bash
# Local dev
cd frontend && npm run dev      # http://localhost:3000

# Build (static export)
cd frontend && npm run build    # outputs to frontend/out/

# Vercel deploy (automatic on push to main)
# vercel.json already configured

# Capacitor sync (after Vercel URL known)
npx cap sync android
npx cap sync ios               # after npx cap add ios
```

---

## Decisions Made

### Decision 1 — Static export over SSR
**Chosen:** `output: 'export'` in next.config.ts
**Rejected:** default Next.js SSR
**Reason:** App is private/authenticated, all screens use browser APIs incompatible with SSR, CDN delivery is faster than serverless for this use case, one build serves web + Android + iOS.

### Decision 2 — frontend/ top-level directory
**Chosen:** `frontend/` at repo root
**Rejected:** keep at `web/nextjs/`
**Reason:** Frontend and backend now deploy to separate infrastructure. Top-level separation makes this explicit and mirrors standard monorepo convention.

### Decision 3 — Capacitor uses server.url (remote load)
**Chosen:** `server.url` pointing at Vercel — app loaded remotely on every open
**Rejected:** local bundle in webDir (copy `out/` into android/ios project)
**Reason:** Remote URL means app updates reach all native users instantly without an app store release. `webDir` kept as fallback for offline/local builds only.

### Decision 4 — iOS project scaffolded in Phase 1.7
**Chosen:** `npx cap add ios` in this phase — project configured, not submitted
**Rejected:** defer entirely to Phase 3
**Reason:** Capacitor config, deep link scheme, and Xcode project setup are tightly coupled to the Vercel URL established in this phase. Doing it now avoids a context switch later. App Store submission remains Phase 3.

---

## Success Criteria

- [ ] `cd frontend && npm run build` exits 0, no TypeScript errors
- [ ] All screens from `web/app.html` accessible and functional at Vercel URL
- [ ] Google OAuth sign-in completes on web browser
- [ ] Google OAuth sign-in completes on Android emulator via deep link
- [ ] Memories load, audio plays, language switcher works
- [ ] Capture flow (record → review wizard → save) completes end-to-end
- [ ] `npx cap sync android` completes without error
- [ ] `npx cap sync ios` completes without error (after `npx cap add ios`)
- [ ] `capacitor.config.json` updated: `appName`, `appId`, `server.url`, `webDir`
- [ ] `web/app.html` route removed from FastAPI at cutover — Railway serves API only

---

## Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| User opens app offline (native) | Capacitor falls back to last cached version from webDir; shows offline state |
| Vercel deploy fails | Old version stays live (Vercel atomic deploys — never partial) |
| Railway API down | Frontend loads, auth works, data requests show error states gracefully |
| OAuth redirect on iOS (not yet on App Store) | Test via Xcode simulator with deep link scheme |
| `server.url` not yet set in capacitor.config.json | `webDir: frontend/out` used as fallback for local testing |
| Session expired | Supabase client auto-refreshes; if refresh fails, redirect to landing |

---

## Build Order (for /plan)

1. **Chunk 1** — Repo reorganisation: move `web/nextjs/` → `frontend/`, add `output: 'export'` to next.config.ts, update capacitor.config.json (appName, appId, webDir), verify `npm run build` passes
2. **Chunk 2** — Foundation: Supabase Auth client, AuthGuard, Sidebar, root layout, landing page, auth/callback route
3. **Chunk 3** — Capture flow: capture page, upload page, 3-step review wizard, narrator picker, waveform visualizer
4. **Chunk 4** — Browse & Recall: home screen, all memories list, memory detail (audio player, transcript, language switcher, favorites, delete, annotations)
5. **Chunk 5** — People & Account: people screen, add/edit/delete narrator modal, account deletion, privacy page
6. **Chunk 6** — Capacitor: `npx cap add ios`, configure iOS deep link scheme, `npx cap sync` both platforms, update `server.url` to Vercel URL
7. **Chunk 7** — Cutover: deploy to Vercel, verify all screens, remove `app.html` route from FastAPI, update Railway to serve API only

*Next step: `/plan`*
