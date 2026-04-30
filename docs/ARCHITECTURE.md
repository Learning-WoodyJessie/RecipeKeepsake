# RecipeKeepsake — Architecture Document

*Last updated: 2026-04-30 — Principal architect review*

---

## 1. Product Requirements Document (PRD)

### Problem

Family recipes narrated by grandmothers in Telugu are being lost. The narration style is informal, imprecise, and code-switched (Telugu + English) — "add oil until it smells right", "konjam salt", "grind it well". Traditional recipe apps strip this richness; OCR of handwritten cards misses the voice entirely.

### Goal

Capture grandma narrating a recipe on a phone, preserve the recording and the structured recipe together, make it browsable by the family.

### Users

| User | Interaction |
|---|---|
| Recipe recorder (Pavani) | Opens app on phone, taps record, reviews & saves |
| Family viewers | Browse saved recipes, read and listen |

### Core Requirements

1. **Voice-first capture** — browser records audio natively, no app install required
2. **Telugu + code-switching support** — Whisper `language="te"` transcribes correctly
3. **Two-step LLM pipeline** — translate *then* structure (never combined) to preserve vague measurements
4. **Vagueness is data** — "konjam", "a little", "until it smells right" must survive the pipeline verbatim
5. **Audio is the source of truth** — raw recording stored alongside every structured recipe
6. **Per-account isolation** — recipes tied to the recording account, not publicly listed
7. **Share links** — individual recipe accessible via `/recipe/{token}` without login
8. **DALL-E fallback image** — every recipe card has a visual, either uploaded or AI-generated

### Out of Scope

- Social sharing, likes, comments
- Automated notifications or sends
- Edit-in-place UI for ingredients (use review flow instead)
- Multi-language playback (translate feature planned, not built)
- Full-text search (Phase 2)

### Success Criteria

- Capture a 2-minute Telugu narration → structured recipe in Supabase in under 60 seconds
- Audio plays back in the recipe detail view
- Review flags surface any implied steps for human review
- New Google login sees zero recipes from other accounts

---

## 2. System Design

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                        │
│  web/app.html — single HTML file, vanilla JS                │
│  • Auth wall (Google OAuth via Supabase JS)                 │
│  • Home: recipe grid                                        │
│  • Capture: record audio → POST /capture                    │
│  • Recipe detail: tabs (Transcript/Ingredients/Steps/Notes/ │
│    Listen), floating hear-bar, share link                   │
│  • People: narrator list (localStorage)                     │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS (JSON + multipart)
┌───────────────────────▼─────────────────────────────────────┐
│                    FastAPI Server                           │
│  scripts/serve.py                                           │
│  • GET  /           → serves web/app.html                   │
│  • GET  /recipes    → list (auth required)                  │
│  • GET  /recipe/:t  → fetch by token (open, for share links)│
│  • POST /capture    → full pipeline (auth required)         │
│  • PATCH /recipe/:t → save user_notes (auth required)       │
│  • POST /generate-image → DALL-E on-demand                  │
│  Auth: HTTPBearer → validates JWT via Supabase /auth/v1/user│
└──────┬──────────────────────────────────┬────────────────────┘
       │                                  │
┌──────▼────────┐               ┌─────────▼──────────────────┐
│  OpenAI APIs  │               │      Supabase              │
│               │               │  • PostgreSQL (recipes)    │
│  Whisper      │               │  • Storage bucket (audio)  │
│  GPT-4o       │               │  • Auth (Google OAuth)     │
│  DALL-E 3     │               └────────────────────────────┘
└───────────────┘
```

### Directory Layout

```
RecipeKeepsake/
│
├── scripts/
│   ├── serve.py          ← FastAPI server + all HTTP endpoints
│   └── capture.py        ← Legacy CLI capture orchestrator (superseded by serve.py)
│
├── tools/
│   ├── transcribe.py     ← Whisper call — audio file → raw Telugu transcript
│   ├── storage.py        ← Supabase CRUD — insert, fetch, list, patch, signed URLs
│   └── config.py         ← _load_config() helper (shared by serve + capture)
│
├── prompts/
│   ├── llm.py            ← LLMProvider ABC + OpenAIProvider (lazy client)
│   ├── translate.py      ← Call A: Telugu → English (faithful, no normalization)
│   ├── structure.py      ← Call B: English text → recipe JSON schema
│   └── image.py          ← DALL-E 3 image generation
│
├── data/
│   ├── config.yaml       ← LLM model, Whisper model, Supabase table name
│   └── migrations/       ← SQL migration scripts (gitignored from Railway)
│
├── tests/                ← All mocked — zero live API calls
│   ├── test_transcribe.py
│   ├── test_translate.py
│   ├── test_structure.py
│   ├── test_storage.py
│   ├── test_capture.py
│   ├── test_image.py
│   └── test_llm.py
│
├── web/
│   └── app.html          ← Single-file SPA (~1800 lines)
│
├── docs/
│   ├── ARCHITECTURE.md   ← This file
│   ├── ROADMAP.md
│   ├── BUGS.md
│   └── plans/            ← Feature PRDs and implementation plans
│
└── .agent/
    ├── decisions.log     ← All architectural decisions with rationale
    └── gotchas.md        ← Known failure patterns
