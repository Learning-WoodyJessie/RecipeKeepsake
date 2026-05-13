## Goal
Add "Sign in with Apple" alongside Google, using the native iOS sheet on device/simulator and a web OAuth fallback on browser, so the app meets App Store Review Guideline 4.8.

## Audience
You, using the app on iPhone or simulator to authenticate.

## Why this is mandatory
App Store Guideline 4.8: any app that offers a third-party social sign-in (Google, Facebook, etc.) MUST also offer "Sign in with Apple" with equal visual prominence. Offering Google-only = rejection.

## Scope — what we're NOT building
- Android implementation of Apple Sign-In (Apple's service doesn't run on Android — Google is the only button there)
- Custom Apple button styling beyond what Apple's guidelines allow (strict rules — see below)
- Supabase Apple provider credential setup — blocked on Apple Developer account ($99/yr). Code is written now; credentials are filled in when account is ready.
- Email from Apple stored separately — Supabase handles the "Hide My Email" relay address automatically on first sign-in

---

## Architecture

**Two paths, one function:**

```
signInWithApple()
  ├── Capacitor.isNativePlatform() === true  (iPhone / Simulator)
  │     └── SignInWithApple.authorize() → { identityToken, ... }
  │           └── supabase.auth.signInWithIdToken({ provider: 'apple', token })
  │                 └── Supabase validates JWT, creates/updates user row
  │                       └── onAuthStateChange fires → router.replace('/home')
  │
  └── Capacitor.isNativePlatform() === false  (web browser)
        └── supabase.auth.signInWithOAuth({ provider: 'apple', redirectTo: ... })
              └── Safari → Apple OAuth → /auth/callback → onAuthStateChange fires
```

**Key facts:**
- Apple only returns `email` on the **first** sign-in. Subsequent sign-ins omit it. Supabase stores it from the first call — no special handling needed.
- "Hide My Email": Apple relays `randomstring@privaterelay.appleid.com` instead of the real email. Supabase treats it as a normal email. No code impact.
- Nonce: required for security. Generate a random string, pass raw to Supabase and the plugin. The plugin handles SHA-256 hashing for Apple.

**Plugin:** `@capacitor-community/apple-sign-in` — the standard Capacitor community plugin. Compatible with Capacitor 8.x.

