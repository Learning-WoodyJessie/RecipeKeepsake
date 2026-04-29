# RecipeKeepsake — Core Pipeline PRD

*Brainstorm date: 2026-04-29*
*Status: Approved — ready for /plan*

---

## Goal

Capture grandma narrating a recipe in Telugu, produce a clean structured recipe card and a shareable WhatsApp link with her voice recording attached.

---

## Audience

Two people:
- **You (Pavani)** — hold the phone, trigger the recording, review before sharing
- **Family** — receive a WhatsApp link, open a recipe card + audio playback

---

## Session context

Deliberate sit-down session. Grandma narrates at her own pace — non-linearly, the way she cooks in her head. Jumps between steps, mentions ingredients mid-step, circles back. The pipeline has to reconstruct order, not assume it.

---

## Scope — what we're NOT building

- Real-time transcription or live feedback during recording
- Automated sharing (always human-reviewed before send)
- Edit-in-place UI for family corrections (Phase 2)
- Search / browse archive (Phase 2)
- "Grandma holds the phone herself" flow (Phase 2)

---

## Core Requirements

1. **Record** — mobile web page with a single record button. Tap to start, tap to stop. No app install.
2. **Transcribe** — Whisper API (`language="te"`) produces raw Telugu transcript, preserving English words as-is.
3. **Translate** — Call A: faithful English translation. Preserve all vague terms ("konjam", "to taste", "until it smells right") verbatim. Do not normalize.
4. **Structure** — Call B: extract dish name, ingredients (with quantities), steps (reordered into cooking sequence), and `cook_notes` (vague instructions that can't be structured). Flag any implied steps.
5. **Store** — Supabase insert: audio URL + raw transcript + English translation + structured recipe.
6. **Review** — You see the structured recipe card before anyone else. Edit any field. Approve or discard.
7. **Share** — Generate a WhatsApp-friendly link (`/recipe/[token]`) showing: recipe card + audio playback. Send via `wa.me`.

---

## Success Criteria

- [ ] Record a 3-minute Telugu narration → structured recipe card in < 60 seconds
- [ ] Vague terms ("konjam", "to taste") appear in `cook_notes`, never as a normalized quantity in ingredients
- [ ] Steps are in cooking order even when narrated out of order
- [ ] Shareable link opens on mobile, shows recipe card, plays audio
- [ ] You can edit any field before sharing
- [ ] All LLM/API calls are mocked in tests — no cost to run the suite

---

## Edge Cases & Failure Modes

| Failure | What breaks | Fallback |
|---|---|---|
| Whisper mishears a Telugu word | Garbled ingredient name | Flag with `review_flags` — you catch it in review |
| Grandma doesn't state dish name | Call B can't find dish_name | Infer from ingredients; if unsure, leave blank for review |
| Vague step normalized by LLM | "until it smells right" → "30 minutes" | Call B prompt must explicitly forbid normalization |
| Call A or B API failure | Pipeline stalls | Return partial result + error flag; audio always saved first |
| Recording too long (> 10 min) | Whisper timeout or cost spike | Warn at 10 min; split into chunks if needed (Phase 2) |

---

## Two-step pipeline (locked)

```
Audio recording (Telugu)
  → Whisper (language="te")
      → raw transcript (Telugu + English code-switching)
  → Call A — Translation
      System: "You are a faithful translator. Translate this Telugu recipe narration
               to English. Preserve vague quantities verbatim (konjam, a little,
               to taste, until it smells right). Do not normalize or invent measurements."
      → english_translation
  → Call B — Structuring
      System: "Extract a structured recipe from this English narration.
               Output: dish_name, ingredients [{item, quantity}], steps (in cooking order),
               cook_notes (vague instructions verbatim), review_flags (implied steps).
               Where quantity is vague, put it in cook_notes — NOT in ingredients quantity."
      → structured recipe
  → Supabase insert
  → Review UI
  → Share link
```

---

## Supabase schema

```sql
CREATE TABLE recipes (
  id                  uuid primary key default gen_random_uuid(),
  token               text unique default gen_random_uuid()::text,
  dish_name           text,
  narrator            text default 'Grandma',
  language            text default 'te',
  recorded_at         timestamptz default now(),
  audio_url           text,
  transcript_raw      text,
  transcript_english  text,
  ingredients         jsonb,   -- [{ "item": "moong dal", "quantity": "1 cup" }]
  steps               jsonb,   -- ["Soak moong dal for 4 hours", ...]
  cook_notes          text,    -- "Add oil until it smells right — her words"
  review_flags        jsonb,   -- ["Possible implied step: drain water after soaking"]
  reviewed            boolean default false,
  shared_at           timestamptz
);
```

---

## Phase 0 deliverables (what /plan will cover)

1. `tools/transcribe.py` — Whisper call, return raw transcript
2. `prompts/translate.py` — Call A prompt + LLM call
3. `prompts/structure.py` — Call B prompt + LLM call
4. `tools/storage.py` — Supabase insert/read
5. `scripts/capture.py` — orchestrator: record → transcribe → translate → structure → store
6. `tests/` — full mocked suite for all tools and prompts
7. Review UI and share link — Phase 1

---

## Decisions appended to decisions.log

- [2026-04-29] Two-step pipeline: translate (Call A) separate from structure (Call B). Rejected combined. Because combined normalizes vague measurements.
- [2026-04-29] Human review before share. Rejected auto-share. Because recipe card needs validation — structure may reorder steps incorrectly.
- [2026-04-29] Share via WhatsApp link (/recipe/[token]). Rejected family group page or PDF. Because WhatsApp is what family actually opens.
- [2026-04-29] Phase 0 = CLI pipeline only. Web UI deferred to Phase 1. Because validate the pipeline correctness before building UI on top.
