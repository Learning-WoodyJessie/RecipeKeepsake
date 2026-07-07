# RecipeKeepsake — Architecture Document

*Last updated: 2026-07-07 — Gemini 2.5 Flash transcription; env vars; test strategy; auth flow*

---

## 1. Product Requirements Document (PRD)

### Problem

There is a moment most families recognise too late.

You are sitting across from someone who has lived eighty years — who knows how to cure a fever with three ingredients from the kitchen, who can sing the lullaby her mother sang to her, who carries the story of how your family came to this country. And you think: *I should record this. I should write it down. I will do it next time.*

And then you realise: these are not just stories. They are the most precious things your family will ever own — worth more than anything that can be photographed or typed or saved to a drive. They deserve to outlive all of us.

The knowledge families carry is not written anywhere. It lives in people — in the way a grandfather pauses before he explains something, in the exact words a grandmother uses when she says "add a little," in the language she switches into when she is trying to be precise. It is passed by voice, by presence, by sitting in a kitchen together. It does not survive in a notebook. It does not survive in a recipe app that asks for measurements in teaspoons.

We built tools that are wrong for this problem. Recipe apps want structured data — they strip out the voice and normalise the imprecision. Voice memos capture the audio but leave it unsearchable, unreadable, untranslatable for family members who don't speak the language. Handwritten cards preserve the words but lose the voice entirely. And none of these tools know what to do with a remedy, a proverb, a song, a story — they are built only for recipes.

The deeper problem is urgency. Every family has someone whose window is closing — not dramatically, just quietly. The next visit might be the last chance. The knowledge that feels like it will always be there is already starting to fade.

*Echoes of Home* exists for that moment — to make capturing a family elder's voice as simple as pressing record, and to preserve what they share in a form that the whole family can find, hear, and pass on.

---

### Goals

1. **Preserve family knowledge before it is lost** — the capture window is while the narrator is alive and willing to share. This is not a convenience app; it is a rescue operation with a closing window.
2. **Capture the authentic voice, not just the information** — imprecision, code-switching, and vague language are features, not errors. "Until it smells right" is as valuable as any measurement.
3. **Support every form of family memory, not just recipes** — recipe is the first memory type. Remedies, stories, songs, proverbs follow the same capture pattern. The platform must hold all of them.
4. **Make the archive accessible to the whole family** — searchable, playable, translatable, shareable across generations and geographies, in the languages the family actually speaks.

---

### Objectives

| Objective | Measure |
|---|---|
| Capture speed | Any narration up to 5 minutes → structured memory saved in under 60 seconds |
| Voice fidelity | Informal language — "a little", "to taste", "until it smells right" — is captured exactly as spoken, never converted into measurements |
| Audio permanence | Every saved memory has a playable audio recording — the narrator's actual voice, always accessible |
| Account isolation | A new login sees zero memories from other accounts |
| Data safety | All personal data fully deletable — recordings, transcripts, narrator profiles, account |
| Review coverage | Potential gaps or implied details are flagged for the Keeper to review before a memory is saved |
| Language support | Any memory translatable to at least 6 languages on demand |

---

### Expected Outcomes

- A family member anywhere in the world can access their grandfather's home remedy, hear him explaining it in his own language, and read it translated into theirs
- The archive grows over family visits — each session captures 3–5 memories across any type
- Future generations have the original voice, not just a typed summary
- The app feels like a family heirloom, not a productivity tool

---

### Personas

Four personas interact with the system. Two are active today; two are planned for Phase 4 and Phase 5.

---

#### Persona 1 — The Narrator *(active)*

> *"I don't know the exact amounts — I just know how it should look."*

**Who:** Any family elder whose knowledge is being preserved. Could be a grandmother sharing a recipe, a grandfather recounting a story, an aunt explaining a home remedy, a parent singing a lullaby they want preserved. Any age, any language, any memory type.

**Relationship to the app:** Passive participant. Never touches the app. Their only interaction is speaking naturally while the Keeper holds a phone nearby.

**What they need:**
- The session to feel like a conversation, not a recording
- To speak in their own language and rhythm without correction or interruption
- Their imprecise language to be respected — not cleaned up into formal structured text
- To trust their words will be preserved as said

**What breaks their experience:**
- Being asked to repeat themselves because of a technical failure
- Seeing their words sanitised ("konjam uppu" → "½ tsp salt")
- The moment feeling clinical or transactional

---

#### Persona 2 — The Keeper *(active)*

> *"I want to capture everything before it's too late."*

**Who:** The family member who takes responsibility for building the archive. Tech-comfortable. Visits family elders periodically — those visits are the recording window. May capture memories of multiple narrators across multiple visits.

**Relationship to the app:** Primary user. Signs in, manages narrator profiles, records, reviews, organises, and eventually shares the archive.

**What they need:**
- Fast capture flow — visits are short; friction costs recording time
- Confidence the pipeline worked — feedback during processing, review step before save
- Ability to correct the LLM output before committing — the review wizard is their editorial moment
- A browsable archive they can return to and share with family
- Trust that the data is private — voice recordings of elderly relatives are sensitive

**What breaks their experience:**
- Pipeline failure mid-session with no recovery path
- Fabricated content in the structured output (bug D-002 — Whisper hallucination)
- Not being able to find a memory they know they captured
- Any personal data accessible without authentication