**Apple button rules (enforced by App Review):**
- Use only: "Sign in with Apple" or "Continue with Apple"
- Background: black (#000000) with white text + white logo, OR white (#FFFFFF) with black text + black logo
- Size: must be at least as tall as the Google button (equal prominence)
- No custom colours, no rounded corners beyond a small radius, no adding emoji/decorations

---

## Blocks

### Block 1 — Plugin install + auth helper

#### Chunk 1.1 — Install and wire up the plugin

**Files:**
- `package.json` (root — where Capacitor packages live)
- Create: `frontend/lib/auth.ts` — platform-aware auth functions

**What it does:**
Installs `@capacitor-community/apple-sign-in`, runs `npx cap sync ios` to link it into the Xcode project, and creates a `frontend/lib/auth.ts` module that exports `signInWithGoogle()` and `signInWithApple()`. Moving auth logic out of `page.tsx` makes both functions independently testable and keeps the landing page clean.

**Install:**
```bash
npm install @capacitor-community/apple-sign-in
npx cap sync ios
```

**`frontend/lib/auth.ts` (new file):**
```typescript
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}

export async function signInWithApple(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    // Native iOS: show the system sign-in sheet (Face ID / Touch ID)
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
    const nonce = Math.random().toString(36).substring(2, 18)
    const result = await SignInWithApple.authorize({
      clientId: 'com.echoesofhome.app',
      redirectURI: 'https://vibrant-spontaneity-production-9f92.up.railway.app/auth/callback',
      scopes: 'email name',
      nonce,
    })
    await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.response.identityToken,
      nonce,
    })
  } else {
    // Web fallback: OAuth redirect (same as Google)
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
}
```

**Verify:** `cd frontend && npx next build` exits 0, no TypeScript errors.

---

#### Chunk 1.2 — Landing page: add Apple button, refactor to use auth.ts

**Files:**
- Modify: `frontend/app/page.tsx`

**What it does:**
Replaces the inline `signIn()` function with imports from `lib/auth.ts`. Adds an Apple sign-in button directly below the Google button. Both buttons sit in a vertical stack on mobile and a row on desktop.

**Button layout:**
```tsx
import { signInWithGoogle, signInWithApple } from '@/lib/auth'

// Replace the single button with:
<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
  {/* Google button — existing style unchanged */}
  <button onClick={signInWithGoogle} style={{ /* existing accent styles */ }}>
    Continue with Google
  </button>

  {/* Apple button — must follow Apple's brand guidelines */}
  <button
    onClick={signInWithApple}
    style={{
      background: '#000000',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 12,
      padding: '0.9rem 1.85rem',
      fontSize: '0.95rem',
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--sans)',
      letterSpacing: '0.02em',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      minWidth: 220,
    }}
  >
    {/* Apple logo SVG — white, official shape */}
    <svg width="16" height="20" viewBox="0 0 814 1000" fill="white" aria-hidden>
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-109.3S43.1 658 43.1 520c0-241.9 157.1-369.5 310.8-369.5 72.6 0 132.8 47.3 177.9 47.3 43.1 0 110.8-50.6 190.5-50.6 30.8 0 133.3 2.9 198.9 106.5zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
    </svg>
    Continue with Apple
  </button>
</div>
```

**Verify:** `cd frontend && npx next build` exits 0. Both buttons visible on landing page.

---

### Block 2 — Xcode entitlement (manual step, one-time)

This is a manual Xcode operation — cannot be automated via code.

**Steps:**
1. Open `ios/App/App.xcodeproj` in Xcode
2. Select the `App` target → **Signing & Capabilities** tab
3. Click **+ Capability** → search "Sign in with Apple" → add it
4. Xcode writes a new `App.entitlements` file (or updates existing one) with:
   ```xml
   <key>com.apple.developer.applesignin</key>
   <array>
     <string>Default</string>
   </array>
   ```
5. Build the project in Xcode (⌘B) — must build clean before testing on Simulator

**Why this is manual:** Entitlements require Xcode's provisioning system to register the capability. There is no CLI equivalent.

---

### Block 3 — Supabase Apple provider (blocked — needs Apple Developer account)

Document these steps so they're ready to execute when the account is purchased:

**In Apple Developer Portal (developer.apple.com):**
1. Certificates, IDs & Profiles → **Identifiers** → `+` → App IDs → register `com.echoesofhome.app` with "Sign in with Apple" capability enabled
2. Identifiers → `+` → **Services IDs** → create `com.echoesofhome.web` (this is the OAuth client for web flow) → configure "Sign in with Apple" → add return URL: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
3. Keys → `+` → enable "Sign in with Apple" → associate with App ID → download `.p8` private key (one-time download — keep safe)
4. Note your **Team ID** from the top-right of developer.apple.com

**In Supabase dashboard:**
5. Authentication → Providers → Apple → Enable
6. Fill in: Services ID, Team ID, Key ID, paste contents of `.p8` key file
7. Copy the Supabase callback URL shown → paste it back into the Services ID config in Apple Developer Portal (circular requirement — both sides need each other's URL)

**In `frontend/lib/auth.ts`:**
No code change needed — `signInWithIdToken` and `signInWithOAuth` already work once Supabase has the credentials.

---

## Supabase Apple provider URL (for later)

When you set up the Supabase Apple provider, the callback URL to enter in Apple Developer Portal will be:
```
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```
Find your project ref in Supabase dashboard → Project Settings → General.

---

## Success Criteria

| Item | Observable outcome |
|---|---|
| Apple button present | Landing page shows both "Continue with Google" and "Continue with Apple" buttons with equal height |
| Apple button meets guidelines | Black background, white Apple logo, white text — no custom colour |
| Native sheet (Simulator) | Tapping "Continue with Apple" on Simulator shows system sign-in sheet (requires Xcode entitlement) |
| Web fallback | Tapping "Continue with Apple" in a browser redirects to Apple OAuth |
| TypeScript clean | `cd frontend && npx next build` exits 0 |
| App Store Guideline 4.8 | Both providers present with equal prominence |

## What can be tested before Apple Developer account

| Test | Can do now |
|---|---|
| Button UI, layout, Apple logo | ✅ — Next.js dev server or build |
| `signInWithApple()` web OAuth flow | ✅ — needs Supabase Apple provider set up, but code is ready |
| Native sheet on iOS Simulator | ✅ — Simulator has built-in test Apple IDs (Settings → Sign in with Apple) |
| Full sign-in creating Supabase user | ❌ — needs Supabase Apple provider credentials |

## Decisions
```
[2026-05-06] [Auth] — Decision: @capacitor-community/apple-sign-in for native, signInWithOAuth for web fallback. Rejected: web OAuth only. Because: native sheet is expected UX in App Store apps; reviewers may flag web-only as substandard. Rejected: apple-sign-in-capacitor (older, unmaintained). Because: @capacitor-community/apple-sign-in is the canonical Capacitor 8.x community package.
[2026-05-06] [Auth] — Decision: auth logic extracted to frontend/lib/auth.ts. Rejected: inline in page.tsx. Because: two providers + platform detection branches inline would make page.tsx hard to follow; lib/auth.ts is independently readable.
```