```

### Supabase Schema

```sql
CREATE TABLE recipes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token             text        UNIQUE DEFAULT substr(md5(random()::text), 1, 12),
  dish_name         text,
  narrator          text        DEFAULT 'Grandma',
  language          text        DEFAULT 'te',
  recorded_at       timestamptz DEFAULT now(),

  -- Raw capture
  audio_url         text,       -- storage filename (e.g. "abc123.webm"); signed at serve time
  transcript_raw    text,       -- Whisper output verbatim (Telugu + code-switching)
  transcript_english text,      -- Call A output (faithful English translation)

  -- Structured recipe (Call B output)
  ingredients       jsonb,      -- [{ "item": "string", "quantity": "string" }]
  steps             jsonb,      -- ["step 1", "step 2", ...]
  cook_notes        text,       -- vague instructions preserved verbatim
  review_flags      jsonb,      -- ["implied step: drain water"]

  -- Enrichment
  image_url         text,       -- DALL-E generated image URL
  tags              text[],

  -- User notes (post-capture edits)
  user_notes        text,

  -- Auth / ownership
  user_id           text,       -- Supabase Auth user UUID
  recorded_by_email text,
  recorded_by_name  text
);
```

---

## 3. End-to-End Flow

### Capture Flow (POST /capture)

```
User taps "Stop" in browser
        │
        ▼
Browser blobs audio → POST /capture (multipart, Bearer token)
        │
        ▼
┌── require_auth ──────────────────────────────────────┐
│   HTTPBearer extracts JWT from Authorization header  │
│   httpx GET {SUPABASE_URL}/auth/v1/user              │
│   200 → returns user dict {id, email, user_metadata} │
│   non-200 → 401 Unauthorized                         │
└──────────────────────────────────────────────────────┘
        │
        ▼
Save audio to tmp file (tempfile.NamedTemporaryFile)
        │
        ▼ tools/transcribe.py
transcribe_audio(tmp_path)
  OpenAI().audio.transcriptions.create(
    model="gpt-4o-transcribe",
    language="te"              ← explicit Telugu; auto-detect misidentifies as Hindi
  )
  → transcript_raw (Telugu + English code-switching verbatim)
        │
        ▼ prompts/translate.py  [Call A]
translate_to_english(transcript_raw, provider)
  System: "faithful translator, preserve konjam/a little/to taste verbatim"
  User:   transcript_raw
  → transcript_english (English, vague terms intact)
        │
        ▼ prompts/structure.py  [Call B]
structure_recipe(transcript_english, provider)
  System: "output JSON only, vague quantities → cook_notes"
  User:   transcript_english
  → { dish_name, ingredients, steps, cook_notes, review_flags }
        │
        ▼ prompts/image.py
generate_dish_image(dish_name)
  DALL-E 3 prompt: "close-up photo of {dish_name}, South Indian, natural lighting"
  → image_url (expires ~1hr — stored as-is; Phase 2 should copy to Storage)
        │
        ▼ tools/storage.py
upload_audio(tmp_path, uuid_filename)
  Supabase Storage bucket "audio" (private)
  Stores filename only — not a public URL
  → stored_path ("abc123.webm")
        │
        ▼ tools/storage.py
insert_recipe({ ...structured, audio_url: stored_path, user_id, ... })
  Supabase INSERT → recipes table
  → { id, token, dish_name, ... }
        │
        ▼
_sign_audio(stored_path, sb)
  storage.from("audio").create_signed_url(filename, 3600)
  → signed URL (valid 1 hour)
        │
        ▼
Return JSON to browser:
  { id, token, dish_name, ingredients, steps, cook_notes,
    review_flags, transcript_raw, transcript_english,
    image_url, audio_url (signed) }
```

### Browse Flow (GET /recipes)

```
Browser → GET /recipes (Bearer token)
        │
        ▼
require_auth → user dict with id
        │
        ▼
