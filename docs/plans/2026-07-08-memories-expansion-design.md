# Phase 4 — Memories Expansion PRD

**Date:** 2026-07-08  
**Status:** Approved for planning  
**Types in scope:** Song, Story (first two non-recipe types)

---

## Goal

Expand the app beyond recipes so families can preserve songs, lullabies, and family stories — each with voice audio, a clean transcript, and a title — using the same capture flow already in place.

---

## Audience

The Keeper (logged-in contributor) who records a family member singing a lullaby or narrating a family story. The voice recording is the primary keepsake; the transcript is the searchable artifact.

---

## Scope — what we're NOT building

- Call B structuring for song or story (no AI-extracted fields beyond title/transcript — Option A)
- Occasion field on song (deferred — single-screen review, no extra fields)
- Era/people-mentioned field on story (deferred — same reason)
- Remedy and wisdom types (Phase 4B, after song+story are stable)
- DALL-E image generation for song/story (recipe-specific, doesn't translate)
- Per-type translation prompts (same translate.py Call A works for all types)
- Any changes to the WhatsApp message templates (already support all 5 types)

---

## Design Decisions (locked in brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| DB migration | Rename `recipes` → `memories`, `dish_name` → `title` | Schema in CLAUDE.md always targeted `memories`/`title`; "dish_name" on a song is a permanent papercut |
| Pipeline depth | Light (Whisper → translate → store transcript only) | No Call B for song/story — voice + transcript IS the keepsake; reduces hallucination surface area |
| Review step | Single screen — confirm/edit title → save | No AI-extracted structured fields to review for song/story |
| API endpoint names | Keep `/recipe/` and `/recipes/` paths for now | Private API, no external clients — rename is a separate refactor logged as future debt |
| Image generation | Skip for song/story | DALL-E prompt is recipe-specific (vessel/region/garnish/texture); no equivalent for audio-primary types |

---

## Migration — `recipes` → `memories`

### Supabase SQL (run in dashboard SQL editor before deployment)

```sql
-- Rename table
ALTER TABLE recipes RENAME TO memories;

-- Rename column
ALTER TABLE memories RENAME COLUMN dish_name TO title;

-- Update any sequences or policies referencing old name if needed
-- (RLS policies reference column names, not table names — verify after rename)
```

### Code blast radius

| Layer | What changes |
|---|---|
| `tools/storage.py` | `.table("recipes")` → `.table("memories")`, `dish_name` → `title` in all select/insert/update calls |
| `tools/groups.py` | `.table("recipes")` → `.table("memories")`, `dish_name` → `title` in select fields |
| `scripts/serve.py` | `dish_name` → `title` in all endpoint request/response models and query fields |
| `pipeline/persist.py` | `dish_name` → `title` in the insert row dict |
| `prompts/structure.py` | `dish_name` → `title` in the JSON schema and system prompt |
| `prompts/translate_recipe.py` | `dish_name` → `title` in field references |
| `prompts/image.py` | `dish_name` → `title` in prompt construction |
| `tests/` | All mocks using `dish_name` key → `title` |
| `frontend/lib/api.ts` | Response type references |
| `frontend/app/**/page.tsx` | All `memory.dish_name` → `memory.title` (23 hits across pages) |

---

## Song & Story Pipeline

### Capture flow (already built in Phase A)
1. User opens Upload page → selects type: **Song** or **Story**
2. Records voice or uploads audio file (existing flow)
3. Audio uploaded → `POST /save-audio` with `memory_type=song` or `memory_type=story`

### Backend pipeline for song/story
```
Audio file
  → Whisper (language="te", same as recipe)
  → translate_to_english() (Call A — faithful translation)
  → NO Call B (no structuring step)
  → INSERT into memories:
      type = "song" | "story"
      title = NULL (user sets in review)
      transcript_raw = Whisper output
      transcript_english = Call A output
      audio_url = signed URL
      content = NULL (no structured content)
      details = NULL
      notes = NULL
      image_url = NULL (no DALL-E for non-recipe)
```

### Review screen (single screen, non-recipe types)

Currently the 3-step wizard (`/capture` page) always shows all recipe steps.
For song/story: show a single step — title input + save.

```
┌─────────────────────────────────┐
│  🎵 Save Song                   │
│                                 │
│  Title                          │
│  ┌─────────────────────────┐   │
│  │ Lali Lali lullaby       │   │
│  └─────────────────────────┘   │
│                                 │
│  Narrator: Ammamma              │
│  Duration: 1:34                 │
│                                 │
│  ▶ Play recording               │
│                                 │
│  [Save memory →]                │
└─────────────────────────────────┘
```

No ingredient/step editing. No image preview. No review flags shown (no Call B to produce them).

### Memory detail page — song/story display

The detail page already has a type guard (`isAudioMemory`). Extend it:
- **Song/Story** (non-recipe types): show title, narrator, audio player, English transcript (collapsible), tags. No ingredients, no steps, no cook notes.
- Recipe remains unchanged.

---

## Implementation Phases

**Phase 4-M — DB migration** (prerequisite, done in Supabase dashboard + code sweep)
- Supabase SQL: rename `recipes` → `memories`, `dish_name` → `title`
- Code sweep: update all `dish_name` → `title`, `.table("recipes")` → `.table("memories")`
- Run full test suite — must stay at 192+

**Phase 4-A — Backend: song/story save endpoint**
- `/save-audio` already handles `memory_type`
- Confirm the light pipeline path (skip Call B when type ≠ recipe) in `pipeline/`
- Add `title` as a settable field via `PATCH /memory/{token}`

**Phase 4-B — Frontend: single-screen review for non-recipe types**
- Detect `type !== 'recipe'` in the capture/review flow
- Render single-screen title input + save instead of 3-step wizard
- Pass `title` in the save payload

**Phase 4-C — Frontend: song/story detail page rendering**
- Display transcript (collapsible) + audio player for non-recipe types
- Hide ingredients, steps, cook notes sections
- Show type badge (already present)

---

## Success Criteria

1. A recorded song saves with `type=song`, `transcript_raw`, `transcript_english`, `audio_url`, `title` (user-set) — no `content`/`details`/`image_url`.
2. The memory detail page for a song shows the transcript and audio player, not a recipe card.
3. A story works identically to song with `type=story`.
4. All 192 Python tests still pass after the DB migration code sweep.
5. `cd frontend && node_modules/.bin/next build` passes with no TypeScript errors.
6. No existing recipe memories are broken by the migration.

---

## Edge Cases & Failure Modes

| Case | Handling |
|---|---|
| Whisper fails on song audio | Same error path as recipe — `500` with message, no partial save |
| User doesn't set a title in review | `title` nullable — saves as null, shown as "Untitled" in lists |
| Existing recipes after migration | `title` = former `dish_name` value — data preserved by column rename, not re-insert |
| Portal/family queries after migration | `tools/groups.py` references `dish_name` in select fields — must be updated to `title` in migration sweep |
| Frontend caches old field name | Static export rebuild clears this — no stale cache risk post-deploy |

---

## What stays the same

- Whisper configuration (`language="te"`, glossary injection, hallucination stripping)
- Call A translation (`translate_to_english()`) — identical for all types
- Auth, rate limiting, file upload validation
- WhatsApp sharing (already handles all 5 types in `share.ts`)
- Portal visibility toggle
- Family group membership and recipes-from-group queries (after table rename)
