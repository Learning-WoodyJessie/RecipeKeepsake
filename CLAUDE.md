# Echoes of Home — AI Context

*"Every family carries a world. Don't let it fade."*

Voice-first family memory preservation app. Core use case: record a grandmother narrating a recipe in Telugu → transcribe via Whisper → translate + structure via LLM → permanent keepsake with audio playback, search, and language switching.

**Stack:** FastAPI (Python) + single-file HTML SPA (`web/app.html`) + Supabase (auth, Postgres, storage) + OpenAI (Whisper, GPT-4o, DALL-E 3). Hosted on Railway.

See `docs/ROADMAP.md` for phase status and what comes next. See `docs/BUGS.md` for open debt.

## Development Workflow

This project uses a 7-step SDLC. Use these slash commands to manage development:

| Command | When to use |
|---|---|
| `/start` | Beginning of any new session — orients Claude to current state |
| `/brainstorm` | Before any new feature — Socratic design, produces a PRD |
| `/plan` | After design is approved — TDD-first implementation plan |
| `/build` | Execute the plan — RED-GREEN-REFACTOR cycle per chunk |
| `/audit` | After building — technical + UX quality gate |
| `/kaizen` | After audit — continuous improvement pass |
| `/log` | Capture bugs, debt, or ideas without starting work |
| `/closeout` | End of session — update docs, commit, push |

Workflow files live in `.agent/workflows/`. Project decisions in `.agent/decisions.log`. Failure patterns in `.agent/gotchas.md`.

---

## Why this project exists

Key new concepts being learned here:

| Layer | Concept being learned |
|---|---|
| `tools/audio.py` | Multimodal input — audio capture + Whisper transcription |
| `tools/transcribe.py` | Language handling — Telugu, code-switching, vague language |
| `prompts/translate.py` | Two-step LLM pipelines — translate then structure (not combined) |
| `prompts/structure.py` | Preserving imprecision — vague details are data, not noise |
| `data/` + Supabase | Semantic memory — memory as structured artifact with raw audio |
| Web UI | Search + playback — making captured knowledge navigable |

---

## Architecture (current — Phases 0–1.5 complete)

```
tools/
  transcribe.py       ← Whisper API, language="te", glossary injection
  storage.py          ← Supabase CRUD: recipes, people, images, translations
  people.py           ← narrator/people CRUD (Supabase-backed, not localStorage)
  config.py           ← load_config() — single source; import from here only

prompts/
  translate.py        ← Call A: Telugu → English (faithful, preserves vagueness)
  structure.py        ← Call B: English → structured recipe JSON
  translate_recipe.py ← Multi-language recipe field translation + cache management
  image.py            ← DALL-E 3 with recipe-enriched prompt (vessel/region/garnish/texture)
  llm.py              ← LLMProvider ABC + OpenAIProvider

scripts/
  serve.py            ← FastAPI app — all endpoints JWT auth-gated
  capture.py          ← CLI pipeline orchestrator

web/
  app.html            ← single-file SPA (~4 000 lines); served by FastAPI
  assets/
    echoes-logo.png   ← brand logo (waveform+heart circle, 1254×1254)

tests/                ← 81 tests, all mocked (run: python -m pytest tests/ -q)
data/
  config.yaml         ← LLM model, Supabase config, rate limits
  glossary.yaml       ← Telugu cooking vocabulary injected into Whisper + Call A
```

---

## Code Flow Diagram

```
[Audio Recording]                 tools/audio.py
       |
       v
[Whisper Transcription]          tools/transcribe.py
       |
       v
[Raw Telugu Transcript]          stored in pipeline data
       |
       v
[Translation LLM]                prompts/translate.py
       |
       v
[English Transcript]             returned by translate_to_english()
       |
       v
[Structuring LLM]                prompts/structure.py
       |
       v
[Structured Memory Data]         returned by structure_recipe()
       |
       v
[Supabase Storage]               tools/storage.py
       |
       v
[Saved Memory / Recipe]         stored through insert_recipe()
       |
       v
[Web UI / Review]               web/app/record/, web/app/memories/
```

**Note:** `prompts/llm.py` defines `LLMProvider(ABC)`.
`ABC` is Python's Abstract Base Class mechanism: it makes `LLMProvider`
an interface-like class so subclasses like `OpenAIProvider` must implement
`generate()` before they can be instantiated.

---

## End-to-End User Flow

1. **Add People** — Manage family narrators (name, relationship, photo, bio)
2. **Add Profile** — Set up user profile (name, preferences, settings)
3. **Record Voice** — Capture audio narration from selected narrator
4. **Convert to Recipe** — Process audio through transcription, translation, and structuring pipeline
5. **Save Recipe** — Review and save structured recipe with audio, transcripts, and metadata

---

## Two-step LLM pipeline (core design decision)

```
Audio recording (Telugu)
  → Whisper (language="te") → raw transcript (Telugu + English code-switching)
  → Call A (Translation): faithful translation to English, preserve vague terms
  → Call B (Structuring): extract memory title, content, details, notes
  → Supabase insert: { audio_url, transcript_raw, transcript_english, content, details, notes }
```