list_recipes(user_id)
  SELECT id, token, dish_name, narrator, recorded_at, image_url, audio_url
  FROM recipes WHERE user_id = ? ORDER BY recorded_at DESC
        │
        ▼
For each recipe with audio_url:
  _sign_audio() → replace stored filename with 1-hour signed URL
        │
        ▼
Return [{ token, dish_name, image_url, audio_url, ... }]
```

### Auth Flow (Google OAuth)

```
Browser loads app.html
        │
        ▼
initAuth() → supabase.auth.getSession()
        ├── session exists → onSignedIn(user) → show app
        └── no session   → showAuthWall()
                              │
                              ▼
                         "Sign in with Google" button
                              │
                              ▼
                         supabase.auth.signInWithOAuth({ provider: 'google' })
                              │
                              ▼
                         Google consent → redirect back to app
                              │
                              ▼
                         onAuthStateChange fires → onSignedIn(user)
```

---

## 4. Key Design Decisions

### D-001 — Two-step LLM pipeline (never combine)

**Decision:** Call A = translation only. Call B = structuring only.  
**Rejected:** Single combined "translate and structure" prompt.  
**Why:** Combined call causes GPT-4o to normalize vague measurements ("a little oil" → "1 tbsp oil"). The vagueness *is* the data — grandma's language is what makes this a keepsake, not a recipe app. Keeping them separate gives each call a single job and a system prompt that can enforce its constraint precisely.

### D-002 — Whisper `language="te"` (explicit Telugu)

**Decision:** `gpt-4o-transcribe` with `language="te"`.  
**Rejected:** `whisper-1` with auto-detect, or no language param.  
**Why:** `whisper-1` with `language="te"` returns 400 (unsupported). Without a language param, `whisper-1` auto-detects Telugu as Hindi, producing incorrect script. `gpt-4o-transcribe` correctly handles `language="te"` and produces Telugu script with natural code-switching intact.

### D-003 — Single-file SPA (web/app.html) instead of Next.js

**Decision:** Serve one static HTML file from FastAPI.  
**Rejected:** Next.js app in `web/nextjs/`, FastAPI as sidecar.  
**Why:** The `/capture` pipeline takes 20-50 seconds (Whisper + 2x LLM + DALL-E + Storage). Vercel Hobby has a 10-second function timeout — not viable. Railway runs a persistent Python process with no timeout limit. A single-file SPA served by FastAPI eliminates the Next.js build step, Vercel dependency, and CORS complexity. The skeleton Next.js app (`web/nextjs/`) has been removed.

### D-004 — Private Supabase storage bucket + server-side signed URLs

**Decision:** `audio` bucket is private. Server generates 1-hour signed URLs before returning recipes to client.  
**Rejected:** Public bucket with permanent public URLs.  
**Why:** Audio recordings contain family voice. Private bucket ensures URLs can't be enumerated or scraped. Signed URLs expire, limiting exposure. The server (service key) is the only party that can sign — client never sees the storage credentials.

### D-005 — Auth via Supabase Auth (Google OAuth), user_id stored on recipe row

**Decision:** JWT validated server-side via `require_auth` dependency. `user_id` written to recipe at capture time. `list_recipes` filters by `user_id`.  
**Rejected:** Supabase Row Level Security (RLS).  
**Why:** RLS requires passing the user JWT to the Supabase client; our backend uses the service key (which bypasses RLS). Filtering in Python code is explicit, testable, and equally secure for a single-server architecture.

### D-006 — `/recipe/{token}` is open (no auth required)

**Decision:** Share links work without login.  
**Why:** Sharing a recipe link to a family WhatsApp group should work for recipients who haven't signed up. The `token` itself is the authorization — a 12-character hex string is not guessable.

### D-007 — People/Narrators stored in localStorage (no DB table)

**Decision:** Narrator list stored in `localStorage('rk_people')`.  
**Rejected:** Supabase `people` table.  
**Why:** Narrators are a UI convenience — used when labeling a recording. They don't need to be shared across devices or queried server-side. localStorage avoids a schema migration and extra API call; it's the right tool when data has no relational dependencies.

### D-008 — DALL-E image URL stored directly (not copied to Storage)

**Decision:** `image_url` in DB is the DALL-E CDN URL.  
**Known limitation:** DALL-E URLs expire after ~1 hour.  
**Deferral:** Phase 2 should download and re-upload to Supabase Storage at capture time. Not worth the complexity in Phase 1 since the recipe detail page shows it immediately after capture, and revisiting old recipes with expired images is an acceptable trade-off for now.

---

## 5. Authentication Architecture

```
┌─────────────────┐     signInWithOAuth      ┌────────────────┐
│   Browser SPA   │ ──────────────────────▶  │  Google OAuth  │
│ (Supabase JS)   │ ◀──────────────────────  │                │
└────────┬────────┘     JWT + session         └────────────────┘
         │                                           ▲
         │ Authorization: Bearer <jwt>               │ token exchange
         ▼                                           │