---

#### Persona 3 — The Self-Narrator *(active — edge case)*

> *"I want to record myself making the dish she taught me."*

**Who:** The Keeper themselves, narrating their own memory — a recipe they learned from a family elder, a story they want to preserve from their own perspective, a remedy they grew up with.

**Relationship to the app:** Same as Keeper, but they appear in both roles simultaneously. They are the account holder and the person being captured.

**What they need:**
- Same capture flow as any other recording — no special mode needed
- The ability to select themselves as the narrator (their own profile in People, or no narrator selected)
- The output to reflect their voice, not the elder's — they are the source

---

#### Persona 4 — The Family Viewer *(Phase 5 — not yet built)*

> *"I want to hear Thatha's story but I live in a different country."*

**Who:** Any family member who did not participate in capturing memories but wants access to the archive. Geographically dispersed. May not speak the recording language. Has not been present for any sessions.

**Relationship to the app:** Read-only consumer. Accesses the archive via invite from the Keeper. Cannot capture, cannot delete.

**What they need:**
- Browse and search the archive without understanding how it was built
- Listen to the original audio even without speaking the language
- Read any memory translated into their own language
- Trust that this is a private family space, not a public platform

**What breaks their experience:**
- Needing the Keeper present to access anything
- Translated text that loses the authentic voice ("a little" → "½ tsp")
- Any sense that family recordings could be seen by outsiders

---

#### Persona 5 — The Contributor *(Phase 5 — not yet built)*

> *"I also have things to add. This archive should belong to all of us."*

**Who:** A family member who is not just a passive viewer but an active participant in building the archive. A sibling who was also present for recordings. A cousin who has their own memories to contribute. A child who wants to add context, correct something, or organise what has been captured.

**Relationship to the app:** Active collaborator. Invited by the Keeper. Can contribute new memories, curate existing ones, and organise the archive — but cannot delete the Keeper's account or revoke other members' access.

**Three capabilities, each with different scope:**

| Capability | What it means | Status |
|---|---|---|
| **Capture** | Can record new memories and add them to the shared family archive — own narrator selections, own recordings | Phase 5 |
| **Curate** | Can edit structured fields (ingredients, steps, notes) on existing memories to correct or enrich them post-save | Phase 5 |
| **Organise** | Can add tags, create collections, mark favourites — changes visible to all archive members | Phase 5 |

**What they need:**
- Invite-based access — they should not be able to join without the Keeper's explicit permission
- Clear attribution — when they add or edit a memory, it is clear who made the change
- Scoped permissions — they can contribute and organise, but cannot delete the Keeper's memories or manage account-level settings
- The same capture quality as the Keeper — same pipeline, same review wizard

**What breaks their experience:**
- Not being able to add their own memories to the shared archive — feeling like a passive recipient rather than a co-owner of family history
- Edits they make overwriting the original without a way to see what changed
- Uncertainty about what they are and are not allowed to do

---

### User Journeys

#### Journey 1 — Narrator: Being Captured

The Narrator has no app interaction. The Keeper's job is to make this feel like a normal conversation.

```
Keeper visits → asks elder to share a memory (recipe, remedy, story, song)
      │
      ▼
Keeper opens app → selects the narrator's profile (already set up)
      │
      ▼
Keeper selects memory type → taps Record → phone sits naturally between them
      │
      ▼
Narrator speaks in their own language and rhythm
Keeper asks natural follow-up questions mid-conversation
("how long?" / "what kind of oil?" / "when did you learn this?")
      │
      ▼
Keeper taps Stop → shows narrator the title + image on screen
      │
      ▼
[Optional] Keeper reads back key details → narrator confirms or corrects
      │
      ▼
Memory saved — narrator's voice permanently preserved
```

**Critical experience requirement:** The optional review step at the end is the narrator's only quality gate. They should be able to correct anything before it is saved, without touching the app.

---

#### Journey 2 — Keeper: First Use (Onboarding)

```
Open app → landing page (unauthenticated)
      │
      ▼
"Sign in with Google" → OAuth → JWT issued
      │
      ▼
First-login welcome modal → add first narrator profile
(name, relationship, emoji, optional photo)
      │
      ▼
Profile saved to Supabase → home screen loads, ready to capture
```

---

#### Journey 3 — Keeper: Capture a Memory

```
Home screen → "Capture a Memory"
      │
      ▼
Select narrator from people chips
Select memory type (Recipe / Remedy / Story / Song / Wisdom)
      │
      ▼
Tap Record → waveform visualiser confirms audio is live
Narrator speaks → Keeper taps Stop
      │
      ▼
Processing spinner → pipeline runs:
  Whisper → raw transcript
  Call A  → faithful translation
  Call B  → structured artifact (schema varies by memory type)
  DALL-E  → visual
  Storage → audio saved
      │
      ▼
Review wizard
  Step 1: confirm title / dish name
  Step 2: edit structured fields (add / remove / correct)
  Step 3: confirm and save
      │
      ▼
Memory saved → confirmation shown (title, field count, narrator name)
Memory appears on home screen and All Memories list
```

---

#### Journey 4 — Keeper: Browse and Relive

