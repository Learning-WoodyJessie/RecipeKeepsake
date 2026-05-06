# Echoes of Home — System Design

*Technical architecture reference. Last updated: 2026-05-05.*

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Repository Layout](#2-repository-layout)
3. [Deployment Architecture](#3-deployment-architecture)
4. [Backend — FastAPI Server](#4-backend--fastapi-server)
5. [AI Pipeline](#5-ai-pipeline)
6. [Database — Supabase](#6-database--supabase)
7. [Frontend — Next.js](#7-frontend--nextjs)
8. [Authentication Flow](#8-authentication-flow)
9. [Capture Flow (End-to-End)](#9-capture-flow-end-to-end)
10. [Browse & Translate Flow](#10-browse--translate-flow)
11. [Mobile — Capacitor](#11-mobile--capacitor)
12. [Component Design](#12-component-design)
13. [File Organisation Findings](#13-file-organisation-findings)

---

## 1. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Backend runtime** | Python | 3.11 | API server, pipeline orchestration |
| **HTTP framework** | FastAPI | 0.110+ | REST API with async request handling |
| **ASGI server** | Uvicorn | 0.29+ | Production server process |
| **Frontend framework** | Next.js | 16.2 | React-based static export |
| **UI language** | TypeScript + React | 19 | Type-safe component tree |
| **Auth** | Supabase Auth | 2.x | Google OAuth, JWT session management |
| **Database** | Supabase (PostgreSQL 15) | — | Recipe rows, people rows, translations cache, rate limits |
| **Object storage** | Supabase Storage | — | Private audio bucket, public images bucket |
| **Transcription** | OpenAI gpt-4o-transcribe | — | Telugu audio → raw transcript |
| **Translation (Call A)** | OpenAI GPT-4o | — | Raw Telugu transcript → faithful English |
| **Structuring (Call B)** | OpenAI GPT-4o | — | English narration → typed recipe JSON |
| **Image generation** | OpenAI DALL-E 3 | — | Recipe-enriched food photography prompt |
| **Multi-language translation** | OpenAI GPT-4o | — | Structured fields → EN/TE/HI/KN/ES/FR |
| **Deployment** | Railway (Nixpacks) | — | Single container: Python API + Next.js build |
| **Mobile wrapper** | Capacitor | 8.x | iOS and Android native shell over web app |
| **Config** | YAML + env vars | — | `data/config.yaml` for defaults; Railway env for secrets |

---

## 2. Repository Layout

```
RecipeKeepsake/
│
├── scripts/
│   ├── serve.py          ← FastAPI HTTP server (entry point)
│   └── capture.py        ← CLI capture script (local dev/testing only)
│
├── pipeline/             ← 3-stage typed pipeline (pure functions)
│   ├── models.py         ← TranscriptResult, RecipeData, SavedRecipe dataclasses
│   ├── transcribe.py     ← Stage 1: audio_path → TranscriptResult
│   ├── transform.py      ← Stage 2: TranscriptResult → RecipeData
│   └── persist.py        ← Stage 3: RecipeData + audio → SavedRecipe (Supabase)
│
├── prompts/              ← LLM call definitions
│   ├── llm.py            ← LLMProvider ABC + OpenAIProvider implementation
│   ├── translate_audio.py      ← Call A system prompt: Telugu → English translation
│   ├── structure.py      ← Call B system prompt: English → structured JSON
│   ├── image.py          ← DALL-E 3 prompt builder + image generation
│   └── translate_fields.py ← Multi-language field translation (EN/TE/HI/KN/ES/FR)
│
├── tools/                ← External service wrappers (Supabase, Whisper, config)
│   ├── storage.py        ← Supabase CRUD: recipes, people, audio, images, translations
│   ├── whisper.py          ← Whisper API call with glossary injection
│   ├── glossary.py       ← Telugu cooking glossary loader + hint builder
│   └── config.py         ← data/config.yaml loader
│
├── frontend/             ← Next.js 16 static export (deployed via Railway)
│   ├── app/
│   │   ├── layout.tsx        ← Root HTML shell, font imports
│   │   ├── page.tsx          ← Landing page (pre-auth)
│   │   ├── globals.css       ← Minimal base reset
│   │   ├── auth/callback/
│   │   │   └── page.tsx      ← OAuth redirect handler
│   │   └── (app)/            ← Route group — all authenticated screens
│   │       ├── layout.tsx    ← AuthGuard + Sidebar + AppTopBar shell
│   │       ├── globals.css   ← Full CSS variable system + responsive rules
│   │       ├── home/page.tsx         ← Home: hero banner, favorites, recent list
│   │       ├── memories/page.tsx     ← All Recipes: grid, filter, narrator filter
│   │       ├── memory/page.tsx       ← Memory detail: ingredients, steps, audio
│   │       ├── people/page.tsx       ← Our People: narrator cards, CRUD modal
│   │       ├── capture/page.tsx      ← Record audio + 3-step review wizard
│   │       ├── upload/page.tsx       ← Upload existing audio + same wizard
│   │       ├── account/page.tsx      ← Account deletion
│   │       └── privacy/page.tsx      ← Privacy policy
│   ├── components/
│   │   ├── AppTopBar.tsx     ← Search bar, greeting, avatar
│   │   ├── Sidebar.tsx       ← Nav, SVG logo, mobile drawer
│   │   ├── AuthGuard.tsx     ← Redirects unauthenticated users to landing
│   │   ├── ReviewWizard.tsx  ← 3-step post-capture review UI
│   │   ├── AudioPlayer.tsx   ← HTML5 audio with custom waveform UI
│   │   ├── LanguageSwitcher.tsx ← EN/TE/HI/KN/ES/FR toggle
│   │   ├── MemoryCard.tsx    ← Recipe card (grid view)
│   │   ├── MemoryListRow.tsx ← Recipe row (list view)
│   │   ├── NarratorChip.tsx  ← Narrator badge used on capture screens
│   │   └── WaveformBars.tsx  ← Deterministic animated waveform visualiser
│   ├── lib/
│   │   ├── api.ts            ← authFetch wrapper + typed api.* namespaces
│   │   ├── supabase.ts       ← Supabase client singleton (auth only)
│   │   └── favorites.ts      ← localStorage favorites: readFavorites / toggleFavorite
│   └── public/
│       ├── hero-home.png         ← Watercolor: recipe book + family photos
│       ├── hero-people.png       ← Watercolor: grandmother portraits
│       └── hero-memories.png     ← Watercolor: recipe book + food
│
├── data/
│   ├── config.yaml              ← LLM model config (gpt-4o, gpt-4o-transcribe)
│   ├── telugu_cooking_terms.yaml ← Cooking glossary (injected into Whisper + LLM)
│   └── migrations/
│       ├── 001_add_image_url.sql ← image_url + token columns; storage buckets; RLS
│       └── 003_rate_limits.sql   ← rate_limits table + increment_rate_limit() function
│
├── tests/                ← 97 tests, all mocked (no live API calls)
├── capacitor.config.json ← Mobile: appId, server.url (Railway), webDir
├── nixpacks.toml         ← Railway build: Python 3.11 + Node 20 + Next.js build
├── Procfile              ← Railway start command
└── requirements.txt      ← Python dependencies
```

---

## 3. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Railway — Single Container                 │
│                                                               │
│  nixpacks.toml build:                                         │
│    1. pip install -r requirements.txt  (Python layer)        │
│    2. cd frontend && npm ci            (Node deps)           │
│    3. cd frontend && npm run build     (Next.js static build)│
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Uvicorn (Python 3.11)                               │    │
│  │  scripts/serve.py — FastAPI app                      │    │
│  │                                                       │    │
│  │  /_next/*       → StaticFiles(frontend/out/_next/)   │    │
│  │  /api routes    → FastAPI handlers                   │    │
│  │  /*             → FileResponse(frontend/out/...)     │    │
│  │                   (direct file first, then index.html│    │
│  │                    fallback for SPA routes)          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  PORT env var set by Railway                                  │
└─────────────────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
 ┌─────────────────┐       ┌──────────────────────┐
 │  Supabase        │       │  OpenAI API           │
 │  - PostgreSQL    │       │  - gpt-4o-transcribe  │
 │  - Auth (Google) │       │  - GPT-4o (text)      │
 │  - Storage       │       │  - DALL-E 3 (images)  │
 │    audio bucket  │       └──────────────────────┘
 │    images bucket │
 └─────────────────┘
          ▲
          │ (served from Railway URL)
          │
 ┌─────────────────┐     ┌─────────────────────┐
 │  Web Browser     │     │  Capacitor Shell     │
 │  (desktop/mobile)│     │  iOS / Android       │
 │  HTTPS           │     │  server.url = Railway │
 └─────────────────┘     └─────────────────────┘
```

**Why single container:** Next.js is built to a static export (`output: 'export'`). No Node.js process is needed at runtime — FastAPI serves the HTML/JS/CSS directly from `frontend/out/`. This avoids a second Railway service and inter-service networking.

**nixpacks.toml forced to Python provider:** Railway detects `package.json` (Capacitor mobile tooling at repo root) before `requirements.txt` and would default to Node. The `providers = ["python"]` line overrides this. Node 20 is installed alongside Python for the build phase only.

---

## 4. Backend — FastAPI Server

**File:** `scripts/serve.py`

### Responsibility boundary

`serve.py` is a **thin HTTP adapter only**. It handles:
- Multipart form parsing (`UploadFile`)
- JWT authentication (`require_auth` dependency)
- Postgres-backed rate limiting
- Static file serving for the Next.js export
- Delegating all business logic to `pipeline/` and `tools/`

It does not contain transcription, LLM, or storage logic.

### Route map

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET/HEAD` | `/` | — | Serve `frontend/out/index.html` |
| `GET` | `/recipe/{token}` | ✅ | Fetch single recipe by share token |
| `GET` | `/recipes` | ✅ | List authenticated user's recipes |
| `POST` | `/capture` | ✅ | Full pipeline: transcribe → translate → structure → image → save |
| `POST` | `/capture/process` | ✅ | Stages 1–2 only: returns structured JSON for review, no save |
| `POST` | `/capture/save` | ✅ | Stage 3 only: persist reviewed recipe |
| `GET` | `/recipe/{token}/translate` | ✅ | Translate recipe fields to target language |
| `PATCH` | `/recipe/{token}` | ✅ | Update user_notes on a recipe |
| `DELETE` | `/recipe/{token}` | ✅ | Hard-delete recipe (ownership enforced) |
| `GET/HEAD` | `/people` | conditional | JSON list with Bearer; HTML page without |
| `POST` | `/people` | ✅ | Create narrator profile |
| `PUT` | `/people/{id}` | ✅ | Update narrator profile (ownership enforced) |
| `DELETE` | `/people/{id}` | ✅ | Delete narrator profile (ownership enforced) |
| `DELETE` | `/account` | ✅ | Delete all user data (cascades audio, memories, people, auth) |
| `POST` | `/generate-image` | ✅ | Regenerate DALL-E image for a recipe |
| `GET` | `/{path:path}` | — | SPA catch-all: direct file → index.html fallback |

### Authentication

```python
# scripts/serve.py

async def decode_auth_user(creds) -> dict:
    # 1. Try local JWT verification via PyJWT + SUPABASE_JWT_SECRET (~0ms)
    # 2. Fall back to Supabase network call if local verify fails (~75ms)
    # 3. Raise HTTP 500 (not silent pass) if SUPABASE_URL missing in production
```

Two-layer strategy: local `PyJWT` verification on the fast path (no network), Supabase `/auth/v1/user` as fallback for revoked tokens. `_user_id(user)` extracts `sub` (preferred) or `id` from the JWT payload.

### Rate limiting

```python
# tools/storage.py — increment_rate_limit() Postgres function
# scripts/serve.py

_LIMITS = {
    "capture":        10/day   # MAX_CAPTURE_PER_DAY env var
    "translate":      50/day   # MAX_TRANSLATE_PER_DAY
    "generate-image": 20/day   # MAX_IMAGE_PER_DAY
}
```

Limits are enforced via atomic Postgres upsert — correct across multiple Railway instances and survives restarts. In-memory dicts (broken in multi-instance deployments) were removed in Phase 1.6.

### Static file serving

```python
# Priority order for /{path}:
# 1. frontend/out/{path}   — exact file (images, fonts, manifests)
# 2. frontend/out/{path}/index.html  — SPA route with directory
# 3. frontend/out/index.html         — SPA catch-all
```

`/_next/*` is mounted as FastAPI `StaticFiles` for performance (bypass catch-all). All other files go through the three-step fallback. Without step 1, `public/` assets (hero images, icons) return 404 in production because Next.js copies them flat into `out/` rather than under `_next/`.

---

## 5. AI Pipeline

The pipeline is a **strict linear sequence of pure functions**. Each stage has one input type and one output type. HTTP concerns live in `serve.py`; pipeline stages are stateless and fully testable without a server.

### Stage model

```
audio_path: str
    └─ Stage 1 (pipeline/transcribe.py)  → TranscriptResult
        └─ Stage 2 (pipeline/transform.py)  → RecipeData
            └─ Stage 3 (pipeline/persist.py)    → SavedRecipe
```

```python
# pipeline/models.py

@dataclass
class TranscriptResult:
    raw: str      # Verbatim Whisper output (Telugu + code-switching)
    english: str  # Faithful English translation (Call A)

@dataclass
class RecipeData:
    dish_name: str
    ingredients: list   # [{"item": str, "quantity": str}]
    steps: list         # ["step text", ...]
    cook_notes: str     # vague instructions verbatim
    review_flags: list  # implied steps / ambiguous instructions
    transcript_raw: str
    transcript_english: str
    image_url: str = "" # populated by serve.py after Stage 2

@dataclass
class SavedRecipe:
    id: str
    token: str
    audio_url: str
```

### Stage 1 — Transcribe (`pipeline/transcribe.py`)

```
tools/transcribe.py → gpt-4o-transcribe (language="te")
                      initial_prompt: Telugu cooking glossary (tools/glossary.py)
                      → raw: str  (Telugu script + English code-switching)

prompts/translate_audio.py → GPT-4o (Call A)
                       system: faithful translation prompt + glossary
                       → english: str  (preserves vague quantities verbatim)
```

**Why `gpt-4o-transcribe` instead of `whisper-1`:** `whisper-1` rejects `language="te"` and auto-detects Telugu as Hindi, producing incorrect script. `gpt-4o-transcribe` supports Telugu natively.

**Why the glossary injection:** Telugu cooking terms like `konchem` (a little) have many spelling variants. Injecting the glossary as `initial_prompt` primes the model toward canonical spellings. The glossary lives in `data/telugu_cooking_terms.yaml` — new terms require no code changes.

**Why two separate LLM calls (Call A + Call B) instead of one:**
Combined translate+structure causes the model to normalise vague measurements ("a handful" → "200g"). Separate calls let Call A be a faithful translator (no normalisation) and Call B be a pure structurer operating on clean English.

### Stage 2 — Transform (`pipeline/transform.py`)

```
prompts/structure.py → GPT-4o (Call B, json_mode=True)
  system: STRUCTURE_SYSTEM
    - extract dish_name, ingredients, steps, cook_notes, review_flags
    - vague quantities → cook_notes (NOT ingredients.quantity)
    - steps → cooking order even if narrated non-linearly
    - review_flags → implied steps, ambiguous instructions
  → RecipeData (populated from JSON response)
```

`json_mode=True` forces `response_format: json_object` to prevent markdown-fenced JSON responses, which cause `json.loads` to fail. Fence-strip fallback exists as defensive code.

### Image generation (parallel to Stage 2, in `serve.py`)

```
prompts/image.py → _build_prompt(dish_name, ingredients, steps, cook_notes)
  - extracts colour-bearing ingredients (_COLOUR_BEARERS set)
  - selects serving vessel cue (_VESSEL_CUES dict)
  - identifies regional style (_REGIONAL_CUES dict)
  - picks garnish from steps
  - extracts texture from cook_notes
  → enriched prompt string

DALL-E 3 (1024×1024, quality=standard)
  → ephemeral URL (expires ~1hr)

tools/storage.store_image()
  → downloads via httpx
  → uploads to Supabase 'images' bucket (public)
  → returns permanent public URL
```

DALL-E URLs expire in ~1 hour. `store_image()` downloads and re-uploads to Supabase immediately at capture time so image cards never show broken images later.

### Stage 3 — Persist (`pipeline/persist.py`)

```
tools/storage.upload_audio()
  → Supabase Storage 'audio' bucket (private)
  → stores filename only (NOT a public URL — signed URLs generated at serve time)

tools/storage.insert_recipe()
  → Supabase 'recipes' table
  → returns { id, token } where token = UUID string used in share URLs
```

Audio upload failure is **non-fatal** — the recipe is saved even if the audio file fails to store. This prevents data loss during Supabase Storage quota or network hiccups.

### Multi-language translation (`prompts/translate_fields.py`)

Separate from the pipeline. Called on-demand when a user requests a language:

```
GET /recipe/{token}/translate?lang=te

prompts/translate_fields.py → GPT-4o (json_mode=True)
  system: per-language rules
    - Telugu/Hindi/Kannada: Unicode script enforced (NOT Roman transliteration)
    - Glossary injected for Telugu target
    - Vague quantities preserved as natural equivalents (not converted to numbers)
  input: JSON { dish_name, ingredients, steps, cook_notes }
  output: same JSON structure, content in target language

tools/storage.cache_translation()
  → stored in recipes.translations JSONB column
  → subsequent requests for same token+lang skip the LLM call
```

---

## 6. Database — Supabase

### Supabase services in use

| Service | Purpose |
|---|---|
| **PostgreSQL** | Application data (recipes, people, rate_limits) |
| **Supabase Auth** | Google OAuth, JWT issuance, user management |
| **Storage — `audio` bucket** | Private audio recordings (signed URLs, 1hr expiry) |
| **Storage — `images` bucket** | Public DALL-E images (permanent URLs) |

### Schema

```sql
-- recipes table (core entity)
CREATE TABLE recipes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token               text UNIQUE DEFAULT gen_random_uuid()::text,
  user_id             text,           -- Supabase auth.uid()
  recorded_by_email   text,
  recorded_by_name    text,
  narrator            text,           -- "Grandma", "Thatha", etc.
  language            text DEFAULT 'te',
  recorded_at         timestamptz DEFAULT now(),
  audio_url           text,           -- filename in 'audio' bucket
  transcript_raw      text,           -- Whisper verbatim output
  transcript_english  text,           -- Call A output
  dish_name           text,
  ingredients         jsonb,          -- [{"item": str, "quantity": str}]
  steps               jsonb,          -- ["step 1", "step 2", ...]
  cook_notes          text,           -- vague instructions verbatim
  review_flags        jsonb,          -- ["implied step: drain water"]
  image_url           text,           -- permanent Supabase Storage URL
  translations        jsonb,          -- {"te": {...}, "hi": {...}} cache
  user_notes          text            -- Keeper's personal annotation
);

-- people table (narrator profiles)
CREATE TABLE people (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text,                  -- Supabase auth.uid()
  name         text NOT NULL,
  relationship text,                  -- "Grandmother", "Uncle"
  emoji        text,
  photo_url    text,                  -- base64 data URI or Supabase URL
  bio          text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- rate_limits table (Postgres-native rate limiting)
CREATE TABLE rate_limits (
  user_id   text   NOT NULL,
  date      date   NOT NULL DEFAULT CURRENT_DATE,
  endpoint  text   NOT NULL,          -- "capture" | "translate" | "generate-image"
  count     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date, endpoint)
);

-- Atomic upsert function — called from tools/storage.check_rate_limit_db()
CREATE OR REPLACE FUNCTION increment_rate_limit(p_user_id text, p_endpoint text)
RETURNS integer LANGUAGE plpgsql AS $$
  INSERT INTO rate_limits (user_id, date, endpoint, count)
  VALUES (p_user_id, CURRENT_DATE, p_endpoint, 1)
  ON CONFLICT (user_id, date, endpoint)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count;
$$;
```

### Row Level Security (RLS)

Active on both `recipes` and `people` tables:

```sql
-- user_id::text = auth.uid()::text  (cast required — uuid vs text)
-- Enforced at database layer as backstop against direct anon-key access
-- Python ownership checks in serve.py are a second layer (defence in depth)
```

### Storage access model

| Bucket | Visibility | Access pattern |
|---|---|---|
| `audio` | **Private** | Signed URLs generated by `tools/storage._sign_audio()` at serve time; 1hr expiry; never stored as full URL |
| `images` | **Public** | Permanent public URL stored in `recipes.image_url`; no expiry |

Audio uses signed URLs because voice recordings are personal family data. Images are public because they are DALL-E generated (no personal content).

### Translation cache

```python
# tools/storage.py

def cache_translation(token: str, lang: str, data: dict) -> None:
    # JSONB patch on recipes.translations column
    # Key: lang code ("te", "hi", etc.)
    # Value: {"dish_name": ..., "ingredients": ..., "steps": ..., "cook_notes": ...}

def get_cached_translation(token: str, lang: str) -> dict | None:
    # Returns cached dict if present, None if not yet translated
```

---

## 7. Frontend — Next.js

### Build mode

`next.config.ts` sets `output: 'export'` — generates a fully static site in `frontend/out/`. No Node.js server at runtime. FastAPI serves the output directory.

```typescript
// frontend/next.config.ts
const nextConfig: NextConfig = {
  output: "export",          // static export — no SSR
  trailingSlash: true,       // /memories/ → out/memories/index.html
  images: { unoptimized: true }, // no Next.js Image Optimization (no Node runtime)
};
```

`trailingSlash: true` means every route compiles to a directory with an `index.html`. FastAPI's catch-all handles both `/memories` (no slash) and `/memories/` (with slash) by checking for `{path}/index.html`.

### Route group `(app)`

The `(app)` route group applies the authenticated shell layout to all inner pages without affecting the URL path. `frontend/app/(app)/layout.tsx` wraps every authenticated page with `AuthGuard` + `Sidebar` + `AppTopBar`.

```
app/
  layout.tsx          ← Root HTML (no auth)
  page.tsx            ← Landing (no auth)
  auth/callback/      ← OAuth redirect handler (no auth)
  (app)/
    layout.tsx        ← AuthGuard + shell (auth required)
    home/             ← /home
    memories/         ← /memories
    memory/           ← /memory?token=...
    people/           ← /people
    capture/          ← /capture
    upload/           ← /upload
    account/          ← /account
    privacy/          ← /privacy
```

### CSS variable system

All design tokens are CSS custom properties defined in `frontend/app/(app)/globals.css`. Components use `var(--name)` — no hardcoded colours in component files.

```css
:root {
  --accent:       #C4522A;   /* terracotta — primary action colour */
  --accent-light: #FBF0EA;   /* tint — soft backgrounds */
  --serif:        'Playfair Display', Georgia, serif;
  --sans:         'Inter', system-ui, sans-serif;
  --cream:        #FAF6F0;   /* page background */
  --surface:      #FFFFFF;   /* card / panel background */
  --text:         #2C1810;   /* primary text */
  --text2:        #5C3D2E;   /* secondary text */
  --muted:        #9C7B6E;   /* timestamps, labels */
  --border:       #E8DDD6;   /* card borders */
}
```

### `lib/api.ts` — API client

Single module that centralises all backend communication. Every call:
1. Gets the current Supabase session via `supabase.auth.getSession()`
2. Attaches `Authorization: Bearer {access_token}` header
3. Calls `fetch(API_URL + path, ...)`
4. Throws with `err.detail` on non-OK responses

```typescript
// frontend/lib/api.ts

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export const api = {
  recipes: { list, get, translate, patch, delete },
  people:  { list, create, update, delete },
  capture: { process, save },
  account: { delete },
}
```

### `lib/supabase.ts` — Auth client

Singleton Supabase client used **only for auth** (session management, OAuth). All data access goes through `lib/api.ts` → FastAPI → `tools/storage.py` using the service role key — never the anon key directly from the browser.

### `lib/favorites.ts` — Favorites persistence

```typescript
// frontend/lib/favorites.ts

const KEY = 'rk_favorites'

export function readFavorites(): string[]          // localStorage read with try/catch
export function toggleFavorite(token: string): string[]  // add or remove token, persist
```

Favorites are stored client-side only — intentionally lightweight, no backend sync needed for a single-user app.

### Responsive layout

```
≥700px (desktop):
  .rk-sidebar-wrap { display: flex }
    ├── <Sidebar />            fixed-width left column
    └── <div flex:1 width:100%>  fills remaining space
          ├── <AppTopBar />    sticky top header
          └── <main />         scrollable content

≤699px (mobile):
  .rk-sidebar-wrap { display: block }
    <Sidebar isOpen={bool} />  position:fixed, transform:translateX(-100%)
                                → .open { transform:translateX(0) }
    <AppTopBar onMenuClick />  ☰ button visible, greeting hidden
    <main />                   full width (width:100% on wrapper required —
                                flex:1 has no effect in block context)
```

---

## 8. Authentication Flow

Authentication is handled entirely by Supabase Auth using the OAuth 2.0 authorization code flow with Google as the identity provider. On sign-in, the browser is redirected to Google, which returns a short-lived authorization code to the app's callback route; the frontend exchanges that code with Supabase for a JWT access token and a refresh token, both stored in `localStorage`. Every subsequent API call attaches the access token as a `Bearer` header, which FastAPI validates locally using `PyJWT` and the `SUPABASE_JWT_SECRET` — no network round-trip to Supabase on the hot path. The JWT payload carries the user's `sub` (stable user ID), `email`, and `user_metadata`, which the backend uses to scope all database queries to the authenticated user.

```
1. User clicks "Sign in with Google" on landing page
   → supabase.auth.signInWithOAuth({ provider: 'google',
       redirectTo: window.location.origin + '/auth/callback' })
   → browser redirected to Google consent screen

2. Google returns to: /auth/callback?code=...
   → frontend/app/auth/callback/page.tsx
   → supabase.auth.exchangeCodeForSession(code)
   → Supabase stores session (access_token + refresh_token) in localStorage

3. Every subsequent page load:
   → AuthGuard (frontend/components/AuthGuard.tsx)
   → supabase.auth.getSession()
   → if no session: redirect to '/' (landing)
   → if session: render children

4. Every API call:
   → lib/api.ts authFetch()
   → attach Authorization: Bearer {access_token}
   → FastAPI require_auth dependency
   → local PyJWT verification (SUPABASE_JWT_SECRET)
   → if valid: extract user payload, continue
   → if invalid: HTTP 401
```

Capacitor (mobile) uses the system browser for OAuth (`Capacitor.Plugins.Browser.open`) rather than a WebView, which Google blocks. The `recipekeepsake://auth/callback` deep link is registered in iOS `Info.plist` and Android `AndroidManifest.xml` to capture the redirect back to the native app.

---

## 9. Capture Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser / Capacitor — frontend/app/(app)/capture/page.tsx      │
│                                                                   │
│  1. Narrator selection (NarratorChip)                            │
│     → api.people.list() → show available narrators               │
│                                                                   │
│  2. Record button → MediaRecorder API (browser built-in)         │
│     → WaveformBars visualiser (AnalyserNode → canvas bars)       │
│     → audio chunks collected in memory                           │
│                                                                   │
│  3. Stop recording                                               │
│     → Blob assembled from chunks                                  │
│     → ReviewWizard.tsx entered                                   │
│                                                                   │
│  4. api.capture.process(formData)                                │
│     → POST /capture/process  multipart (audio file)              │
└──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI — scripts/serve.py                                      │
│                                                                   │
│  5. require_auth → JWT verified                                  │
│  6. rate limit checked (capture, 10/day)                        │
│  7. audio saved to tempfile                                      │
│  8. pipeline.transcribe.run_transcribe(audio_path)               │
│     a. tools/transcribe.transcribe_audio()                       │
│        → OpenAI gpt-4o-transcribe (language=te, glossary prompt) │
│        → raw: str (Telugu + English code-switching)              │
│     b. prompts/translate_audio.translate_to_english(raw, provider)     │
│        → GPT-4o Call A (preserve vague terms)                    │
│        → english: str                                            │
│  9. pipeline.transform.run_transform(transcript)                  │
│     → prompts/structure.structure_recipe(english, provider)      │
│     → GPT-4o Call B (json_mode=True)                             │
│     → RecipeData { dish_name, ingredients, steps, cook_notes ... }│
│  10. _generate_image(dish_name, ingredients, steps, cook_notes)  │
│      → prompts/image._build_prompt() → enriched DALL-E prompt   │
│      → DALL-E 3 → ephemeral URL                                  │
│      → tools/storage.store_image() → Supabase 'images' bucket   │
│  11. Returns JSON (not yet saved to DB)                          │
└──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Browser — ReviewWizard.tsx (3-step review)                      │
│                                                                   │
│  Step 1: Confirm title + dish photo                              │
│  Step 2: Edit ingredients and steps inline                        │
│          review_flags shown for Keeper attention                 │
│  Step 3: Confirm save                                             │
│                                                                   │
│  12. api.capture.save(reviewedRecipe)                            │
│      → POST /capture/save (JSON body)                            │
└──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI — /capture/save                                         │
│                                                                   │
│  13. pipeline.persist.run_persist(recipe_data, audio_path, ...)  │
│      a. tools/storage.upload_audio() → 'audio' bucket           │
│         stores filename; failure is non-fatal                    │
│      b. tools/storage.insert_recipe() → 'recipes' table         │
│         → returns { id, token }                                  │
│  14. _sign_audio(audio_url) → 1hr signed URL for immediate play  │
│  15. Returns saved recipe JSON with token                        │
└──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
             User sees "Preserved forever" card
             Token-based URL: /memory?token={uuid}
```

---

## 10. Browse & Translate Flow

```
/memories page load
  → api.recipes.list()   GET /recipes   → Supabase recipes filtered by user_id
  → api.people.list()    GET /people    → Supabase people filtered by user_id
  → client builds peopleMap: narrator.toLowerCase() → { photo, relationship }
  → displayed = filter(narratorParam) → filter(q) → filter(tag) → sort()
  → renders MemoryCard grid (2-col desktop, 1-col mobile)

/memory?token=X page load
  → api.recipes.get(token)  GET /recipe/{token}
  → audio_url replaced with fresh signed URL at serve time
  → renders: dish image, ingredients, steps, cook_notes, AudioPlayer, transcript

Language switch (LanguageSwitcher.tsx)
  → click EN/TE/HI/KN/ES/FR button
  → api.recipes.translate(token, lang)  GET /recipe/{token}/translate?lang=te
  → serve.py checks translations cache (recipes.translations JSONB)
    ├── cache hit:  return cached fields (no LLM call)
    └── cache miss: prompts/translate_fields.translate_recipe_fields()
                   → GPT-4o, json_mode=True, Unicode script enforced
                   → cache result in recipes.translations
                   → return translated fields
  → onTranslated(fields) → displayed = translatedFields ?? memory
```

---

## 11. Mobile — Capacitor

```
capacitor.config.json:
  appId:       com.echoesofhome.app
  appName:     Echoes of Home
  webDir:      frontend/out          ← used for local Capacitor builds
  server.url:  https://<railway-url>  ← live app always loads from Railway
  androidScheme: https
```

When `server.url` is set, Capacitor ignores `webDir` at runtime and loads the live Railway URL instead. This means the app always runs the latest deployed version without an app store release cycle. `webDir` is used when building the native binary locally (for App Store submission).

**Platforms:**
- Android: `android/` — `AndroidManifest.xml` has `RECORD_AUDIO` permission and `recipekeepsake://` deep link intent filter
- iOS: `ios/` — `Info.plist` has microphone usage description and `recipekeepsake` URL scheme

---

## 12. Component Design

### `AuthGuard.tsx`

Wraps all authenticated pages. On mount: calls `supabase.auth.getSession()`. If no session → `router.replace('/')`. Renders `null` until auth state resolves (prevents flash of authenticated content).

### `Sidebar.tsx`

- SVG logo inline (double ring + 14 waveform bars + heart + serif text). No image file dependency.
- Navigation groups: Memories (All Recipes), Capture (Record, Upload), People.
- Mobile: `position: fixed`, `width: 260px`, `transform: translateX(-100%)` at ≤699px. CSS class `.open` → `transform: translateX(0)`. Transition: 250ms ease.
- Accepts `isOpen: bool` and `onClose: () => void` props.
- Every nav link calls `onClose()` on click (closes drawer on mobile after navigation).

### `AppTopBar.tsx`

- Search form: on submit → `router.push('/memories?q=' + encodeURIComponent(s))`. Client-side search — no API call.
- Greeting: "Welcome home, {firstName} ♡" — `supabase.auth.getUser()` on mount, extracts first name from `user_metadata.full_name` or email prefix.
- Avatar: filled accent circle (`background: var(--accent)`) showing user initial. Click → `/account`.

### `ReviewWizard.tsx`

Three-step modal after capture or upload:
1. **Title step**: editable `dish_name`, generated dish image, narrator confirmation.
2. **Edit step**: inline-editable `ingredients` array (add/remove rows), inline-editable `steps` array, `cook_notes` display, `review_flags` highlighted for Keeper attention.
3. **Save step**: summary card + "Preserve forever" CTA → `api.capture.save(reviewed)`.

### `WaveformBars.tsx`

Renders a row of animated bars. Deterministic height per position (not random, so bars are stable across re-renders). Used as visual identity on memory cards and in the recording UI.

### `LanguageSwitcher.tsx`

Renders language pill buttons (EN, TE, HI, KN, ES, FR). On click: calls `api.recipes.translate(token, lang)`, passes result up via `onTranslated(fields)`. Caches in component state — switching to a previously loaded language is instant.

### `AudioPlayer.tsx`

Wraps HTML5 `<audio>` with custom play/pause button, progress scrubber, and elapsed/total time display. Accepts `src` (signed URL).

---

## 13. File Organisation Findings

### Issues identified

**1. `web/` directory — dead code**

`web/app.html` was the original 4,900-line vanilla JS SPA, now fully replaced by `frontend/`. The directory also contains prototype HTML files (`prototype_review_wizard.html`, `prototype_translation.html`) and `web/nextjs/` (an early incomplete Next.js scaffold). None of these are served or referenced in the active build. `web/privacy.html` is referenced by `/privacy` — this is now also a Next.js page at `frontend/app/(app)/privacy/page.tsx`.

**Recommendation:** Delete `web/app.html`, `web/nextjs/`, `web/prototype_*.html`. Confirm `/privacy` is fully served by the Next.js route and remove the FastAPI `/privacy` FileResponse handler if it exists. Keep `web/assets/` only if any images are not already duplicated in `frontend/public/`.

**2. `www/manifest.json` — orphaned PWA manifest**

From an early PWA attempt. Not referenced in the current frontend or server. Should be deleted.

**3. `frontend/public/` — unused Next.js template assets**

The following files are Next.js default template placeholders, not used in any page or component:
`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`, `chatgpt.png` (design reference screenshot).

**Recommendation:** Delete these six files.

**4. `prompts/translate_audio.py` vs `prompts/translate_fields.py` — confusing names**

Both files contain translation prompts but serve entirely different purposes:
- `prompts/translate_audio.py` — Call A: Telugu audio transcript → English (pipeline stage 1)
- `prompts/translate_fields.py` — structured fields → target language (on-demand multi-language)

A developer reading the filenames cannot distinguish these roles.

**Recommendation:** Rename to `prompts/translate_audio.py` and `prompts/translate_fields.py`. Update imports in `pipeline/transcribe.py` and `scripts/serve.py`.

**5. `tools/transcribe.py` vs `pipeline/transcribe.py` — same name, different layer**

`tools/transcribe.py` is the raw Whisper API call. `pipeline/transcribe.py` is the Stage 1 orchestrator that calls it. The identical names in different packages cause confusion when navigating.

**Recommendation:** Rename `tools/transcribe.py` to `tools/transcribe.py`. Update the import in `pipeline/transcribe.py`.

**6. `scripts/capture.py` — partial overlap with `/capture` endpoint**

`scripts/capture.py` is a CLI orchestrator that runs the full pipeline locally. Since the pipeline is now in `pipeline/` and the HTTP layer is in `serve.py`, `capture.py` is mainly useful for local dev testing without running the server. Its existence is justified but it should be documented clearly as a development tool, not a production code path.

**7. Two `globals.css` files**

`frontend/app/globals.css` (root level) contains only a minimal body/html reset. `frontend/app/(app)/globals.css` contains the full CSS variable system, component styles, and responsive rules. This split is correct — the root CSS applies to the landing page (no sidebar), the app CSS applies to authenticated pages. No change needed, but the separation should be documented.

### Summary table

| Finding | File(s) | Action | Priority |
|---|---|---|---|
| Dead SPA + prototypes | `web/app.html`, `web/nextjs/`, `web/prototype_*.html` | Delete | High |
| Orphaned manifest | `www/manifest.json` | Delete | Low |
| Unused template assets | `frontend/public/{file,globe,next,vercel,window}.svg`, `chatgpt.png` | Delete | Low |
| Confusing prompt names | `prompts/translate_audio.py`, `prompts/translate_fields.py` | Rename | Medium |
| Confusing tool name | `tools/transcribe.py` | Rename to `whisper.py` | Medium |
| CLI script role unclear | `scripts/capture.py` | Add doc comment | Low |

---

## 14. User Journey — Screen by Screen

This section walks through every screen a user encounters, in the order they experience them. For each screen it describes what triggers the render, which data is fetched and how, what the key components do, and what user actions are available.

---

### 14.1 Landing Page (Unauthenticated Entry)

**File:** `frontend/app/page.tsx`

When a user first opens the app URL, Next.js serves `frontend/out/index.html` — a static page that requires no server-side data. On mount, the page calls `supabase.auth.getSession()`: if a valid session already exists in `localStorage` (returning user), it immediately redirects to `/home` via `router.replace`, bypassing the landing entirely. If no session is found, the landing page renders with a "Continue with Google" button. Clicking that button calls `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: origin + '/auth/callback' })`, which redirects the browser to Google's OAuth consent screen — at this point the app is no longer in control until Google returns to the callback URL.

**Layout:** Two-column card grid at ≥860px (hero card left, quote card right); single column on mobile. No sidebar, no top bar — this is outside the `(app)` route group.

**Key elements:**
- Hero card: tagline, three feature pills (Voice & audio, Recipes & memories, Private to your family), CTA button
- Quote card: serif inspirational quote
- No data fetch — fully static; only `getSession()` call on mount

---

### 14.2 Auth Callback

**File:** `frontend/app/auth/callback/page.tsx`

After Google completes OAuth consent, it redirects to `/auth/callback?code=...`. This page calls `supabase.auth.exchangeCodeForSession(code)`, which sends the authorization code to Supabase and receives back a JWT access token and refresh token. Supabase stores both in `localStorage` under its own keys. On success the page calls `router.replace('/home')`. On failure it renders an error message with a link back to the landing page. This page is the only place in the app where the auth session is created from scratch — all other pages only read it.

---

### 14.3 Home Screen

**File:** `frontend/app/(app)/home/page.tsx`

The Home screen is the first authenticated screen a user sees. On mount it fires two parallel API calls: `api.recipes.list()` (`GET /recipes`) and `api.people.list()` (`GET /people`). Both calls attach the Supabase JWT as a `Bearer` header; FastAPI verifies it and filters both queries by `user_id`. The page also calls `supabase.auth.getUser()` to extract the user's first name for the welcome greeting. Once data resolves, a `peopleMap` is computed (`narrator.toLowerCase() → photo_url`) so every memory row and card can show the narrator's photo without a separate fetch per item. Favorites state is read from `localStorage` via `readFavorites()` — not from the server — and a `favTick` integer counter is used as a React dependency to force `useMemo` to re-derive the favorites list after every toggle without requiring the full memories array to change.

**Layout:** Two-column grid at ≥860px (main content | 272px right panel); single column on mobile.

**Components and their roles:**

| Component | Role |
|---|---|
| `HeroCard` | Welcome message with user's first name, watercolor hero image (`/hero-home.png`), two action tiles linking to `/capture` and `/upload` |
| `ActionTile` | Individual CTA tile (icon + label + description); renders as a `<Link>` |
| `FavoritesScroll` | Horizontal scroll row of `FavoriteCard` items; sort toggle (Favorites-first or Recent-first); "View all ›" link; empty state with CTA |
| `FavoriteCard` | 180px card: dish image (or 🍽️ placeholder), dish name, narrator avatar, heart toggle button overlaid on image corner |
| `RecentMemoriesSection` | Vertical list of up to 4 `MemoryRow` items |
| `MemoryRow` | Single row: narrator avatar (photo or initial), dish name, narrator + date label, `WaveformBars`, pseudo-duration, heart toggle, play button (links to `/memory?token=...`) |
| `QuotePanel` | Right sidebar: serif quote card + tips panel with three icon+title+description tips |
| `WaveformBars` | Deterministic bar heights derived from `token` string hash — stable across re-renders, no animation state |

**State:**
```
memories[]      ← from api.recipes.list()
people[]        ← from api.people.list()
userName        ← from supabase.auth.getUser()
favTick         ← integer counter incremented on every favorite toggle
sortBy          ← 'favorites' | 'recent' (controls FavoritesScroll order)
loading/error   ← standard async state
```

---

### 14.4 All Memories (Recipes)

**File:** `frontend/app/(app)/memories/page.tsx`

The All Memories page presents the full recipe archive with filtering, sorting, and narrator-scoped views. On mount it fires two parallel requests — `api.recipes.list()` and `api.people.list()` — identical to the Home screen, but the full unsliced list is used here. The page reads two URL search params: `?q=` (search query from the top bar) and `?narrator=` (set when navigating from Our People by clicking a narrator's recipes count). The `displayed` array is derived via `useMemo` applying these filters in sequence: narrator param → search query → tag filter → sort order. All filtering is client-side over the already-fetched list — no additional API calls for filtering.

**Layout:** Hero banner full-width at top; two-column grid at ≥860px (recipe cards | right panel with CTA and why-it-matters); single column on mobile.

**Key interactions:**
- **Search:** Typing in `AppTopBar` and submitting navigates to `/memories?q=searchterm`; the page reads `q` from `useSearchParams()` and filters `dish_name` and `narrator` fields
- **Narrator filter:** Clicking a narrator's recipe count on Our People navigates to `/memories?narrator=Name`; pre-filters the grid to that narrator's memories
- **Tag filter:** "All", "Favorites", "Recently added" pill tabs filter the `displayed` list client-side
- **Favorite toggle:** Calls `toggleFavorite(token)` from `lib/favorites.ts`, increments `favTick`, re-derives `favTokens` via `useMemo`
- **Card click:** Links to `/memory?token=...`

**Components:**

| Component | Role |
|---|---|
| `HeroIllustration` | Watercolor banner (`/hero-memories.png`) with responsive height and `objectPosition` crop |
| `MemoryCard` | Grid card: dish image, dish name, narrator chip (photo + name + relationship pill), recorded date, heart toggle |
| `NarratorChip` | Small narrator badge used on cards — photo circle + name + relationship label |
| Filter pill bar | Inline — "All", "Favorites", "Recently added" buttons |
| Sort toggle | "Newest first" / "Oldest first" select |
| Right panel CTA | "Add a Recipe" banner linking to `/capture` |

---

### 14.5 Memory Detail

**File:** `frontend/app/(app)/memory/page.tsx`

The Memory Detail page is reached via `/memory?token=...`. On mount it reads `token` from `useSearchParams()` and calls `api.recipes.get(token)` (`GET /recipe/{token}`). The server fetches the recipe row from Supabase, replaces `audio_url` with a fresh 1-hour signed URL (generated server-side — the raw filename is never exposed to the client), and returns the full recipe JSON. The page maintains a `translated` state overlay: when a language is selected via `LanguageSwitcher`, the translated fields are stored in `translated` and `const display = translated ?? memory` transparently swaps the rendered content without re-fetching the original. Favorite state is read from `localStorage` on mount and toggled locally. User notes are editable inline and persisted via `api.recipes.patch(token, { user_notes })` (`PATCH /recipe/{token}`). The delete button calls `api.recipes.delete(token)` and on success redirects to `/memories`.

**Components:**

| Component | Role |
|---|---|
| `LanguageSwitcher` | EN/TE/HI/KN/ES/FR pill buttons; calls `api.recipes.translate(token, lang)`; caches per-language results in component state; passes translated fields up via `onTranslated` callback |
| `AudioPlayer` | HTML5 `<audio>` element with custom play/pause button, progress bar scrubber, elapsed/total time display; accepts the signed `audio_url` as `src` |
| Ingredients list | Rendered as bordered rows with item name left-aligned and quantity right-aligned |
| Steps list | Numbered list with accent-coloured circle step numbers |
| Cook notes | Italic callout block with left accent border — vague measurements displayed verbatim |
| Transcript accordion | `<details>` / `<summary>` — collapsed by default; shows `transcript_english` on expand |
| User notes textarea | Free-text annotation; saved via PATCH on "Save notes" button click |
| Heart button | Toggles `localStorage` favorite; `★` / `☆` visual state |
| Delete button | Two-step: browser `confirm()` dialog → `DELETE /recipe/{token}` → redirect |

---

### 14.6 Our People

**File:** `frontend/app/(app)/people/page.tsx`

Our People manages narrator profiles — the people whose voices are captured in the archive. On mount the page calls `api.people.list()` (`GET /people`) and `api.recipes.list()` (`GET /recipes`); from the recipes list it builds a `recipeCounts` map (`narrator.toLowerCase() → count`) so each narrator card shows a live recipe count without a separate aggregation endpoint. The page maintains a `modalPerson` state: `null` means no modal is open, a `Person` object means the edit modal is pre-filled with that person's data, and the empty `EMPTY` constant means the add modal is open. The modal is a single component that changes its title and submit handler depending on whether `modalPerson.id` exists. Photo upload accepts either a file (converted to base64 data URI client-side and sent as `photo_data` in the request body) or a pasted URL stored as `photo_url` directly.

**Layout:** Hero banner at top; two-column at ≥860px (narrator cards left | "Why it matters" panel right); single column on mobile.

**Key interactions:**
- **Card click** → `router.push('/memories?narrator=Name')` — navigates to All Memories pre-filtered to that narrator
- **Pencil icon** → opens edit modal with `e.stopPropagation()` to prevent navigation
- **Add narrator** → `api.people.create(body)` (`POST /people`) → optimistic local state update
- **Edit narrator** → `api.people.update(id, body)` (`PUT /people/{id}`) → updates local state
- **Delete narrator** → browser `confirm()` → `api.people.delete(id)` → removes from local state

**Components:**

| Component | Role |
|---|---|
| `PersonCard` | Horizontal card: 80px avatar circle (photo or emoji), name, relationship pill, bio truncated to 2 lines, live recipe count badge, pencil edit icon; full card is clickable for navigation |
| Hero banner | Watercolor illustration (`/hero-people.png`) with responsive crop |
| `WhyItMatters` | Right panel: three icon+title+description items + serif quote |
| Add/Edit modal | Overlay with name, relationship, emoji, photo (file or URL), bio, notes fields; submit calls create or update depending on presence of `id` |

---

### 14.7 Capture a Memory

**File:** `frontend/app/(app)/capture/page.tsx`

The Capture page uses the browser's `MediaRecorder` API to record audio directly in the browser. On page load, narrator options are fetched from `api.people.list()` to populate the narrator chip selector. When the user clicks Record, the page calls `navigator.mediaDevices.getUserMedia({ audio: true })` to request microphone permission, creates a `MediaRecorder` instance, and begins collecting audio chunks into a `useRef` array. An `AnalyserNode` drives a live `WaveformBars` visualiser by reading frequency data from the audio stream on each animation frame. When the user clicks Stop, the chunks are assembled into a `Blob`, the `MediaRecorder` is stopped, and the page transitions to `stage: 'processing'`. The audio `Blob` is wrapped in a `FormData` object with the selected narrator and POSTed to `POST /capture/process` — this runs pipeline Stages 1 and 2 (transcribe + translate + structure) but does not save to the database. The structured JSON returned is passed into `ReviewWizard`, which enters `stage: 'review'`.

**Stage machine:**
```
'idle' → (click Record) → 'recording' → (click Stop) → 'processing'
       → (API returns) → 'review' → (wizard completes) → back to 'idle'
       → (API error)   → 'error'
```

**Components:**

| Component | Role |
|---|---|
| `NarratorChip` | Selectable pill for each narrator; highlights selected narrator; "+" chip to add a new narrator |
| Record button | Large circular button; pulsing red ring animation during recording |
| `WaveformBars` | Live visualiser during recording — fed from `AnalyserNode` frequency data |
| `WaveformDecoration` | Static decorative waveform bars shown in idle state |
| `ReviewWizard` | 3-step review modal (see §14.9) |
| `TipsPanel` | Right sidebar: three tips for getting a good recording |

---

### 14.8 Upload Recording

**File:** `frontend/app/(app)/upload/page.tsx`

The Upload page accepts an existing audio file and runs it through the same pipeline as live capture. The user selects a narrator from chips, then either drags-and-drops a file onto the drop zone or clicks to open the file picker. Accepted formats are `.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`. On file selection the page immediately POSTs the file to `POST /capture/process` as a `FormData` upload — the same endpoint used by the Capture page — and enters the `processing` state while the pipeline runs. On response the structured JSON is passed directly to `ReviewWizard`. The upload and capture pages share the same downstream flow from `stage: 'processing'` onward, including the `ReviewWizard` and the final `POST /capture/save`.

**Components:**

| Component | Role |
|---|---|
| `NarratorChip` | Same narrator selector as Capture page |
| Drop zone | Drag-and-drop area with dashed border; also renders a file `<input>` triggered by click; shows file name after selection |
| `CassetteHero` | SVG cassette tape illustration with waveform bars on either side |
| `ReviewWizard` | Shared with Capture page — same 3-step review flow |
| `TipsPanel` | Right sidebar with audio quality tips (clear voice, good length, check before uploading) |

---

### 14.9 Review Wizard (shared)

**File:** `frontend/components/ReviewWizard.tsx`

The Review Wizard is the editorial moment between capture and permanent storage. It is rendered inside both the Capture and Upload pages when `stage === 'review'` and receives the raw structured JSON from `POST /capture/process`. The wizard has three steps controlled by a `step` integer. Step 1 shows the AI-generated dish name (editable), the DALL-E dish image, and confirms the narrator. Step 2 presents the full structured recipe: an ingredients table where rows can be added, removed, or edited inline; a steps list with the same inline editing; the `cook_notes` field; and any `review_flags` highlighted as amber callouts for the user's attention. Step 3 is a summary confirmation. On final confirm, the wizard calls `api.capture.save(reviewed)` (`POST /capture/save`), which runs pipeline Stage 3 — uploads the audio to Supabase Storage and inserts the recipe row. On success the wizard shows a "Preserved forever ✦" confirmation card with a link to the saved memory at `/memory?token=...`.

**State:**
```
step: 1 | 2 | 3
editedRecipe    ← local copy of the structured JSON; mutated by inline edits
saving          ← boolean while POST /capture/save is in flight
savedToken      ← set on success; triggers confirmation card render
```

---

### 14.10 Account

**File:** `frontend/app/(app)/account/page.tsx`

The Account page has a single function: permanent account deletion. It presents two sequential browser `confirm()` dialogs to prevent accidental deletion. On confirmation it calls `api.account.delete()` (`DELETE /account`), which triggers a server-side cascade: all `recipes` rows for the user are deleted (including audio files in Supabase Storage), all `people` rows are deleted, and the Supabase Auth user record is removed via the admin API. On success the page calls `supabase.auth.signOut()` to clear the local session from `localStorage`, then redirects to `/` (landing page). The privacy policy is accessible at `/privacy` — a static page that requires no data fetch and is served directly from the Next.js static export.