┌────────────────────────────────────────────────────────────────┐
│                       FastAPI (serve.py)                       │
│                                                                │
│  require_auth dependency:                                      │
│    GET {SUPABASE_URL}/auth/v1/user                             │
│    Header: apikey: {SUPABASE_ANON_KEY}                         │
│    Header: Authorization: Bearer {client_jwt}                  │
│    200 → { id, email, user_metadata: { full_name } }           │
│    else → 401                                                  │
└──────────────────────────────┬─────────────────────────────────┘
                               │ service key (server-only)
                               ▼
                    ┌─────────────────────┐
                    │  Supabase Postgres  │
                    │  + Storage          │
                    └─────────────────────┘
```

**Token never stored server-side.** Each request re-validates via Supabase. No session store needed.

---

## 6. Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Railway / `.env` | Whisper + GPT-4o + DALL-E |
| `SUPABASE_URL` | Railway / `.env` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Railway / `.env` | Server-side DB + Storage (never sent to browser) |
| `SUPABASE_ANON_KEY` | Railway / `.env` | JWT validation call + hardcoded in `app.html` JS |
| `ALLOWED_ORIGINS` | Railway / `.env` | Comma-separated CORS origins |
| `PORT` | Railway (auto) | Server listen port (default 8080) |

**`SUPABASE_SERVICE_KEY` is server-only.** The browser uses `SUPABASE_ANON_KEY`.  
**`SUPABASE_ANON_KEY` is safe to expose** — it's a publishable key with RLS-enforced permissions.

---

## 7. Test Strategy

All tests are fully mocked — no live API calls, no network, no Supabase. Runs in 0.6s.

| Test file | What it covers | Mock strategy |
|---|---|---|
| `test_transcribe.py` | Whisper call, returns `.text` | `patch('tools.transcribe.OpenAI')` |
| `test_translate.py` | System prompt content, passes transcript verbatim | `MagicMock()` LLMProvider |
| `test_structure.py` | JSON parsing, markdown fence stripping, schema fields | `MagicMock()` LLMProvider |
| `test_storage.py` | CRUD operations, `list_recipes` filters by user_id | `patch('tools.storage.create_client')` |
| `test_capture.py` | Pipeline order, all fields stored | `patch` all tools + `OpenAIProvider` |
| `test_image.py` | DALL-E prompt format, returns URL | `patch('prompts.image.OpenAI')` |
| `test_llm.py` | `OpenAIProvider.generate()` shape | `patch('prompts.llm.OpenAI')` |

**Rule:** Every external call must be mocked. If a test touches the network, it's a bug.

---

## 8. Deployment

**Platform:** Railway (persistent Python process, no function timeout)  
**Builder:** Nixpacks (auto-detects Python, installs `requirements.txt`)  
**Start command:** `python -m scripts.serve`  
**Production URL:** `https://vibrant-spontaneity-production-9f92.up.railway.app`

Railway config (`railway.toml`):
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "python -m scripts.serve"
```

**Supabase URL Configuration** (required for Google OAuth redirect):
- Site URL: `https://vibrant-spontaneity-production-9f92.up.railway.app`
- Redirect URLs: same + `http://localhost:8080`

---

## 9. Known Debt & Limitations

See `docs/BUGS.md` for the full list. Key items:

| ID | Issue | Severity |
|---|---|---|
| D-001 | ~~`_load_config()` duplicated in `capture.py` and `serve.py`~~ | Fixed |
| — | DALL-E `image_url` expires after ~1hr; not copied to Storage | High |
| — | `translate` endpoint in `serve.py` is a stub (`POST /translate` not wired to any prompt) | Improvement |
| — | `scripts/capture.py` is superseded by `serve.py` pipeline but kept for CLI use | Nitpick |

---

## 10. What Comes Next (Roadmap)

**Phase 2 — Search + playback**
- Full-text search across `dish_name`, `ingredients`, `cook_notes`
- Tag-based filtering (by dish type, occasion, narrator)
- Download DALL-E images to Supabase Storage at capture time (fix expiry)

**Translation feature (planned, not built)**
- Translate recipe to any target language on-demand
- Conversation-turn detection: filter narration to narrator's turns only before structuring
- See `docs/plans/2026-04-30-translate-and-conversation-filter.md`