```
Home screen → recent memories list or favorites row
      │
      ▼
Tap a memory card → memory detail view
      │
      ├── Structured content tab  (ingredients+steps for recipe; ailment+preparation for remedy; etc.)
      ├── Notes tab               (verbatim vague language + LLM review flags + personal annotation)
      ├── Transcript tab          (raw original language + English translation, collapsible)
      └── Listen tab              (audio player — the narrator's actual voice)
      │
      ▼
Language switcher → translate all content to EN / TE / HI / KN / ES / FR
      │
      ▼
Share → copy link → family member opens in browser (auth required)
```

---

#### Journey 5 — Keeper: Manage People (Narrators)

```
Sidebar → "Our People"
      │
      ▼
Grid of narrator cards (photo, name, relationship, bio, memory count)
      │
      ├── Add    → modal: name, relationship, emoji, photo, bio, notes → save to Supabase
      ├── Edit   → same modal pre-filled
      └── Delete → confirmation → hard delete (past memories retain narrator name string)
```

---

#### Journey 6 — Family Viewer: Access the Archive *(Phase 5)*

```
Keeper generates invite → sends via WhatsApp / email
      │
      ▼
Family member opens link → prompted to sign in with Google
      │
      ▼
After sign-in → read-only view of shared memories
      │
      ▼
Browse → tap any memory → listen, read, translate
Cannot capture, edit, or delete — view only
```

---

#### Journey 7 — Contributor: Collaborate on the Archive *(Phase 5)*

**7a — Joining as a Contributor**
```
Keeper invites family member with Contributor role → link sent
      │
      ▼
Contributor signs in with Google → granted write access to shared archive
      │
      ▼
Home screen shows shared archive alongside any memories they own
```

**7b — Capturing a new memory**
```
Contributor opens app → "Capture a Memory"
      │
      ▼
Same capture flow as Keeper — narrator chips, memory type, record, review, save
      │
      ▼
New memory added to shared archive, attributed to Contributor
Keeper can see it; Contributor owns it within the shared space
```

**7c — Curating an existing memory**
```
Contributor opens a saved memory → sees "Suggest edit" or "Edit" (permission-dependent)
      │
      ▼
Edits structured fields: correct an ingredient, add a missing step,
enrich cook_notes with something they remember
      │
      ▼
Change saved with attribution — original pipeline output preserved,
edit layered on top (audit trail, not overwrite)
```

**7d — Organising the archive**
```
Contributor adds tags to memories ("Diwali", "Ammamma", "Remedies")
Creates a collection ("Wedding recipes", "Stories from Vizag")
Marks favourites — visible to all archive members
```

---

### Core Requirements

1. **Voice-first capture** — browser records audio natively across all memory types
2. **Multilingual support** — explicit language setting on Whisper; code-switching handled
3. **Two-step LLM pipeline** — translate then structure, never combined (preserves vague language)
4. **Vagueness is data** — informal, imprecise language ("a little", "to taste", "until it smells right") is captured exactly as spoken, never converted into measurements
5. **Audio is the source of truth** — raw recording stored permanently alongside every structured memory
6. **Memory type extensibility** — recipe is one journey; pipeline supports any structured memory type via Call B
7. **Narrator profiles** — named family members with photos and bios, stored in Supabase, not localStorage
8. **Review before save** — Keeper can edit all structured output before committing
9. **Per-account isolation** — memories accessible only to the account holder (and future invited family)
10. **Security by default** — auth on every endpoint; voice recordings never accessible anonymously (see Section 12)

---

### Out of Scope

- Social sharing, likes, comments — private family archive only
- Automated notifications or sends — pull-based, no delivery layer
- Post-save editing of structured fields — the wizard review flow is the editorial moment
- Multi-language app UI — app shell is English; content translation is supported
- Full-text search — Phase 6

---

### Success Criteria

- A family elder narrates something and it is saved as a permanent memory within a minute — fast enough to do during a normal visit
- The way they said it is preserved exactly — "a little oil", "until it smells right" — not cleaned up into something they never said
- Anyone in the family can press play and hear the narrator's actual voice
- Before saving, the Keeper can review everything the app captured and correct anything that isn't right
- Every person's memories are completely private — signing in for the first time shows a clean slate, never someone else's archive
- A family member can read any memory in their own language, no matter what language it was recorded in
- If someone wants their data removed, everything — recordings, transcripts, profiles — can be fully and permanently deleted

---

## 2. System Design

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│              Browser — Next.js static export                 │
│  frontend/out/ — served by FastAPI from Railway             │
│  • Landing (Google Sign-In) + /auth/callback OAuth handler  │
│  • Home, Memories, Memory detail, People, Capture, Upload   │
│  • AuthGuard + Sidebar + AppTopBar shell                    │
│  • ReviewWizard — 3-step post-capture review before save    │
│  • LanguageSwitcher — EN/TE/HI/KN/ES/FR on-demand          │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS (JSON + multipart)
┌───────────────────────▼─────────────────────────────────────┐
│                    FastAPI Server                           │
│  scripts/serve.py                                           │
│  • POST /capture/process → Stages 1–2: transcribe+structure │
│  • POST /capture/save   → Stage 3: persist to Supabase      │
│  • GET  /recipes        → list (auth required)              │
│  • GET  /recipe/{token} → fetch (auth required)             │
│  • GET  /recipe/{token}/translate → multi-language          │
│  • POST /generate-image → DALL-E on-demand                  │
│  • GET/POST/PUT/DELETE /people → narrator CRUD              │
│  Auth: PyJWT local verify → fallback Supabase network call  │
└──────┬────────────────────────┬──────────────────────────────┘
       │                        │                    │
