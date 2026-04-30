# RecipeKeepsake — AI Context

Personal multimodal recipe capture system for preserving family recipes.
Records grandma narrating recipes in Telugu, transcribes via Whisper, translates and structures via LLM, stores in Supabase.
Companion web UI (Next.js) for browsing, searching, and playing back recordings.

See `docs/ROADMAP.md` for project history and what comes next.

## Development Workflow

This project uses a 7-step SDLC. Use these slash commands to manage development:

| Command | When to use |
|---|---|
| `/start` | Beginning of any new session — orients Codex to current state |
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

Continuation of the agentic AI learning journey started with BirthdayReminders.
Key new concepts being learned here:

| Layer | Concept being learned |
|---|---|
| `tools/audio.py` | Multimodal input — audio capture + Whisper transcription |
| `tools/transcribe.py` | Language handling — Telugu, code-switching, vague language |
| `prompts/translate.py` | Two-step LLM pipelines — translate then structure (not combined) |
| `prompts/structure.py` | Preserving imprecision — vague measurements are data, not noise |
| `data/` + Supabase | Semantic memory — recipe as structured artifact with raw audio |
| Web UI | Search + playback — making captured knowledge navigable |

---

## Architecture (planned)

```
tools/
  audio.py            ← record audio, upload to Supabase Storage
  transcribe.py       ← Whisper API call (language="te"), return raw transcript
  storage.py          ← Supabase read/write for recipes

prompts/
  translate.py        ← Call A: Telugu → English faithful translation
  structure.py        ← Call B: English text → structured recipe schema
  llm.py              ← LLMProvider ABC (reuse pattern from BirthdayReminders)

data/
  config.yaml         ← LLM provider, Whisper model, Supabase config

scripts/
  capture.py          ← orchestrator: record → transcribe → translate → structure → store
  list_recipes.py     ← browse stored recipes (CLI)

tests/                ← all mocked, no API calls

web/                  ← Next.js UI (TBD — Phase 2)
  app/recipes/        ← browse + search recipes
  app/record/         ← mobile-first recording page
  app/api/            ← Supabase read routes
```

---

## Two-step LLM pipeline (core design decision)

```
Audio recording (Telugu)
  → Whisper (language="te") → raw transcript (Telugu + English code-switching)
  → Call A (Translation): faithful translation to English, preserve vague terms
  → Call B (Structuring): extract dish name, ingredients, steps, cook_notes
  → Supabase insert: { audio_url, transcript_raw, transcript_english, ingredients, steps, cook_notes }
```

**Why two calls, not one:**
Combined translate+structure causes the model to normalize vague measurements ("a little" → "1 tsp"). Keeping them separate lets Call A be a faithful translator and Call B be a structurer — each with a single job.

---

## Recipe storage schema (Supabase)

```sql
CREATE TABLE recipes (
  id            uuid primary key default gen_random_uuid(),
  dish_name     text,
  narrator      text default 'Grandma',
  language      text default 'te',
  recorded_at   timestamptz default now(),
  audio_url     text,
  transcript_raw      text,    -- Whisper output verbatim
  transcript_english  text,    -- Call A output
  ingredients   jsonb,         -- [{ item, quantity }]
  steps         jsonb,         -- ["step 1", "step 2"]
  cook_notes    text,          -- vague instructions preserved verbatim
  review_flags  jsonb,         -- ["possible implied step: drain water"]
  tags          text[]
);
```

---

## Key constraints

- **Two-step translation** — never combine translate + structure into one LLM call
- **Preserve vagueness** — "konjam", "to taste", "until it smells right" are data, not errors
- **Audio is the source of truth** — always store raw audio URL alongside structured recipe
- **Telugu + English code-switching** — Whisper `language="te"` handles it, Call A cleans it up
- **Tests must pass before every push** — all LLM/API calls mocked

## What NOT to change without thought

- Two-step pipeline separation in `prompts/` — see decisions.log for why
- `cook_notes` field — vague measurements live here, NOT normalized into ingredients
- `language="te"` in Whisper call — explicit language improves accuracy for Telugu

---

## Secrets (planned)

| Secret | Description |
|---|---|
| `OPENAI_API_KEY` | Whisper + GPT-4o |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