**Why two calls, not one:**
Combined translate+structure causes the model to normalize vague details ("a little" → "1 tsp"). Keeping them separate lets Call A be a faithful translator and Call B be a structurer — each with a single job.

---

## Memory storage schema (Supabase)

```sql
CREATE TABLE memories (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  narrator      text default 'Grandma',
  language      text default 'te',
  recorded_at   timestamptz default now(),
  audio_url     text,
  transcript_raw      text,    -- Whisper output verbatim
  transcript_english  text,    -- Call A output
  content       jsonb,         -- structured content (e.g., for recipes: ingredients)
  details       jsonb,         -- ["detail 1", "detail 2"]
  notes         text,          -- vague details preserved verbatim
  review_flags  jsonb,         -- ["possible implied detail: ..."]
  tags          text[]
);
```

---

## Key constraints

- **Two-step translation** — never combine translate + structure into one LLM call
- **Preserve vagueness** — "konjam", "to taste", "until it smells right" are data, not errors
- **Audio is the source of truth** — always store raw audio URL alongside structured memory
- **Telugu + English code-switching** — Whisper `language="te"` handles it, Call A cleans it up
- **Tests must pass before every push** — all LLM/API calls mocked

## Architectural Decisions — Quick Reference

These are locked. Read `.agent/decisions.log` for full reasoning before reconsidering any of them.

| Decision | What | Why |
|---|---|---|
| **Two-step pipeline** | Translate (Call A) and Structure (Call B) are separate LLM calls | Combined call normalises vague measurements — that imprecision is the valuable data |
| **`cook_notes` field** | Vague quantities live verbatim here, never normalised into `ingredients` | "Until it smells right" is authentic voice, not noise |
| **`language="te"` on Whisper** | Explicit, never auto-detect | Explicit Telugu improves accuracy; glossary injected via `initial_prompt` |
| **Unicode script enforcement** | `_SCRIPT_RULES` in `prompts/translate_recipe.py` as first system prompt rule | Without it GPT-4o romanises Telugu ("konchem" instead of "కొంచెం") |
| **Auth on every endpoint** | Supabase JWT via `Depends(require_auth)` on all recipe/translate/image routes | Personal family archive — no content accessible without login |
| **People profiles in Supabase** | `tools/people.py` CRUD; `localStorage` only as session cache | Voice recordings + photos + bios = sensitive data needing encryption + cross-device access |
| **Invite-only sharing (Phase 5)** | No public share tokens | Family recordings must never be accessible without authentication |
| **DALL-E enriched prompt** | `prompts/image.py` extracts vessel/region/garnish/texture from recipe data | Plain dish-name prompts produce generic stock images; recipe data makes them dish-specific |
| **`load_config()` lives in `tools/config.py`** | Import from here only | `data/` has no `__init__.py` — importing from `data.config` causes a 500 |

---

## Documentation Standards

All Python files must include module-level docstrings with the following structure:

```
"""
Purpose: [One sentence describing the file's role in the system]

What: [What the file contains/implements]

How: [How it achieves its purpose, key mechanisms]

Why: [Why this design/component exists, design rationale]
"""
```

Classes and key functions should have similar docstrings. This ensures maintainability and helps new contributors understand the codebase quickly.

---

## Current State (last updated 2026-05-05)

- **Tests:** 97 passing, 0 failures (`python -m pytest tests/ -q`)
- **Active bugs:** D-001 (config duplication), D-002 (Whisper fabrication), D-003 (generate-image missing fields), D-005 (user_id extraction repeated) — see `docs/BUGS.md`
- **Completed phases:** 0 (CLI pipeline), 1 (web app), 1.5 (UI polish + security hardening), 1.6 (scale hardening)
- **Next priority:** Phase 1.7 — Frontend Migration (`web/app.html` → `web/nextjs/`)

### Known gaps

| Gap | Detail | File |
|---|---|---|
| **`/generate-image` endpoint** | Standalone regenerate-image endpoint still only accepts `dish_name` — doesn't pass `ingredients`/`steps`/`cook_notes` to the enriched prompt (D-003) | `scripts/serve.py:~457` |
| **Android app identity** | `capacitor.config.json` still references old branding — needs rename to "Echoes of Home" + regenerated icons before Play Store | `capacitor.config.json` |
| **Translation cache clearing** | `clear_translation_cache(lang)` exists in `tools/storage.py` but has no API surface — only callable directly in Python | `tools/storage.py` |
| **Frontend** | `web/app.html` is the production frontend (4 900 lines). `web/nextjs/` is an incomplete scaffold — Phase 1.7 will migrate | `web/` |

---

## Secrets

| Secret | Description |
|---|---|
| `OPENAI_API_KEY` | Whisper + GPT-4o + DALL-E |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_ANON_KEY` | Supabase anon key (used in auth fallback header) |
| `SUPABASE_JWT_SECRET` | JWT signing secret for local token verification (eliminates network round-trip) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `ENV` | Set to `production` on Railway — controls fail-closed auth behaviour |
| `MAX_CAPTURE_PER_DAY` | Daily capture limit per user (default: 10) |
| `MAX_TRANSLATE_PER_DAY` | Daily translate limit per user (default: 50) |
| `MAX_IMAGE_PER_DAY` | Daily image generation limit per user (default: 20) |
