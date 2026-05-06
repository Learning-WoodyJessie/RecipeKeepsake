# App Store compliance — privacy URL, support URL, App Privacy labels (code-backed)

This document ties **Apple App Store Connect** requirements to **this repository’s behavior**, lists **gaps**, and states **how to close them**.

---

## 1. Public Privacy Policy URL

### What Apple expects

A stable **HTTPS** URL that opens in a browser **without signing in**, with enough detail for users (and reviewers) to understand what you collect and why.

### What the code does today

| Location | Behavior |
|----------|----------|
| `frontend/app/(app)/layout.tsx` | Wraps all app routes (including `/privacy`) in **`AuthGuard`**. |
| `frontend/components/AuthGuard.tsx` | If no Supabase session → **`router.replace('/')`**. |
| `frontend/app/(app)/privacy/page.tsx` | Short policy copy — **only reachable after login**. |

**Gap:** A reviewer or user who pastes your “privacy policy” link while logged out **cannot** read the in-app policy page. App Store Connect’s **Privacy Policy URL** field should **not** point at `/privacy/` for this app as currently wired.

### How we address it (implemented)

| Item | Detail |
|------|--------|
| **Static HTML** | `www/privacy-policy.html` — public copy aligned with the product (expand over time with legal review). |
| **Routes** | FastAPI serves **`GET`/`HEAD` `/privacy-policy`** and **`GET`/`HEAD` `/support`** from `www/` **before** the Next catch-all (`scripts/serve.py`). No JWT. |
| **Listing URL** | Use production base, e.g. `https://<your-railway-host>/privacy-policy` |

### Follow-ups for you

- [ ] Replace placeholder **“Last updated”** / contact email in `www/privacy-policy.html` after legal review.
- [ ] Optionally add a **visible link** on the signed-out landing page (`frontend/app/page.tsx`) to `/privacy-policy` (same origin on Railway).

---

## 2. Support URL

### What Apple expects

A way for users to get help: **support page**, **mailto**, or **contact form** — must work and match what you promise.

### What the code does today

| Location | Behavior |
|----------|----------|
| In-app | No dedicated “Help” route; **Account** / **Privacy** are post-login. |

**Resolved for listings:** Public **`/support`** page (no auth) with a working support inbox.

### How we address it (implemented)

| Item | Detail |
|------|--------|
| **Static HTML** | `www/support.html` — **theechoesofhomesupport@gmail.com** (mailto + visible address). |
| **Route** | `https://<host>/support` |

### Follow-ups for you

- [ ] Monitor **theechoesofhomesupport@gmail.com** during review (respond to Apple / users promptly).
- [ ] Keep the **support URL** and **contact email** in App Store Connect identical to what you publish here.

---

## 3. App Privacy labels (draft from actual code paths)

Use this as a **worksheet** when filling **App Store Connect → App Privacy**. Categories follow Apple’s questionnaire wording; adjust if Apple’s labels change.

### Data processors / third parties (not a checkbox — document in policy)

| Processor | Role (from codebase) |
|-----------|-------------------------|
| **Supabase** | Auth (JWT), Postgres, file storage for audio/images, user profiles. |
| **Google** | OAuth sign-in (`frontend/app/page.tsx` → Supabase `signInWithOAuth`). |
| **OpenAI** | Whisper transcription, GPT translation/structuring, DALL·E images (`scripts/serve.py` capture/translate, `prompts/`). |
| **Railway** | Hosts your FastAPI + static `frontend/out` bundle. |

### Suggested declarations (verify against Apple’s exact 2026 form)

| Data type (Apple sense) | Collected? | Linked to user? | Used for | Notes / code refs |
|-------------------------|------------|-----------------|----------|-------------------|
| **Name** | Yes | Yes | App functionality | Google / Supabase `user_metadata` (`AppTopBar`, auth). |
| **Email** | Yes | Yes | App functionality | Supabase auth. |
| **User ID** | Yes | Yes | App functionality | JWT `sub` / `id`; all `require_auth` API routes. |
| **Audio data** | Yes | Yes | App functionality | Upload to `/capture`, `/capture/process`, `/capture/save`; stored in Supabase storage. |
| **Photos / videos** | Optional | Yes | App functionality | Narrator `photo_url` from people flows; file uploads — declare if you allow image upload. |
| **Other user content** | Yes | Yes | App functionality | Transcripts, recipe JSON, cook notes, `people` bios/notes. |
| **Crash / diagnostics** | Partial | Often **not** linked | Analytics / app functionality | `POST /client-error` logs error message, React stack, **page URL** (`frontend/components/ErrorBoundary.tsx` → `scripts/serve.py`). **No auth** on that endpoint — treat as **diagnostics**; decide if Apple asks “linked to identity” (generally **not** unless you attach user id server-side — **you currently do not**). |

### Likely “No” or “not collected” (confirm)

| Data type | Reason |
|-----------|--------|
| **Location** | No `CLLocation` / geolocation APIs found in reviewed paths. |
| **Browsing history** | N/A beyond your own app. |
| **Contacts** | No Contacts framework usage identified. |
| **Advertising data** | No ad SDKs found in `frontend/` dependencies. |

### Gaps to resolve before submitting labels

1. **Crash/diagnostics:** If you want to avoid declaring crash data, you could **remove or gate** `/client-error` for production builds — otherwise **declare diagnostics** honestly (message + URL + stack can include PII in theory).
2. **Photos:** If users can upload narrator photos, ensure **App Privacy** includes **Photos** or **User Content** as appropriate and **Info.plist** has usage strings if the native layer touches the photo library.
3. **OpenAI retention:** Your policy should state that **audio/text are sent to OpenAI for processing** (subprocessors) — `www/privacy-policy.html` includes this; refine with OpenAI’s enterprise/BAA stance if applicable.

---

## 4. Other compliance hooks (brief)

| Topic | Code / gap | Action |
|-------|------------|--------|
| **Account deletion** | `DELETE /account` + UI on Account page | Keep visible; mention in policy (done in HTML). |
| **Sign in with Apple** | Google OAuth only | Review **Guideline 4.8**; add Sign in with Apple if required. |
| **Encryption export** | HTTPS only | Answer App Store Connect questionnaire per current Apple text. |

---

## Quick reference URLs (production)

After deploy, verify in an **incognito** window:

- `https://<YOUR_HOST>/privacy-policy`
- `https://<YOUR_HOST>/support`

Use those exact URLs in **App Store Connect**.