┌──────▼───────┐   ┌────────────▼────┐  ┌───────────▼─────────┐
│  OpenAI APIs  │   │  Google AI API  │  │      Supabase       │
│  GPT-4o (×2) │   │  Gemini 2.5     │  │  • PostgreSQL       │
│  DALL-E 3    │   │  Flash (audio   │  │  • Storage (audio,  │
│  Moderation  │   │  transcription) │  │    images buckets)  │
└──────────────┘   └─────────────────┘  │  • Auth (Google     │
                                        │    OAuth / JWT)     │
                                        └─────────────────────┘
```

### Directory Layout

```
RecipeKeepsake/
│
├── scripts/
│   ├── serve.py          ← FastAPI server + all HTTP endpoints + static file serving
│   └── capture.py        ← CLI pipeline orchestrator (local dev only)
│
├── pipeline/             ← 3-stage typed pipeline (pure functions, no HTTP)
│   ├── models.py         ← TranscriptResult, RecipeData, SavedRecipe dataclasses
│   ├── transcribe.py     ← Stage 1: audio_path → TranscriptResult
│   ├── transform.py      ← Stage 2: TranscriptResult → RecipeData
│   └── persist.py        ← Stage 3: RecipeData + audio → SavedRecipe (Supabase)
│
├── tools/
│   ├── transcribe.py     ← Gemini 2.5 Flash call — audio file → Telugu transcript
│   ├── glossary.py       ← Glossary loader + build_glossary_terms_list() for Gemini
│   ├── storage.py        ← Supabase CRUD — insert, fetch, list, patch, signed URLs
│   └── config.py         ← load_config() helper
│
├── prompts/
│   ├── llm.py            ← LLMProvider ABC + OpenAIProvider (lazy client)
│   ├── translate_audio.py← Call A: raw transcript → faithful English
│   ├── structure.py      ← Call B: English → structured recipe JSON
│   ├── translate_fields.py ← Multi-language field translation (EN/TE/HI/KN/ES/FR)
│   └── image.py          ← DALL-E 3 enriched prompt builder
│
├── data/
│   ├── config.yaml              ← LLM + transcription model config
│   ├── telugu_cooking_terms.yaml ← Cooking glossary (injected into Gemini prompt)
│   └── migrations/              ← SQL migration scripts
│
├── frontend/             ← Next.js 16 static export (served by FastAPI from Railway)
│   ├── app/              ← Pages: landing, auth/callback, (app)/* authenticated routes
│   ├── components/       ← Shared: ReviewWizard, AudioPlayer, Sidebar, AuthGuard …
│   └── lib/              ← api.ts, supabase.ts, favorites.ts
│
├── tests/                ← 137+ tests, all mocked — zero live API calls
│
├── docs/
│   ├── ARCHITECTURE.md   ← This file
│   ├── SYSTEM_DESIGN.md  ← Full technical reference (stack, components, flows)
│   ├── ROADMAP.md
│   ├── BUGS.md
│   └── plans/            ← Feature PRDs and implementation plans
│
└── .agent/
    ├── decisions.log     ← All architectural decisions with rationale
    └── gotchas.md        ← Known failure patterns
```

### Supabase Schema

See **Section 11 — Data Models** for the full schema, entity relationships, and known gaps.

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
┌── require_auth ──────────────────────────────────────────┐
│   HTTPBearer extracts JWT from Authorization header      │
│   1. PyJWT local verify (SUPABASE_JWT_SECRET, ~0ms)      │
│   2. Fallback: GET {SUPABASE_URL}/auth/v1/user (~75ms)   │
│   200 → { id/sub, email, user_metadata }                 │
│   fail → 401 Unauthorized                               │
└──────────────────────────────────────────────────────────┘
        │
        ▼
Save audio to tmp file (tempfile.NamedTemporaryFile)
        │
        ▼ tools/transcribe.py
transcribe_audio(tmp_path)
  genai.Client(GEMINI_API_KEY).files.upload(tmp_path)
  → generate_content(model="gemini-2.5-flash", contents=[dialect_prompt, audio_file])
  dialect_prompt: Telangana/Andhra/Rayalaseema/Hyderabadi rules
                  + glossary with romanized variants (build_glossary_terms_list())
  → _strip_hallucination_loops() post-processing
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

### D-002 — Telugu transcription: explicit language, not auto-detect *(superseded by D-009)*

**Original decision:** `gpt-4o-transcribe` with `language="te"`.  
**Rationale at the time:** `whisper-1` rejects `language="te"` (400 error) and auto-detects Telugu as Hindi without it. Explicit Telugu was required.  
**Superseded by D-009:** gpt-4o-transcribe was replaced by Gemini 2.5 Flash, which receives the target language + dialect rules in a natural language prompt rather than a parameter. The core principle — explicit Telugu targeting, not auto-detect — is preserved in the Gemini prompt.

### D-003 — Frontend: Next.js static export served by FastAPI *(revised Phase 1.7)*

**Current decision:** Next.js 16 static export (`output: 'export'`) in `frontend/`. Build output in `frontend/out/` served by FastAPI as static files. No second service needed at runtime.  
**Original decision (Phase 1):** Single-file `web/app.html` vanilla JS SPA, served by FastAPI.  
**Why originally:** Rapid prototyping; no build step; single file is trivially deployable.  
**Why revised:** `web/app.html` grew to ~4,900 lines with no component boundaries, no type checking, and no test coverage. Phase 1.7 migrated to Next.js for maintainability. Deployment constraint remains unchanged: Railway runs the FastAPI process; Next.js is built to a static export at deploy time, requiring no Node.js runtime. The Vercel timeout concern (10s limit) that ruled out SSR still applies — `output: 'export'` means no server rendering, no timeout problem.

### D-004 — Private Supabase storage bucket + server-side signed URLs

**Decision:** `audio` bucket is private. Server generates 1-hour signed URLs before returning recipes to client.  
**Rejected:** Public bucket with permanent public URLs.  
**Why:** Audio recordings contain family voice. Private bucket ensures URLs can't be enumerated or scraped. Signed URLs expire, limiting exposure. The server (service key) is the only party that can sign — client never sees the storage credentials.

### D-005 — Auth via Supabase Auth (Google OAuth), user_id stored on recipe row

**Decision:** JWT validated server-side via `require_auth` dependency. `user_id` written to recipe at capture time. `list_recipes` filters by `user_id`.  
**Rejected:** Supabase Row Level Security (RLS).  
**Why:** RLS requires passing the user JWT to the Supabase client; our backend uses the service key (which bypasses RLS). Filtering in Python code is explicit, testable, and equally secure for a single-server architecture.

### D-006 — `/recipe/{token}` requires authentication *(revised in Phase 1.5)*

**Decision:** `GET /recipe/{token}` requires a valid JWT (`Depends(require_auth)`).  
**Original decision (Phase 1):** The endpoint was open — token alone was the authorization, enabling unauthenticated share links.  
**Why revised:** Security hardening in Phase 1.5 established the principle that no content is accessible without login. Family voice recordings must never be reachable without authentication. Share links still use the token as a route key, but the recipient must sign in to view the memory.

### D-007 — People/Narrators stored in Supabase, not localStorage *(revised in Phase 1.5)*

**Decision:** Narrator profiles stored in the `people` table (Supabase Postgres). Full CRUD via `/people` API endpoints.  
**Original decision (Phase 1):** Narrator list stored in `localStorage('rk_people')`.  
**Why revised:** Narrator profiles include photos, bios, and personal notes about family members — sensitive personal data. localStorage is unencrypted, device-local, and cleared by cache wipe. Moving to Supabase gave encryption at rest, cross-device access, and correct cascade on account deletion. The original decision was right for a UI convenience label; it became wrong the moment profiles gained real personal content.

### D-008 — DALL-E image downloaded and stored in Supabase at capture time *(revised Phase 1.5)*

**Decision:** At capture time, `store_image()` downloads the ephemeral DALL-E CDN URL via httpx and re-uploads to the Supabase `images` bucket (public). `image_url` in DB is the permanent Supabase URL.  
**Original decision (Phase 1):** `image_url` stored the raw DALL-E CDN URL directly.  
**Why revised:** DALL-E CDN URLs expire after ~1 hour. Memory cards on the home and grid screens would show broken images for any recipe older than an hour. Downloading at capture time is a one-time cost that keeps images permanently accessible.

### D-009 — Gemini 2.5 Flash for transcription instead of gpt-4o-transcribe *(Phase 2)*

**Decision:** `tools/transcribe.py` uses `google-genai` with `gemini-2.5-flash`. Audio is uploaded via the Gemini File API and sent multimodally alongside a detailed dialect-aware prompt.  
**Rejected:** Continuing with `gpt-4o-transcribe`.  
**Why:** Real narration audio (Ambali, biyyam dosa) revealed two failure modes with gpt-4o-transcribe: (1) hallucination loops — "పిండీ కలపాలు" repeated 300+ times into silence, producing transcripts 100× the correct length; (2) dialect vocabulary failures — "తైదా పిండి" (ragi flour, Telangana dialect) transcribed as "పలపిండి", "సైద పిండి" etc., with fabricated ingredients appearing in the structured output as a downstream consequence. Gemini 2.5 Flash has substantially more South Asian language training data, and crucially accepts a multimodal text prompt expressing dialect-specific rules — something gpt-4o-transcribe's `initial_prompt` parameter cannot express. The `_strip_hallucination_loops()` safety net is retained as a defensive post-processor.

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
| `OPENAI_API_KEY` | Railway / `.env` | GPT-4o (Call A translation + Call B structuring) + DALL-E 3 + Moderation API |
| `GEMINI_API_KEY` | Railway / `.env` | Gemini 2.5 Flash — dialect-aware Telugu audio transcription (replaced gpt-4o-transcribe) |
| `SUPABASE_URL` | Railway / `.env` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Railway / `.env` | Server-side DB + Storage (never sent to browser) |
| `SUPABASE_ANON_KEY` | Railway / `.env` | JWT validation fallback + browser Supabase JS SDK |
| `SUPABASE_JWT_SECRET` | Railway / `.env` | JWT signing secret for local PyJWT verification (no network on hot path) |
| `ALLOWED_ORIGINS` | Railway / `.env` | Comma-separated CORS origins |
| `PORT` | Railway (auto) | Server listen port (default 8080) |
| `MAX_CAPTURE_PER_DAY` | Railway / `.env` | Daily capture limit per user (default: 10) |
| `MAX_TRANSLATE_PER_DAY` | Railway / `.env` | Daily translate limit per user (default: 50) |
| `MAX_IMAGE_PER_DAY` | Railway / `.env` | Daily image generation limit per user (default: 20) |

**`SUPABASE_SERVICE_KEY` is server-only.** The browser uses `SUPABASE_ANON_KEY`.  
**`SUPABASE_ANON_KEY` is safe to expose** — it's a publishable key with RLS-enforced permissions.  
**`GEMINI_API_KEY` is server-only** — the Gemini API call happens in `tools/transcribe.py` on the FastAPI server; it is never sent to the browser.

---

## 7. Test Strategy

All tests are fully mocked — no live API calls, no network, no Supabase. Runs in 0.6s.

| Test file | What it covers | Mock strategy |
|---|---|---|
| `test_transcribe.py` | Gemini call, hallucination loop detection, n-gram dedup | `patch('tools.transcribe.genai.Client')` + `monkeypatch.setenv("GEMINI_API_KEY")` |
| `test_translate.py` | System prompt content, passes transcript verbatim | `MagicMock()` LLMProvider |
| `test_structure.py` | JSON parsing, markdown fence stripping, schema fields | `MagicMock()` LLMProvider |
| `test_storage.py` | CRUD operations, `list_recipes` filters by user_id | `patch('tools.storage.create_client')` |
| `test_pipeline_stages.py` | Pipeline stage typing, TranscriptResult/RecipeData contract | `patch('tools.transcribe.genai.Client')` + `patch('pipeline.transcribe.translate_to_english')` |
| `test_pipeline_timing.py` | Stage duration logging (event=transcribe_done etc.) | same Gemini mock pattern |
| `test_image.py` | DALL-E enriched prompt, vessel/region/garnish/texture extraction | `patch('prompts.image.OpenAI')` |
| `test_llm.py` | `OpenAIProvider.generate()` shape | `patch('prompts.llm.OpenAI')` |

**Rule:** Every external call must be mocked. If a test touches the network, it's a bug.

**Gemini mock pattern** (used across all transcribe-touching tests):
```python
def _make_gemini_mock(transcript_text: str):
    mock_response = MagicMock()
    mock_response.text = transcript_text
    mock_client = MagicMock()
    mock_client.files.upload.return_value = MagicMock()
    mock_client.models.generate_content.return_value = mock_response
    return mock_client

@pytest.fixture(autouse=True)
def _set_gemini_key(self, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
```
The env var fixture is required because `os.environ["GEMINI_API_KEY"]` is evaluated before the `genai.Client` mock intercepts the call.

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

---

## 11. Data Models

Three entities in the system. Two have Supabase tables; one does not yet.

### Entity Relationship

```
auth.users  (Supabase Auth — managed, not a Postgres table we own)
    │ 1:1 (planned — no profiles table yet)
    ▼
profiles              ← app identity: display name, avatar, preferences
    │ 1:many
    ▼
people                ← narrators owned by this account holder
    │ 1:many  (via narrator_id FK — planned; currently a string)
    ▼
recipes / memories    ← memories owned by this account holder, narrated by a person
```

---

### Table: `recipes` (current — Phase 4 will rename/extend to `memories`)

```sql
CREATE TABLE recipes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token               text        UNIQUE DEFAULT substr(md5(random()::text), 1, 12),
  user_id             text,                    -- Supabase Auth UUID (account holder)

  -- Narrator (denormalized string — no FK to people.id yet; see Known Gaps)
  narrator            text        DEFAULT 'Grandma',

  -- Memory metadata
  dish_name           text,
  language            text        DEFAULT 'te',
  recorded_at         timestamptz DEFAULT now(),
  tags                text[],

  -- Raw capture (source of truth)
  audio_url           text,                    -- storage filename; signed at serve time
  transcript_raw      text,                    -- Whisper verbatim (Telugu + code-switching)
  transcript_english  text,                    -- Call A output (faithful English translation)

  -- Structured artifact (Call B output)
  ingredients         jsonb,                   -- [{ "item": str, "quantity": str }]
  steps               jsonb,                   -- ["step 1", "step 2", ...]
  cook_notes          text,                    -- vague instructions verbatim (never normalised)
  review_flags        jsonb,                   -- ["implied step: drain water before grinding"]

  -- Enrichment
  image_url           text,                    -- DALL-E CDN URL (expires ~1hr — known gap)
  translations        jsonb,                   -- { "hi": { dish_name, ingredients, ... }, ... }

  -- Post-capture edits
  user_notes          text,

  -- Recorder identity (denormalized from auth at capture time)
  recorded_by_email   text,
  recorded_by_name    text
);
```

**Known gaps on this table:**
- `narrator` is a plain string, not a FK to `people.id` — renames don't propagate; see Known Gaps below
- `image_url` expires ~1hr (DALL-E CDN) — should be downloaded and re-stored in Supabase Storage at capture time
- `recorded_by_name` / `recorded_by_email` are denormalized — stale if user changes their Google name

---

### Table: `people` (narrators)

```sql
CREATE TABLE people (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text,                    -- account holder who created this narrator profile
  name          text        NOT NULL,
  relationship  text,                    -- "Ammamma", "Nani", "Thatha", "Grandma"
  emoji         text,                    -- display emoji for the narrator chip
  photo_data    text,                    -- base64-encoded photo (known gap — should be Storage URL)
  bio           text,
  notes         text,
  created_at    timestamptz DEFAULT now()
);
```

**Known gaps on this table:**
- `photo_data` stores base64 directly in Postgres — bloats the row and breaks down at scale. Should upload to Supabase Storage `avatars` bucket and store a URL, matching how audio and images are handled.
- No FK from `recipes.narrator` to `people.id` — see Known Gaps below.

---

### Table: `profiles` (account holder) — ❌ not yet built

The account holder has no row in the database. Their identity is derived entirely from the Supabase Auth JWT on every request:

```python
user.get("email")                                    # from JWT
user.get("user_metadata", {}).get("full_name", "")   # from Google OAuth
```

**Why it doesn't exist yet:** the system is a single-user personal archive. Google Auth provides email, name, and avatar for free. No current feature requires an app-specific user profile — the topbar avatar, welcome modal, and `recorded_by_name` on recipes all work off the JWT today.

**When to build it:** Phase 5 (family sharing). The moment a second person can access your memories, each user becomes a relational entity — they need a joinable row, not just an auth principal.

**Planned schema:**

```sql
CREATE TABLE profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        UNIQUE,              -- 1:1 with auth.users
  display_name  text,                            -- app-specific name (can differ from Google)
  avatar_url    text,                            -- Supabase Storage URL
  bio           text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

---

### Known Gaps: Entity Relationships

**Gap 1 — `recipes.narrator` is a string, not a FK**

Current state:
```sql
narrator   text   -- e.g. "Ammamma" — copied at capture time
```

Problem: renaming a person in the People screen does not update past recipes. Queries like "all recipes narrated by Ammamma" require fragile string matching.

Target state:
```sql
narrator_id   uuid   REFERENCES people(id) ON DELETE SET NULL,
narrator      text   -- retained as a display-name cache for read speed
```

**Gap 2 — `people.photo_data` is base64 in Postgres**

Current state: photo stored as a base64 string on the row.

Target state: upload to Supabase Storage `avatars` bucket, store the public URL — same pattern as `audio_url` and `image_url`.

**Gap 3 — no `profiles` table**

Described above. Deferred until Phase 5.

---

## 12. Security

Family voice recordings, narrator photos, and personal transcripts are sensitive personal data. Security is a core requirement, not a hardening pass.

### Principle: private by default

Every endpoint requires a valid JWT. Public access is the exception, not the default. The only two routes that serve content without authentication are `GET /` (the HTML shell — no user data) and `GET /privacy` (legal requirement). Every other route has `Depends(require_auth)`.

### Endpoint auth map

| Endpoint | Auth required | Notes |
|---|---|---|
| `GET /` | No | Serves `app.html` shell — no user data |
| `GET /privacy` | No | Legal requirement |
| `GET /recipes` | Yes | Returns only the authenticated user's recipes |
| `GET /recipe/{token}` | Yes | Token alone is not sufficient — JWT required |
| `POST /capture` | Yes | Rate-limited per user |
| `POST /upload` | Yes | Rate-limited per user |
| `PATCH /recipe/{token}` | Yes | Ownership check: recipe.user_id must match JWT |
| `DELETE /recipe/{token}` | Yes | Ownership check: recipe.user_id must match JWT |
| `GET /recipe/{token}/translate` | Yes | Calls OpenAI — auth prevents credit abuse |
| `POST /generate-image` | Yes | Calls DALL-E — auth prevents credit abuse |
| `GET /people` | Yes | Returns only the authenticated user's narrators |
| `POST /people` | Yes | |
| `PUT /people/{id}` | Yes | Ownership check: list user's people, verify id exists |
| `DELETE /people/{id}` | Yes | Ownership check: same |
| `DELETE /account` | Yes | Cascades — all recipes, audio files, people, auth user |

### Authentication flow

```
Browser → supabase.auth.signInWithOAuth({ provider: 'google' })
       → Google consent → redirect → Supabase JWT issued

Each API request:
  Authorization: Bearer <supabase-jwt>
       ↓
  FastAPI require_auth dependency
  GET {SUPABASE_URL}/auth/v1/user
    Header: apikey: SUPABASE_ANON_KEY
    Header: Authorization: Bearer <jwt>
  200 → { id, email, user_metadata }   ← user identity for this request
  else → 401 Unauthorized
```

JWT is never stored server-side. Every request re-validates against Supabase. No session store, no token rotation logic to manage.

### Data ownership model

Every user-owned row has a `user_id` column (Supabase Auth UUID). Ownership is enforced at two levels:

**Level 1 — Application layer (Python)**
All queries filter by `user_id`:
```python
sb.table("recipes").select("*").eq("user_id", user_id)
sb.table("people").select("*").eq("user_id", user_id)
```
Mutating endpoints (PATCH, DELETE) fetch the row first and compare `user_id` before acting.

**Level 2 — Database layer (RLS)**
Row Level Security is designed on both tables:
```sql
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON recipes FOR ALL
  USING (user_id::text = auth.uid()::text);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON people FOR ALL
  USING (user_id::text = auth.uid()::text);
```
The server uses the service role key (bypasses RLS), so RLS acts as a backstop against direct anon-key access to the database — not as the primary enforcement. **Note:** RLS dashboard setup is unconfirmed (see D-004 in `docs/BUGS.md`).

### Storage security

| Bucket | Visibility | Access pattern |
|---|---|---|
| `audio` | Private | Server generates 1-hour signed URLs per request via service key. Client never sees storage credentials. |
| `images` | Public | DALL-E images are AI-generated, not personal. Public bucket is intentional. |
| `avatars` (planned) | Public | Narrator photos — once migrated from base64 to Storage. Personal photos stored in a private bucket should be reconsidered before Phase 5. |

Audio filenames are UUIDs — not guessable. Signed URLs expire in 1 hour, limiting window of exposure if a URL is leaked.

### Key separation

| Key | Where used | Scope |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Server only (`tools/storage.py`) | Full DB + Storage access. Never sent to browser. |
| `SUPABASE_ANON_KEY` | Server (JWT validation) + browser (Supabase JS SDK) | Safe to expose — Supabase publishable key. RLS limits what it can do directly. |
| `OPENAI_API_KEY` | Server only (`tools/transcribe.py`, `prompts/`) | Never sent to browser. |

### Rate limiting

```python
_MAX_RECORDINGS_PER_DAY = int(os.environ.get("MAX_RECORDINGS_PER_DAY", "10"))
```

In-memory counter per `user_id`, resets daily. Prevents runaway OpenAI spend from a single account. Resets on server restart — this is abuse prevention for personal use, not a billing-grade quota system.

### CORS

Configured via `ALLOWED_ORIGINS` environment variable. Defaults to `localhost:8080` in development. In production, set to the Railway deployment URL only. Wildcard origins (`*`) are never used.

### Account deletion

`DELETE /account` performs a full cascade:
1. Fetch all recipe rows for the user
2. Delete each audio file from Supabase Storage `audio` bucket
3. Delete all recipe rows
4. Delete all people rows
5. Delete the Supabase auth user (service role admin API)

Steps are executed sequentially. Errors on individual steps are logged but do not halt the sequence — partial deletion is safer than abandoning mid-way. After deletion, the user's Google account can re-register as a fresh account.

### What is intentionally not secured

| Item | Rationale |
|---|---|
| DALL-E images in public `images` bucket | AI-generated — not personal data. Public bucket is correct. |
| Share token on recipe rows | 12-character hex token is the authorization for the share-link use case. Auth is still required to access the recipe via API — the token is not a bypass. |
| In-transit encryption | HTTPS is enforced by Railway. No additional TLS configuration needed. |
| Data at rest encryption | Supabase AES-256 handles this at the infrastructure layer. |
| OpenAI data handling | API tier: no training use, ≤30-day retention. Acceptable for personal archive use. |

### Upload file safety

Every audio upload is validated server-side before Whisper processes it — three checks in order:

| Layer | What it rejects | HTTP |
|---|---|---|
| **Extension allowlist** | `.exe`, `.html`, `.php`, `.zip` etc. Only MP3/M4A/WAV/WebM/OGG/FLAC/AAC/MP4 accepted | 400 |
| **Size cap** | Files > 25 MB (configurable via `MAX_AUDIO_BYTES`; covers ~2 h of compressed audio) | 413 |
| **Magic bytes** | Files whose binary header doesn't match a known audio container — catches renamed executables or HTML files carrying an audio extension | 400 |

Applies to both live recordings and uploaded audio files — both reach the same `POST /capture/process` endpoint. If validation fails, the pipeline aborts and nothing is stored.

### Content moderation

After Whisper + Call A produce the English transcript, the **OpenAI Moderation API** (free, no token cost) is called before Call B and before any data is persisted:

```
Whisper → Call A → _moderate_transcript() → Call B → persist
```

- Checks: hate speech, harassment, violence, sexual content, self-harm
- On flag: HTTP 422 returned, temp file deleted, no audio/transcript/recipe stored anywhere
- On API error: non-fatal — logged and pipeline continues (transient failures don't block family recordings)
- Applies identically to live-recorded and uploaded audio

**Audio lifecycle on moderation failure:**
1. Bytes in RAM → temp file on disk → Whisper → transcript flagged by Moderation API
2. `HTTPException(422)` raised immediately
3. `finally: os.unlink(tmp_path)` — temp file deleted
4. `POST /capture/save` never called → nothing in Supabase Storage or Postgres

### Known security gaps

| Gap | Severity | Location |
|---|---|---|
| Supabase RLS setup unconfirmed — policies designed but dashboard configuration not verified | High | Supabase dashboard — see D-004 in `docs/BUGS.md` |
| `people.photo_data` stored as base64 in Postgres — should be in private Storage bucket before Phase 5 family sharing | Medium | `tools/storage.py`, `people` table |
| In-memory rate limiter resets on server restart — a user could exploit a Railway redeploy to reset their daily quota | Low | `scripts/serve.py` — **fixed in Phase 1.6** (now Postgres-backed) |
